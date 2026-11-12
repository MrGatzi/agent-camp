/**
 * Pulls every table out of the office Durable Object (GET /api/export) and writes a Postgres
 * dump: one CREATE TABLE + COPY block per table, then indexes and identity counters.
 *
 *   AGENT_OFFICE_URL=https://agent-office.<subdomain>.workers.dev CONNECTOR_PASSWORD=... \
 *     bun apps/server/scripts/export-postgres.ts [agent-office.sql]
 *   createdb agent_office && psql -v ON_ERROR_STOP=1 -d agent_office -f agent-office.sql
 *
 * Costs one Worker request per page (1000 rows, 20 timelapse frames), a few hundred at most.
 */
import { createWriteStream } from "node:fs";
import {
  type ExportValue,
  PG_COPY_END,
  pgCopyRow,
  pgCopyStart,
  pgCreateTable,
  pgFinishTable,
} from "../src/core/pgdump.ts";
import type { ExportTable } from "../src/core/store.ts";

const base = process.env.AGENT_OFFICE_URL?.replace(/\/+$/, "");
const password = process.env.CONNECTOR_PASSWORD;
const outPath = process.argv[2] ?? "agent-office.sql";
if (!base || !password) {
  console.error(
    "usage: AGENT_OFFICE_URL=... CONNECTOR_PASSWORD=... bun apps/server/scripts/export-postgres.ts [out.sql]",
  );
  process.exit(2);
}

async function get<T>(query: string): Promise<T> {
  const res = await fetch(`${base}/api/export${query}`, {
    headers: { authorization: `Bearer ${password}` },
  });
  if (!res.ok) throw new Error(`GET /api/export${query}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const out = createWriteStream(outPath);
const write = (s: string) =>
  new Promise<void>((resolve, reject) => out.write(s, (err) => (err ? reject(err) : resolve())));

const meta = await get<{ version: string; exportedAt: number; tables: ExportTable[] }>("");
await write(
  `-- Agent Office export from ${base}, server ${meta.version}, ${new Date(meta.exportedAt).toISOString()}\n` +
    "-- Timestamps (ts, updated) are Unix milliseconds; JSON lives in TEXT columns.\n" +
    "SET client_encoding = 'UTF8';\nBEGIN;\n\n",
);

let mismatch = false;
for (const t of meta.tables) {
  await write(pgCreateTable(t));
  await write(pgCopyStart(t));
  const limit = t.columns.some((c) => /BLOB/i.test(c.type)) ? 20 : 1000;
  let after = 0;
  let count = 0;
  for (;;) {
    const page = await get<{
      rows: { rowid: number; values: ExportValue[] }[];
      next: number | null;
    }>(`?table=${encodeURIComponent(t.name)}&after=${after}&limit=${limit}`);
    for (const r of page.rows) await write(pgCopyRow(t, r.values));
    count += page.rows.length;
    if (page.next === null) break;
    after = page.next;
  }
  await write(PG_COPY_END);
  await write(pgFinishTable(t));
  await write("\n");
  // rows written while the export runs (history, messages) can make this differ slightly
  if (count !== t.rows) mismatch = true;
  console.log(`${t.name}: ${count} rows${count !== t.rows ? ` (counted ${t.rows} at start)` : ""}`);
}

await write("COMMIT;\n");
await new Promise<void>((resolve) => out.end(resolve));
console.log(
  `wrote ${outPath}${mismatch ? " (row counts moved during the export, see above)" : ""}`,
);
