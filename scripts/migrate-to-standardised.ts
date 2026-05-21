/**
 * Q9b — one-shot migration from Czech-law-mcp's legacy schema to the
 * mcp-base v0.1.x standardised schema. Phase 7.7 production-correct
 * (extended from the pilot version to cover the full mcp-base tool surface).
 *
 * Output schema (matches mcp-base spec §5.6 + §5.7 + Phase 7.3/7.4 additions):
 *
 *   provisions(
 *     id INTEGER PRIMARY KEY,
 *     canonical_ref TEXT NOT NULL,
 *     body TEXT,
 *     is_substantive INTEGER NOT NULL DEFAULT 1  -- §5.7, Phase 7.3
 *   )
 *
 *   content(
 *     id INTEGER PRIMARY KEY,
 *     source_url TEXT NOT NULL,
 *     license_code TEXT
 *   )
 *
 *   instruments(
 *     id INTEGER PRIMARY KEY,
 *     name TEXT NOT NULL,
 *     year INTEGER
 *   )
 *
 *   eu_basis(  -- Phase 7.4 extended columns
 *     id INTEGER PRIMARY KEY,
 *     celex TEXT NOT NULL,
 *     provision_id INTEGER,
 *     reference_type TEXT,
 *     alignment_status TEXT,
 *     in_force_from TEXT,
 *     in_force_to TEXT
 *   )
 *
 *   content_fts USING fts5(  -- Phase 7.3 FTS5 search index
 *     body,
 *     content='provisions',
 *     content_rowid='id'
 *   )
 *
 * Linkage contract: provisions.id == content.id == content_fts.rowid.
 * mcp-base's get_provision LEFT JOINs content; search_legislation MATCHes
 * content_fts and JOINs provisions+content. Per spec §3.4.2 every provision
 * MUST have a content row with non-empty source_url.
 *
 * The is_substantive flag follows the §5.7 standardisation of the
 * previously per-MCP "Účinnost / Přechodná" heuristic. For Q9b first-pass
 * migration we mark all migrated rows substantive=1; refinement (detecting
 * transitional / effective-date provisions and marking them 0) is a
 * follow-up that can land without re-migrating the whole corpus.
 *
 * EU basis: the Czech-law legacy eu_references shape doesn't carry
 * reference_type / alignment_status / in_force_from / in_force_to.
 * We populate those columns with NULL (the schema requires the COLUMNS
 * exist for gate 9, not that they're populated). EU tools return empty
 * results for now; future per-source ingestion enhancements can fill them.
 *
 * Run:
 *   node --import tsx scripts/migrate-to-standardised.ts \
 *     [--input data/database.db] \
 *     [--output data/database.standardised.db]
 */

import Database from "better-sqlite3";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";

interface Args {
  input: string;
  output: string;
}

function parseArgs(argv: readonly string[]): Args {
  const a: Args = {
    input: "data/database.db",
    output: "data/database.standardised.db",
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--input") a.input = argv[++i] ?? a.input;
    else if (k === "--output") a.output = argv[++i] ?? a.output;
    else {
      process.stderr.write(`unknown arg: ${k}\n`);
      process.exit(2);
    }
  }
  return a;
}

