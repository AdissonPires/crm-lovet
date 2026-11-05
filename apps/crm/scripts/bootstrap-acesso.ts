/**
 * Cria a identidade de login (schema `shared`) a partir do que existe no CRM e
 * define a senha inicial de quem ainda não tem senha.
 *
 * Os UUIDs são PRESERVADOS: as tabelas do CRM referenciam workspace_id e
 * user_id, e manter os mesmos identificadores evita reescrever chaves.
 * Idempotente: rodar de novo não duplica nem troca senha já definida.
 *
 * A senha NÃO fica no código: informe INITIAL_PASSWORD (mínimo 12 caracteres)
 * e peça para cada pessoa trocá-la no primeiro acesso ("Minha senha").
 *
 * Uso (a partir da raiz do repositório):
 *   ADMIN_DATABASE_URL=postgresql://admin:senha@127.0.0.1:5472/lovet \
 *   INITIAL_PASSWORD='uma-senha-forte-aqui' \
 *   npx tsx apps/crm/scripts/bootstrap-acesso.ts
 */
import { Pool } from "pg";
import { hashPassword } from "@lovet/auth";

const url = process.env.ADMIN_DATABASE_URL;
if (!url) throw new Error("ADMIN_DATABASE_URL nao definida.");
const senhaInicial = process.env.INITIAL_PASSWORD ?? "";
if (senhaInicial.length < 12) throw new Error("Defina INITIAL_PASSWORD com pelo menos 12 caracteres.");

/** Papel no CRM → papel no nível do tenant. */
function tenantRoleFor(crmRole: string): "owner" | "admin" | "member" {
  if (crmRole === "owner") return "owner";
  if (crmRole === "admin" || crmRole === "manager") return "admin";
  return "member";
}

async function main() {
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: workspaces } = await client.query<{ id: string; name: string; slug: string; plan: string; status: string }>(
      `SELECT id, name, slug, plan, status FROM crm.workspaces`,
    );
    for (const w of workspaces) {
      await client.query(
        `INSERT INTO shared.tenants (id, name, slug, plan, status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, plan = excluded.plan`,
        [w.id, w.name, w.slug, w.plan, w.status === "active" ? "active" : "suspended"],
      );
      await client.query(
        `INSERT INTO shared.subscriptions (tenant_id, module, status)
         VALUES ($1, 'crm', 'active')
         ON CONFLICT (tenant_id, module) DO UPDATE SET status = excluded.status`,
        [w.id],
      );
    }

    const { rows: users } = await client.query<{ id: string; email: string; name: string }>(
      `SELECT id, email, name FROM crm.users`,
    );
    for (const u of users) {
      await client.query(
        `INSERT INTO shared.users (id, email, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET email = excluded.email, name = excluded.name`,
        [u.id, u.email, u.name],
      );
    }

    const { rows: members } = await client.query<{ workspace_id: string; user_id: string; role: string }>(
      `SELECT workspace_id, user_id, role FROM crm.workspace_members`,
    );
    for (const m of members) {
      await client.query(
        `INSERT INTO shared.memberships (tenant_id, user_id, tenant_role)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, user_id) DO UPDATE SET tenant_role = excluded.tenant_role`,
        [m.workspace_id, m.user_id, tenantRoleFor(m.role)],
      );
      await client.query(
        `INSERT INTO shared.module_roles (tenant_id, user_id, module, role)
         VALUES ($1, $2, 'crm', $3)
         ON CONFLICT (tenant_id, user_id, module) DO UPDATE SET role = excluded.role`,
        [m.workspace_id, m.user_id, m.role],
      );
    }

    // Senha inicial só para quem ainda não tem.
    const hash = await hashPassword(senhaInicial);
    const { rowCount } = await client.query(
      `UPDATE shared.users SET password_hash = $1 WHERE password_hash IS NULL`,
      [hash],
    );

    await client.query("COMMIT");
    console.log(`tenants: ${workspaces.length} · usuários: ${users.length} · senhas iniciais definidas: ${rowCount ?? 0}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
