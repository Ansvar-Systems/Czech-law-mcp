#!/usr/bin/env tsx
/**
 * Paid-tier database builder for Czech Law MCP server.
 *
 * ADDITIVE -- does NOT rebuild from scratch. Instead:
 *   1. Verifies a base (free-tier) database exists
 *   2. Adds paid-only tables and schema extensions
 *   3. Creates FTS5 virtual tables and sync triggers
 *   4. Updates db_metadata to reflect the premium tier
 *
 * Czech-specific fields:
 *   - case_law: court (US, NS, NSS), case_number, ecli, rapporteur,
 *               decision_type (nalez, usneseni), legal_area
 *   - preparatory_works: type (snemovni_tisk, senatni_tisk, stenograficky_zaznam),
 *                        legislative_period, print_number, chamber (PSP, Senat), sponsor
 *   - agency_guidance: agency (UOHS, UOOU), decision_number, decision_type
 *
 * The full build pipeline for paid tier is:
 *   npm run build:db                                     # Step 1: Build base from seeds
 *   npx tsx scripts/build-db-paid.ts                     # Step 2: Create premium tables + FTS triggers
 *   npx tsx scripts/ingest-uohs.ts --resume              # Step 3: UOHS competition decisions
 *   npx tsx scripts/ingest-nalus.ts --resume             # Step 4: Constitutional Court (US) case law
 *   npx tsx scripts/ingest-psp.ts --resume               # Step 5: Parliamentary materials (PSP/Senat)
 *   npx tsx scripts/build-db-paid.ts                     # Step 6: Re-run to update metadata counts
 *
 * Usage:
 *   npx tsx scripts/build-db-paid.ts
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

const DB_PATH = path.resolve(process.cwd(), 'data', 'database.db');

// ---------------------------------------------------------------------------
// Paid-tier schema extensions
// ---------------------------------------------------------------------------

const PAID_TABLES = `
-- Case law from Czech courts (paid tier)
-- Source: NALUS (Ustavni soud), NS, NSS open data
CREATE TABLE IF NOT EXISTS case_law (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL UNIQUE,
  court TEXT NOT NULL,
  case_number TEXT,
  ecli TEXT,
  rapporteur TEXT,
  decision_type TEXT,
  legal_area TEXT,
  decision_date TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  keywords TEXT,
  inserted_at TEXT DEFAULT (datetime('now'))
);

-- Extended case law with full-text judgments (paid tier)
CREATE TABLE IF NOT EXISTS case_law_full (
  id INTEGER PRIMARY KEY,
  case_law_id INTEGER NOT NULL REFERENCES case_law(id),
  full_text TEXT NOT NULL,
  headnotes TEXT,
  dissenting_opinions TEXT,
  UNIQUE(case_law_id)
);

-- Preparatory works / parliamentary materials (paid tier)
-- Source: PSP (Poslanecka snemovna), Senat open data
CREATE TABLE IF NOT EXISTS preparatory_works (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  legislative_period TEXT,
  print_number TEXT,
  chamber TEXT,
  sponsor TEXT,
  title TEXT NOT NULL,
  date TEXT,
  content TEXT,
  related_statute_id TEXT,
  inserted_at TEXT DEFAULT (datetime('now'))
);

-- Provision versions for tracking legislative changes (paid tier)
CREATE TABLE IF NOT EXISTS provision_versions (
  id INTEGER PRIMARY KEY,
  provision_id INTEGER NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  valid_from TEXT,
  valid_to TEXT,
  content TEXT NOT NULL,
  change_description TEXT,
  amending_act TEXT,
  inserted_at TEXT DEFAULT (datetime('now')),
  UNIQUE(provision_id, version_number)
);

-- Agency guidance / enforcement decisions (paid tier)
-- Source: UOHS (competition), UOOU (data protection)
CREATE TABLE IF NOT EXISTS agency_guidance (
  id INTEGER PRIMARY KEY,
  agency TEXT NOT NULL,
  document_id TEXT NOT NULL UNIQUE,
  decision_number TEXT,
  decision_type TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  full_text TEXT,
  issued_date TEXT,
  url TEXT,
  related_statute_id TEXT,
  inserted_at TEXT DEFAULT (datetime('now'))
);
`;

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

const PAID_INDEXES = `
-- case_law indexes
CREATE INDEX IF NOT EXISTS idx_case_law_court
  ON case_law(court);
CREATE INDEX IF NOT EXISTS idx_case_law_decision_date
  ON case_law(decision_date);
CREATE INDEX IF NOT EXISTS idx_case_law_case_number
  ON case_law(case_number);
CREATE INDEX IF NOT EXISTS idx_case_law_ecli
  ON case_law(ecli);
CREATE INDEX IF NOT EXISTS idx_case_law_rapporteur
  ON case_law(rapporteur);
CREATE INDEX IF NOT EXISTS idx_case_law_decision_type
  ON case_law(decision_type);
CREATE INDEX IF NOT EXISTS idx_case_law_legal_area
  ON case_law(legal_area);

-- case_law_full indexes
CREATE INDEX IF NOT EXISTS idx_case_law_full_case
  ON case_law_full(case_law_id);

-- preparatory_works indexes
CREATE INDEX IF NOT EXISTS idx_prep_works_type
  ON preparatory_works(type);
CREATE INDEX IF NOT EXISTS idx_prep_works_chamber
  ON preparatory_works(chamber);
CREATE INDEX IF NOT EXISTS idx_prep_works_legislative_period
  ON preparatory_works(legislative_period);
CREATE INDEX IF NOT EXISTS idx_prep_works_print_number
  ON preparatory_works(print_number);
CREATE INDEX IF NOT EXISTS idx_prep_works_date
  ON preparatory_works(date);
CREATE INDEX IF NOT EXISTS idx_prep_works_statute
  ON preparatory_works(related_statute_id);

-- provision_versions indexes
CREATE INDEX IF NOT EXISTS idx_prov_versions_provision
  ON provision_versions(provision_id);
CREATE INDEX IF NOT EXISTS idx_prov_versions_valid_from
  ON provision_versions(valid_from);

-- agency_guidance indexes
CREATE INDEX IF NOT EXISTS idx_agency_guidance_agency
  ON agency_guidance(agency);
CREATE INDEX IF NOT EXISTS idx_agency_guidance_decision_number
  ON agency_guidance(decision_number);
CREATE INDEX IF NOT EXISTS idx_agency_guidance_decision_type
  ON agency_guidance(decision_type);
CREATE INDEX IF NOT EXISTS idx_agency_guidance_issued_date
  ON agency_guidance(issued_date);
CREATE INDEX IF NOT EXISTS idx_agency_guidance_statute
  ON agency_guidance(related_statute_id);
`;

// ---------------------------------------------------------------------------
// FTS5 virtual tables
// ---------------------------------------------------------------------------

const PAID_FTS = `
-- FTS5 for case law search
CREATE VIRTUAL TABLE IF NOT EXISTS case_law_fts USING fts5(
  title, summary, keywords,
  content='case_law',
  content_rowid='id',
  tokenize='unicode61'
);

-- FTS5 for preparatory works search
CREATE VIRTUAL TABLE IF NOT EXISTS preparatory_works_fts USING fts5(
  title, content, print_number,
  content='preparatory_works',
  content_rowid='id',
  tokenize='unicode61'
);

-- FTS5 for agency guidance search
CREATE VIRTUAL TABLE IF NOT EXISTS agency_guidance_fts USING fts5(
  title, summary, full_text,
  content='agency_guidance',
  content_rowid='id',
  tokenize='unicode61'
);
`;

// ---------------------------------------------------------------------------
// FTS5 sync triggers
// ---------------------------------------------------------------------------

const PAID_TRIGGERS = `
-- case_law FTS triggers
CREATE TRIGGER IF NOT EXISTS case_law_fts_insert AFTER INSERT ON case_law BEGIN
  INSERT INTO case_law_fts(rowid, title, summary, keywords)
  VALUES (new.id, COALESCE(new.title, ''), COALESCE(new.summary, ''),
          COALESCE(new.keywords, ''));
END;

CREATE TRIGGER IF NOT EXISTS case_law_fts_delete AFTER DELETE ON case_law BEGIN
  INSERT INTO case_law_fts(case_law_fts, rowid, title, summary, keywords)
  VALUES ('delete', old.id, COALESCE(old.title, ''), COALESCE(old.summary, ''),
          COALESCE(old.keywords, ''));
END;

CREATE TRIGGER IF NOT EXISTS case_law_fts_update AFTER UPDATE ON case_law BEGIN
  INSERT INTO case_law_fts(case_law_fts, rowid, title, summary, keywords)
  VALUES ('delete', old.id, COALESCE(old.title, ''), COALESCE(old.summary, ''),
          COALESCE(old.keywords, ''));
  INSERT INTO case_law_fts(rowid, title, summary, keywords)
  VALUES (new.id, COALESCE(new.title, ''), COALESCE(new.summary, ''),
          COALESCE(new.keywords, ''));
END;

-- preparatory_works FTS triggers
CREATE TRIGGER IF NOT EXISTS prep_works_fts_insert AFTER INSERT ON preparatory_works BEGIN
  INSERT INTO preparatory_works_fts(rowid, title, content, print_number)
  VALUES (new.id, COALESCE(new.title, ''), COALESCE(new.content, ''),
          COALESCE(new.print_number, ''));
END;

CREATE TRIGGER IF NOT EXISTS prep_works_fts_delete AFTER DELETE ON preparatory_works BEGIN
  INSERT INTO preparatory_works_fts(preparatory_works_fts, rowid, title, content, print_number)
  VALUES ('delete', old.id, COALESCE(old.title, ''), COALESCE(old.content, ''),
          COALESCE(old.print_number, ''));
END;

CREATE TRIGGER IF NOT EXISTS prep_works_fts_update AFTER UPDATE ON preparatory_works BEGIN
  INSERT INTO preparatory_works_fts(preparatory_works_fts, rowid, title, content, print_number)
  VALUES ('delete', old.id, COALESCE(old.title, ''), COALESCE(old.content, ''),
          COALESCE(old.print_number, ''));
  INSERT INTO preparatory_works_fts(rowid, title, content, print_number)
  VALUES (new.id, COALESCE(new.title, ''), COALESCE(new.content, ''),
          COALESCE(new.print_number, ''));
END;

-- agency_guidance FTS triggers
CREATE TRIGGER IF NOT EXISTS agency_guidance_fts_insert AFTER INSERT ON agency_guidance BEGIN
  INSERT INTO agency_guidance_fts(rowid, title, summary, full_text)
  VALUES (new.id, COALESCE(new.title, ''), COALESCE(new.summary, ''),
          COALESCE(new.full_text, ''));
END;

CREATE TRIGGER IF NOT EXISTS agency_guidance_fts_delete AFTER DELETE ON agency_guidance BEGIN
  INSERT INTO agency_guidance_fts(agency_guidance_fts, rowid, title, summary, full_text)
  VALUES ('delete', old.id, COALESCE(old.title, ''), COALESCE(old.summary, ''),
          COALESCE(old.full_text, ''));
END;

CREATE TRIGGER IF NOT EXISTS agency_guidance_fts_update AFTER UPDATE ON agency_guidance BEGIN
  INSERT INTO agency_guidance_fts(agency_guidance_fts, rowid, title, summary, full_text)
  VALUES ('delete', old.id, COALESCE(old.title, ''), COALESCE(old.summary, ''),
          COALESCE(old.full_text, ''));
  INSERT INTO agency_guidance_fts(rowid, title, summary, full_text)
  VALUES (new.id, COALESCE(new.title, ''), COALESCE(new.summary, ''),
          COALESCE(new.full_text, ''));
END;
`;

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function buildPaidTier(): void {
  console.log('Building paid-tier extensions for Czech Law MCP...\n');

  // Verify base database exists
  if (!fs.existsSync(DB_PATH)) {
    console.error(
      `ERROR: No base database found at ${DB_PATH}\n` +
      `Run 'npm run build:db' first to create the base database from seeds.`,
    );
    process.exit(1);
  }

  const sizeBefore = fs.statSync(DB_PATH).size;
  console.log(`  Base database: ${DB_PATH} (${(sizeBefore / 1024 / 1024).toFixed(1)} MB)`);

  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  // Verify base schema exists
  const hasLegalDocs = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='legal_documents'",
  ).get();

  if (!hasLegalDocs) {
    console.error('ERROR: Base database is missing legal_documents table. Rebuild with: npm run build:db');
    db.close();
    process.exit(1);
  }

  // Create db_metadata table if it does not exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS db_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Add paid-tier tables
  console.log('  Creating paid-tier tables...');
  db.exec(PAID_TABLES);

  // Add indexes
  console.log('  Creating indexes...');
  db.exec(PAID_INDEXES);

  // Add FTS5 virtual tables
  console.log('  Creating FTS5 virtual tables...');
  db.exec(PAID_FTS);

  // Add FTS sync triggers
  console.log('  Creating FTS sync triggers...');
  db.exec(PAID_TRIGGERS);

  // Report what is available
  const docCount = (db.prepare('SELECT COUNT(*) as c FROM legal_documents').get() as { c: number }).c;
  const provCount = (db.prepare('SELECT COUNT(*) as c FROM legal_provisions').get() as { c: number }).c;
  const caseCount = (db.prepare('SELECT COUNT(*) as c FROM case_law').get() as { c: number }).c;
  const caseFullCount = (db.prepare('SELECT COUNT(*) as c FROM case_law_full').get() as { c: number }).c;
  const prepCount = (db.prepare('SELECT COUNT(*) as c FROM preparatory_works').get() as { c: number }).c;
  const provVersionCount = (db.prepare('SELECT COUNT(*) as c FROM provision_versions').get() as { c: number }).c;
  const agencyCount = (db.prepare('SELECT COUNT(*) as c FROM agency_guidance').get() as { c: number }).c;

  console.log(`\n  Base data available:`);
  console.log(`    Legal documents:     ${docCount.toLocaleString()}`);
  console.log(`    Provisions:          ${provCount.toLocaleString()}`);

  console.log(`\n  Paid-tier tables:`);
  console.log(`    case_law:            ${caseCount.toLocaleString()} rows`);
  console.log(`    case_law_full:       ${caseFullCount.toLocaleString()} rows`);
  console.log(`    preparatory_works:   ${prepCount.toLocaleString()} rows`);
  console.log(`    provision_versions:  ${provVersionCount.toLocaleString()} rows`);
  console.log(`    agency_guidance:     ${agencyCount.toLocaleString()} rows`);

  // Update metadata to premium tier
  const paidTables = [
    'case_law', 'case_law_full',
    'preparatory_works', 'provision_versions',
    'agency_guidance',
  ];

  const upsertMeta = db.prepare(`
    INSERT INTO db_metadata (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const updateMeta = db.transaction(() => {
    upsertMeta.run('tier', 'premium');
    upsertMeta.run('schema_version', '2');
    upsertMeta.run('built_at', new Date().toISOString());
    upsertMeta.run('builder', 'build-db-paid.ts');
    upsertMeta.run('jurisdiction', 'CZ');
    upsertMeta.run('paid_tables', paidTables.join(','));
    upsertMeta.run('case_law_source', 'NALUS (Ustavni soud), NS (Nejvyssi soud), NSS (Nejvyssi spravni soud)');
    upsertMeta.run('prep_works_source', 'PSP (Poslanecka snemovna), Senat open data');
    upsertMeta.run('prep_works_licence', 'Public domain (Czech parliamentary records)');
    upsertMeta.run('agency_guidance_source', 'UOHS (competition authority), UOOU (data protection)');
  });
  updateMeta();

  db.pragma('wal_checkpoint(TRUNCATE)');
  db.exec('VACUUM');
  db.exec('ANALYZE');
  db.close();

  const sizeAfter = fs.statSync(DB_PATH).size;
  console.log(
    `\nPaid-tier build complete.` +
    `\n  Size: ${(sizeBefore / 1024 / 1024).toFixed(1)} MB -> ${(sizeAfter / 1024 / 1024).toFixed(1)} MB` +
    `\n  Tier: premium` +
    `\n  Output: ${DB_PATH}`,
  );

  console.log(`\n  To populate paid-tier tables:`);
  console.log(`    1. npx tsx scripts/ingest-uohs.ts --resume      -- UOHS competition decisions`);
  console.log(`    2. npx tsx scripts/ingest-nalus.ts --resume     -- Constitutional Court case law`);
  console.log(`    3. npx tsx scripts/ingest-psp.ts --resume       -- Parliamentary materials (PSP/Senat)`);
}

buildPaidTier();