function deriveYear(issuedDate: string | null): number | null {
  if (typeof issuedDate !== "string" || issuedDate.length < 4) return null;
  const y = Number(issuedDate.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

function buildCanonicalRef(documentId: string, section: string): string {
  const lastColon = documentId.lastIndexOf(":");
  const lawSlug =
    lastColon >= 0 ? documentId.slice(lastColon + 1) : documentId;
  const cleanSection = section.trim().replace(/\s+/g, "");
  return `CZ:law:${lawSlug}:art.${cleanSection}`;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (!existsSync(args.input)) {
    process.stderr.write(`input not found: ${args.input}\n`);
    process.exit(2);
  }

  mkdirSync(dirname(args.output), { recursive: true });
  if (existsSync(args.output)) unlinkSync(args.output);

  const src = new Database(args.input, { readonly: true, fileMustExist: true });
  const dst = new Database(args.output);

  dst.pragma("journal_mode = DELETE");
  dst.pragma("foreign_keys = ON");

  dst.exec(`
    CREATE TABLE provisions (
      id INTEGER PRIMARY KEY,
      canonical_ref TEXT NOT NULL,
      body TEXT,
      is_substantive INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX idx_provisions_canonical_ref ON provisions(canonical_ref);

    CREATE TABLE content (
      id INTEGER PRIMARY KEY,
      source_url TEXT NOT NULL,
      license_code TEXT
    );

    CREATE TABLE instruments (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      year INTEGER
    );

    CREATE TABLE eu_basis (
      id INTEGER PRIMARY KEY,
      celex TEXT NOT NULL,
      provision_id INTEGER,
      reference_type TEXT,
      alignment_status TEXT,
      in_force_from TEXT,
      in_force_to TEXT
    );
  `);

  // ---- instruments ----
  const insertInstrument = dst.prepare(
    `INSERT INTO instruments (name, year) VALUES (?, ?) RETURNING id`,
  );
  const documents = src
    .prepare(`SELECT id, title, issued_date, url FROM legal_documents`)
    .all() as Array<{
      id: string;
      title: string;
      issued_date: string | null;
      url: string | null;
    }>;

  const docMeta = new Map<string, { instrumentId: number; url: string | null }>();
  const insertInstrumentsTx = dst.transaction(() => {
    for (const d of documents) {
      const row = insertInstrument.get(d.title, deriveYear(d.issued_date)) as {
        id: number;
      };
      docMeta.set(d.id, { instrumentId: row.id, url: d.url });
    }
  });
  insertInstrumentsTx();
  process.stdout.write(`Instruments: ${documents.length}\n`);

  // ---- provisions + content (joined per-row by id) ----
  const insertProvision = dst.prepare(
    `INSERT INTO provisions (id, canonical_ref, body, is_substantive)
     VALUES (?, ?, ?, 1)`,
  );
  const insertContent = dst.prepare(
    `INSERT INTO content (id, source_url, license_code) VALUES (?, ?, NULL)`,
  );
  const provisions = src
    .prepare(
      `SELECT id, document_id, provision_ref, section, content FROM legal_provisions`,
    )
    .all() as Array<{
      id: number;
      document_id: string;
      provision_ref: string;
      section: string;
      content: string;
    }>;

  let provisionCount = 0;
  let skippedNoUrl = 0;
  const insertTx = dst.transaction(() => {
    for (const p of provisions) {
      const meta = docMeta.get(p.document_id);
      if (meta === undefined || meta.url === null) {
        skippedNoUrl += 1;
        continue;
      }
      const canonicalRef = buildCanonicalRef(p.document_id, p.section);
      insertProvision.run(p.id, canonicalRef, p.content);
      insertContent.run(p.id, meta.url);
      provisionCount += 1;
    }
  });
  insertTx();
  process.stdout.write(
    `Provisions: ${provisionCount} migrated, ${skippedNoUrl} skipped (no document URL)\n`,
  );

  // ---- content_fts (FTS5 search index over provisions.body) ----
  // External-content FTS5: rowid = provisions.id, body comes from provisions.body.
  // Build with `INSERT INTO content_fts(content_fts) VALUES('rebuild')` for
  // contentless FTS5; here we use external-content mode for live sync
  // semantics. After population, populate with a single bulk INSERT.
  dst.exec(`
    CREATE VIRTUAL TABLE content_fts USING fts5(
      body,
      content='provisions',
      content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );
  `);
  dst.exec(`INSERT INTO content_fts(content_fts) VALUES('rebuild')`);
  const ftsCount = (dst.prepare(`SELECT COUNT(*) AS n FROM content_fts`).get() as { n: number }).n;
  process.stdout.write(`FTS5 content_fts: ${ftsCount} rows indexed\n`);

  // ---- eu_basis (extended columns; populated NULL for Q9b first-pass) ----
  let euBasisCount = 0;
  try {
    const euRefs = src
      .prepare(
        `SELECT er.provision_id AS provision_id, ed.celex AS celex
         FROM eu_references er
         JOIN eu_documents ed ON ed.id = er.eu_document_id
         WHERE er.provision_id IS NOT NULL`,
      )
      .all() as Array<{ provision_id: number; celex: string }>;
    const insertEuBasis = dst.prepare(
      `INSERT INTO eu_basis (celex, provision_id, reference_type, alignment_status, in_force_from, in_force_to)
       VALUES (?, ?, NULL, NULL, NULL, NULL)`,
    );
    const euTx = dst.transaction(() => {
      for (const e of euRefs) {
        if (e.celex === null || e.celex === "") continue;
        insertEuBasis.run(e.celex, e.provision_id);
        euBasisCount += 1;
      }
    });
    euTx();
  } catch (err) {
    process.stderr.write(
      `eu_basis migration skipped: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
  process.stdout.write(`EU basis: ${euBasisCount}\n`);

  dst.exec("VACUUM");
  dst.close();
  src.close();

  process.stdout.write(`\nWrote standardised DB to ${args.output}\n`);
}

main();
