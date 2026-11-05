import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL nao definida — necessaria para drizzle-kit.");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
  // Restringe o drizzle ao schema do CRM. Sem isso ele consideraria shared
  // como "objetos desconhecidos" e proporia removê-lo.
  schemaFilter: ["crm"],
});
