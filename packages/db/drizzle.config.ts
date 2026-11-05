import { defineConfig } from "drizzle-kit";

// O schema `shared` nao pertence a nenhum modulo: e escrito somente pela
// superficie administrativa. Por isso as migrations dele rodam com um usuario
// administrativo, e nao com crm_app.
if (!process.env.ADMIN_DATABASE_URL) {
  throw new Error("ADMIN_DATABASE_URL nao definida — necessaria para migrar o schema shared.");
}

export default defineConfig({
  schema: "./src/shared.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.ADMIN_DATABASE_URL },
  // Restringe ao schema shared para o drizzle nao propor remover crm.
  schemaFilter: ["shared"],
});
