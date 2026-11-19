// Writes accounts.sql: the tables Better Auth needs (user, session, account, verification), as Better Auth
// itself creates them for SQLite, plus our own table of who accepted which version of the terms.
// Run from 03_app/: node scripts/make_auth_schema.mjs
import { writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { getMigrations } from "better-auth/db/migration";

const { compileMigrations } = await getMigrations({
  database: new DatabaseSync(":memory:"),
  emailAndPassword: { enabled: true },
  socialProviders: { google: { clientId: "x", clientSecret: "x" } },
});
const sql = `-- User accounts (Better Auth) and the terms each user accepted. Made by scripts/make_auth_schema.mjs.
-- Run once: npm run db:accounts:local / npm run db:accounts:remote
${(await compileMigrations()).replaceAll("create table", "create table if not exists").replaceAll("create index", "create index if not exists")}

create table if not exists "consent" ("userId" text not null references "user" ("id") on delete cascade, "termsVersion" text not null, "acceptedAt" text not null, primary key ("userId", "termsVersion"));
`;
writeFileSync("accounts.sql", sql);
console.log(sql);
