/**
 * Golden contract tests for Czech Law MCP.
 * Skipped automatically when database.db is not present (e.g. CI without data).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../../data/database.db');
const dbAvailable = existsSync(DB_PATH);

let db: InstanceType<typeof Database>;

describe.skipIf(!dbAvailable)('Czech Law MCP — Golden Contract Tests', () => {
  beforeAll(() => {
    db = new Database(DB_PATH, { readonly: true });
    db.pragma('journal_mode = DELETE');
  });

  // ── Database integrity ───────────────────────────────────────────────
  describe('Database integrity', () => {
    it('should have legal documents (45 000+)', () => {
      const row = db.prepare('SELECT COUNT(*) as cnt FROM legal_documents').get() as { cnt: number };
      expect(row.cnt).toBeGreaterThanOrEqual(45_000);
    });

    it('should have provisions (460 000+)', () => {
      const row = db.prepare('SELECT COUNT(*) as cnt FROM legal_provisions').get() as { cnt: number };
      expect(row.cnt).toBeGreaterThanOrEqual(460_000);
    });

    it('should have FTS index rows', () => {
      const row = db.prepare('SELECT COUNT(*) as cnt FROM provisions_fts').get() as { cnt: number };
      expect(row.cnt).toBeGreaterThan(0);
    });

    it('should have EU documents', () => {
      const row = db.prepare('SELECT COUNT(*) as cnt FROM eu_documents').get() as { cnt: number };
      expect(row.cnt).toBeGreaterThanOrEqual(10);
    });

    it('should have EU cross-references', () => {
      const row = db.prepare('SELECT COUNT(*) as cnt FROM eu_references').get() as { cnt: number };
      expect(row.cnt).toBeGreaterThanOrEqual(10);
    });
  });

  // ── Key Czech laws present ───────────────────────────────────────────
  describe('Key laws present', () => {
    it('should contain the Civil Code (89/2012 Sb.)', () => {
      const row = db.prepare(
        "SELECT id, title FROM legal_documents WHERE id = 'cz:89/2012'"
      ).get() as { id: string; title: string } | undefined;
      expect(row).toBeDefined();
      expect(row!.title).toContain('občanský zákoník');
    });

    it('should contain the Criminal Code (40/2009 Sb.)', () => {
      const row = db.prepare(
        "SELECT id, title FROM legal_documents WHERE id = 'cz:40/2009'"
      ).get() as { id: string; title: string } | undefined;
      expect(row).toBeDefined();
      expect(row!.title).toContain('trestní zákoník');
    });

    it('should contain the Cybersecurity Act (181/2014 Sb.)', () => {
      const row = db.prepare(
        "SELECT id, title FROM legal_documents WHERE id = 'cz:181/2014'"
      ).get() as { id: string; title: string } | undefined;
      expect(row).toBeDefined();
      expect(row!.title).toContain('kybernetické bezpečnosti');
    });

    it('should contain the Personal Data Processing Act (110/2019 Sb.)', () => {
      const row = db.prepare(
        "SELECT id, title FROM legal_documents WHERE id = 'cz:110/2019'"
      ).get() as { id: string; title: string } | undefined;
      expect(row).toBeDefined();
      expect(row!.title).toContain('osobních údajů');
    });
  });

  // ── Article / provision retrieval ────────────────────────────────────
  describe('Article retrieval', () => {
    it('should retrieve provisions for Civil Code (cz:89/2012)', () => {
      const rows = db.prepare(
        "SELECT id, section, substr(content, 1, 100) as excerpt FROM legal_provisions WHERE document_id = 'cz:89/2012' LIMIT 5"
      ).all() as { id: number; section: string; excerpt: string }[];
      expect(rows.length).toBeGreaterThanOrEqual(3);
      expect(rows[0].section).toBe('1');
    });

    it('should retrieve provisions for Cybersecurity Act (cz:181/2014)', () => {
      const rows = db.prepare(
        "SELECT id, section FROM legal_provisions WHERE document_id = 'cz:181/2014'"
      ).all() as { id: number; section: string }[];
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  // ── Full-text search ─────────────────────────────────────────────────
  describe('Full-text search', () => {
    it('should find results for "ochrana" (protection)', () => {
      const rows = db.prepare(
        "SELECT rowid FROM provisions_fts WHERE provisions_fts MATCH 'ochrana' LIMIT 5"
      ).all();
      expect(rows.length).toBeGreaterThan(0);
    });

    it('should find results for "kybernetická" (cyber)', () => {
      const rows = db.prepare(
        "SELECT rowid FROM provisions_fts WHERE provisions_fts MATCH 'kybernetická' LIMIT 5"
      ).all();
      expect(rows.length).toBeGreaterThan(0);
    });

    it('should return no results for nonsense term', () => {
      const rows = db.prepare(
        "SELECT rowid FROM provisions_fts WHERE provisions_fts MATCH 'xyznonexistent99' LIMIT 5"
      ).all();
      expect(rows.length).toBe(0);
    });
  });

  // ── EU cross-references ──────────────────────────────────────────────
  describe('EU cross-references', () => {
    it('should link Czech provisions to EU directives or regulations', () => {
      const row = db.prepare(
        "SELECT COUNT(*) as cnt FROM eu_references WHERE reference_type = 'references'"
      ).get() as { cnt: number };
      expect(row.cnt).toBeGreaterThan(0);
    });

    it('should have EU document entries with EUR-Lex URLs', () => {
      const row = db.prepare(
        "SELECT id, url_eur_lex FROM eu_documents WHERE url_eur_lex IS NOT NULL LIMIT 1"
      ).get() as { id: string; url_eur_lex: string } | undefined;
      expect(row).toBeDefined();
      expect(row!.url_eur_lex).toContain('eur-lex.europa.eu');
    });
  });

  // ── Negative tests ───────────────────────────────────────────────────
  describe('Negative tests', () => {
    it('should return no results for fictional document', () => {
      const row = db.prepare(
        "SELECT COUNT(*) as cnt FROM legal_provisions WHERE document_id = 'fictional-law-2099'"
      ).get() as { cnt: number };
      expect(row.cnt).toBe(0);
    });

    it('should return no document for nonexistent ID', () => {
      const row = db.prepare(
        "SELECT * FROM legal_documents WHERE id = 'cz:999999/9999'"
      ).get();
      expect(row).toBeUndefined();
    });
  });

  // ── list_sources metadata ────────────────────────────────────────────
  describe('list_sources metadata', () => {
    it('should have db_metadata table entries', () => {
      const row = db.prepare('SELECT COUNT(*) as cnt FROM db_metadata').get() as { cnt: number };
      expect(row.cnt).toBeGreaterThan(0);
    });

    it('should report jurisdiction as CZ', () => {
      const row = db.prepare(
        "SELECT value FROM db_metadata WHERE key = 'jurisdiction'"
      ).get() as { value: string } | undefined;
      expect(row).toBeDefined();
      expect(row!.value).toBe('CZ');
    });

    it('should report tier as free', () => {
      const row = db.prepare(
        "SELECT value FROM db_metadata WHERE key = 'tier'"
      ).get() as { value: string } | undefined;
      expect(row).toBeDefined();
      expect(row!.value).toBe('free');
    });

    it('should have schema_version 2', () => {
      const row = db.prepare(
        "SELECT value FROM db_metadata WHERE key = 'schema_version'"
      ).get() as { value: string } | undefined;
      expect(row).toBeDefined();
      expect(row!.value).toBe('2');
    });
  });
});
