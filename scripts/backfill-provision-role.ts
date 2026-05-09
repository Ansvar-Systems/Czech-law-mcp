// Vendored from Ansvar-Architecture-Documentation@04c77ec8 per
// docs/guides/law-mcp-golden-standard.md Pattern 13.6.
// Source: scripts/backfill-provision-role.ts
// SHA-256 of canonical: fa6ed941e0c16616fffabc3d4fc64199dd56959afa24acea983e32fe42b3bb7a
//
// Local change vs canonical: imports classifyProvision from
// '../src/utils/classify-provision.js' (ESM .js extension; the original
// canonical script imports from a relative './ingestion/classify-provision').
// Re-vendor when canonical changes; preserve only the import-path adjustment.
//
// Idempotent backfill: reads each row in legal_provisions, classifies via
// classify-provision.ts, writes provision_role + provision_form + content_hash
// into the metadata JSON column. Preserves any existing non-classifier keys.
//
// Spec: docs/superpowers/specs/2026-05-08-mcp-search-quality-standard-design.md §1.6
// Standard: docs/guides/law-mcp-golden-standard.md Pattern 13.6

import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { classifyProvision } from '../src/utils/classify-provision.js';

export interface BackfillResult {
  updated: number;
  skipped: number;
}

function canonicalContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim();
}

function contentHash(content: string): string {
  return createHash('sha256').update(canonicalContent(content), 'utf8').digest('hex');
}

export function backfillProvisionRole(db: Database.Database, language: string): BackfillResult {
  const rows = db.prepare(
    'SELECT id, section, content, metadata FROM legal_provisions'
  ).all() as { id: number; section: string; content: string; metadata: string | null }[];

  const update = db.prepare('UPDATE legal_provisions SET metadata = ? WHERE id = ?');

  let updated = 0;
  let skipped = 0;

  const txn = db.transaction(() => {
    for (const row of rows) {
      const existing = row.metadata ? JSON.parse(row.metadata) : {};
      const cls = classifyProvision(language, { section: row.section, content: row.content });
      const merged = {
        ...existing,
        provision_role: cls.role,
        provision_form: cls.form,
        content_hash: contentHash(row.content),
      };
      const next = JSON.stringify(merged);
      if (next === row.metadata) {
        skipped++;
        continue;
      }
      update.run(next, row.id);
      updated++;
    }
  });
  txn();

  // Stamp db_metadata so consumers can detect last backfill timestamp.
  db.prepare(
    'INSERT OR REPLACE INTO db_metadata (key, value) VALUES (?, ?)'
  ).run('provision_role_backfill_at', new Date().toISOString());

  return { updated, skipped };
}

// CLI entry-point. Example: npx tsx scripts/backfill-provision-role.ts data/database.db cs
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , dbPath, language] = process.argv;
  if (!dbPath || !language) {
    console.error('usage: backfill-provision-role.ts <db-path> <iso-639-1-language>');
    process.exit(2);
  }
  const db = new Database(dbPath);
  db.pragma('busy_timeout = 5000');
  const result = backfillProvisionRole(db, language);
  console.log(`backfill complete: updated=${result.updated} skipped=${result.skipped}`);
  db.close();
}
