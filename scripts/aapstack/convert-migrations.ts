// Converts supabase/migrations/*.sql into AapStack (OwnDatabase) migrations in aapstack/migrations/.
//   npx tsx scripts/aapstack/convert-migrations.ts [project_schema]   (default: project_remotejobs)
//
// AapStack runs each migration as the project's owner role with search_path = <project schema>:
//   * objects are created unqualified (no "public." prefix) so they land in the project schema
//   * extensions (pg_trgm, unaccent, vector) are enabled in the dashboard and live in "public"
//   * a project can't put triggers on the shared auth.users table → profiles are created by
//     bind_device() at first sign-in instead
//   * SECURITY DEFINER functions pin search_path to the project schema
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const schema = process.argv[2] ?? "project_remotejobs";
if (!/^project_[a-z0-9_]+$/.test(schema)) throw new Error(`Unexpected schema name ${schema}`);
const src = new URL("../../supabase/migrations/", import.meta.url);
const out = new URL("../../aapstack/migrations/", import.meta.url);
mkdirSync(out, { recursive: true });

export function convert(sql: string, target: string): string {
  let s = sql;
  s = s.replace(/^create schema if not exists extensions;\n/m, "");
  s = s.replace(/^create extension if not exists (\w+) with schema extensions;\n/gm, "-- extension $1: enable it in AapStack → Database → Extensions (installed in public)\n");
  s = s.replace(/drop trigger if exists mk_jobs_on_auth_user_created on auth\.users;\ncreate trigger mk_jobs_on_auth_user_created after insert on auth\.users\n\s+for each row execute function public\.mk_jobs_handle_new_user\(\);\n/,
    "-- (AapStack: no trigger on the shared auth.users table; bind_device() creates the profile at first sign-in)\n");
  s = s.replace(/set search_path = public, extensions/g, `set search_path = ${target}, public`);
  s = s.replace(/set search_path = public\b/g, `set search_path = ${target}, public`);
  s = s.replace(/\bextensions\./g, "__EXT__.");
  s = s.replace(/(?<![\w"])public\./g, "");
  s = s.replace(/__EXT__\./g, "public.");
  s = s.replace(/schemaname = 'public'/g, "schemaname = current_schema()");
  return `-- Converted for AapStack (schema ${target}) from supabase/migrations by scripts/aapstack/convert-migrations.ts — do not edit by hand.\n${s}`;
}

const files = readdirSync(src).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
for (const f of files) {
  const sql = convert(readFileSync(new URL(f, src), "utf8"), schema);
  if (/(?<![\w"])public\.(?!gin_trgm_ops|unaccent|similarity|vector\b)/.test(sql.replace(/--.*$/gm, ""))) throw new Error(`${f}: unexpected public. reference left`);
  if (/auth\.users\s+for each row|on auth\.users\b(?!\s*\()/.test(sql.replace(/--.*$/gm, "").replace(/references auth\.users/g, ""))) throw new Error(`${f}: auth.users trigger left`);
  writeFileSync(new URL(f, out), sql);
}
writeFileSync(new URL("../ALL_MIGRATIONS.sql", out),
  `-- All migrations in order, for the AapStack SQL editor (prefer "odb db push" or scripts/aapstack/deploy.mjs).\n-- Schema: ${schema}\n\n` +
  files.map((f) => `-- ===== ${f} =====\n` + readFileSync(new URL(f, out), "utf8")).join("\n"));
console.log(`converted ${files.length} migrations for ${schema} → aapstack/migrations/`);
