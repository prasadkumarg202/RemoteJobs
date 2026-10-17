// Prints the district backfill VALUES used by migration 20261014000003_districts.sql.
import { DISTRICTS } from "../supabase/functions/_shared/engine/districts.ts";
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const pat = (words: string[]) => `\\m(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\M`;
const rows: string[] = [];
for (const d of DISTRICTS) {
  if (d.localities?.length) rows.push(`  (${q(d.slug)}, ${q(d.state === "AP" ? "Andhra Pradesh" : "Telangana")}, 1, ${q(pat(d.localities))})`);
  rows.push(`  (${q(d.slug)}, ${q(d.state === "AP" ? "Andhra Pradesh" : "Telangana")}, 2, ${q(pat(d.aliases))})`);
}
console.log(rows.join(",\n"));
