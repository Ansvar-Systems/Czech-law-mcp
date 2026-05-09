/**
 * Golden contract tests for Czech Law MCP.
 * Skipped automatically when database.db is not present OR empty.
 *
 * Per memory feedback_contract_test_skip_on_empty_db_2026_05_07: tests must
 * skip on EMPTY DB, not just missing DB — CI's build:db can produce a
 * schema-only file that satisfies existsSync but has no rows.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import * as path from 'path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../../data/database.db');

let dbAvailable = existsSync(DB_PATH);
if (dbAvailable) {
  // Confirm the DB has non-zero provisions; an empty schema-only DB should
  // skip just like a missing DB.
  try {
    const probe = new Database(DB_PATH, { readonly: true });
    const row = probe.prepare('SELECT COUNT(*) AS n FROM legal_provisions').get() as { n: number };
    if (row.n === 0) dbAvailable = false;
    probe.close();
  } catch {
    dbAvailable = false;
  }
}

let db: InstanceType<typeof Database>;

describe.skipIf(!dbAvailable)('Czech Law MCP — Golden Contract Tests', () => {
  beforeAll(() => {
    db = new Database(DB_PATH, { readonly: true });
    db.pragma('busy_timeout = 5000');
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

    // Pattern 13.10 — operational hygiene keys mandatory in db_metadata
    it('should have fts5_schema_version (Pattern 13.10)', () => {
      const row = db.prepare(
        "SELECT value FROM db_metadata WHERE key = 'fts5_schema_version'"
      ).get() as { value: string } | undefined;
      expect(row).toBeDefined();
      expect(row!.value).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should have fts5_tokenizer set to unicode61 remove_diacritics 2 (Pattern 13.7 + 13.10)', () => {
      const row = db.prepare(
        "SELECT value FROM db_metadata WHERE key = 'fts5_tokenizer'"
      ).get() as { value: string } | undefined;
      expect(row).toBeDefined();
      expect(row!.value).toBe('unicode61 remove_diacritics 2');
    });
  });

  // ── Pattern 13 search-quality contract ───────────────────────────────
  // These tests assert that the §13.1-§13.10 contract holds against the
  // actually-built canary DB. Each maps to one of the four customer-
  // reported defects from 2026-05-08.
  describe('Pattern 13 — Search Quality (Gate 5.8)', () => {
    it('§13.7 — diacritic-folded tokens match each other', () => {
      // 'kybernetická' and 'kyberneticka' must match the same provisions.
      const withDia = db.prepare(
        "SELECT COUNT(*) AS n FROM provisions_fts WHERE provisions_fts MATCH 'kybernetická'"
      ).get() as { n: number };
      const noDia = db.prepare(
        "SELECT COUNT(*) AS n FROM provisions_fts WHERE provisions_fts MATCH 'kyberneticka'"
      ).get() as { n: number };
      expect(withDia.n).toBeGreaterThan(0);
      expect(withDia.n).toBe(noDia.n);
    });

    it('§13.6 — provision_role classifier produced non-empty effectiveness/transitional buckets', () => {
      // If the classifier broke (e.g. plain field-name change), all rows would
      // collapse to substantive. Assert the buckets exist.
      const rows = db.prepare(
        "SELECT json_extract(metadata, '$.provision_role') AS role, COUNT(*) AS n FROM legal_provisions GROUP BY role"
      ).all() as { role: string; n: number }[];
      const byRole = Object.fromEntries(rows.map(r => [r.role, r.n]));
      expect(byRole.substantive ?? 0).toBeGreaterThan(0);
      expect(byRole.effectiveness ?? 0).toBeGreaterThan(0);
      expect(byRole.transitional ?? 0).toBeGreaterThan(0);
    });

    it('§13.4 — every provision has a 64-char content_hash', () => {
      const row = db.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN length(json_extract(metadata, '$.content_hash')) = 64 THEN 1 ELSE 0 END) AS hashed
        FROM legal_provisions
      `).get() as { total: number; hashed: number };
      expect(row.hashed).toBe(row.total);
    });

    it('§13.3 — legal_documents has populated publisher + license columns', () => {
      const row = db.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN publisher IS NOT NULL AND publisher != '' THEN 1 ELSE 0 END) AS with_pub,
          SUM(CASE WHEN license IS NOT NULL AND license != '' THEN 1 ELSE 0 END) AS with_lic
        FROM legal_documents
      `).get() as { total: number; with_pub: number; with_lic: number };
      expect(row.with_pub).toBe(row.total);
      expect(row.with_lic).toBe(row.total);
    });
  });

  // Search-handler ranking fixtures (Gate 5.8). Each fixture asserts that
  // a known-substantive provision of the expected statute appears in the
  // top-N results. Mirror copy of these fixtures lives in
  // backstage/catalog/fleet-manifests/czech-law.json — the audit script
  // probes the gateway with the manifest version, this block probes the
  // local DB. Both must pass for Gate 5.8 to clear.
  describe('Pattern 13 — Search ranking fixtures (Gate 5.8)', () => {
    interface Fixture {
      query: string;
      expected_statute: string;
      max_rank: number;
      role?: 'substantive' | 'transitional' | 'effectiveness';
    }
    const FIXTURES: Fixture[] = [
      {
        query: 'osobní údaje',
        expected_statute: '110/2019',
        max_rank: 5,
        role: 'substantive',
      },
      {
        query: 'trestní odpovědnost',
        expected_statute: '113/1973',
        max_rank: 5,
        role: 'substantive',
      },
      {
        query: 'ochrana osobních údajů zaměstnanců',
        expected_statute: '227/2000',
        max_rank: 5,
        role: 'substantive',
      },
    ];

    for (const fx of FIXTURES) {
      it(`"${fx.query}" — ${fx.expected_statute} appears in top-${fx.max_rank}`, async () => {
        const { searchLegislation } = await import('../../src/tools/search-legislation.js');
        // Inline DB open keeps the test independent of beforeAll's busy_timeout
        // setting (the production index.ts/http-server.ts open paths set their
        // own pragmas; this mirrors that contract exactly).
        const r = await searchLegislation(db, { query: fx.query, limit: fx.max_rank });
        const ranks = r.results.map((row, i) => ({
          rank: i + 1,
          doc_id: row.document_id,
          title: row.document_title,
          role: row.provision_role,
        }));
        const match = ranks.find(
          (r) =>
            r.doc_id.includes(fx.expected_statute) ||
            r.title?.includes(fx.expected_statute),
        );
        expect(match, `expected ${fx.expected_statute} in top-${fx.max_rank}, got: ${JSON.stringify(ranks)}`).toBeDefined();
        if (fx.role) {
          expect(match!.role).toBe(fx.role);
        }
      });
    }
  });

  // §13.5 multi-token degradation — assert the 4-token Czech query that
  // hung 8s on prod completes well under the latency budget locally.
  describe('Pattern 13.5 — Multi-token degradation', () => {
    it('"ochrana osobních údajů zaměstnanců" completes < 1000ms with results', async () => {
      const { searchLegislation } = await import('../../src/tools/search-legislation.js');
      const t0 = Date.now();
      const r = await searchLegislation(db, {
        query: 'ochrana osobních údajů zaměstnanců',
        limit: 5,
      });
      const elapsed = Date.now() - t0;
      expect(elapsed).toBeLessThan(1000);
      expect(r.results.length).toBeGreaterThan(0);
    });
  });

  // §13.4 dedup contract — every result triple (doc_id, ref, hash) unique.
  describe('Pattern 13.4 — Dedup', () => {
    it('search results have unique (document_id, provision_ref, content_hash) triples', async () => {
      const { searchLegislation } = await import('../../src/tools/search-legislation.js');
      const r = await searchLegislation(db, { query: 'osobní údaje', limit: 10 });
      const sigs = r.results.map(
        (row) => `${row.document_id}::${row.provision_ref}::${row.content_hash}`,
      );
      expect(new Set(sigs).size).toBe(sigs.length);
    });
  });

  // §13.3 source attribution on every search result.
  describe('Pattern 13.3 — Source attribution on search responses', () => {
    it('every result has populated publisher + license + content_hash', async () => {
      const { searchLegislation } = await import('../../src/tools/search-legislation.js');
      const r = await searchLegislation(db, { query: 'osobní údaje', limit: 5 });
      expect(r.results.length).toBeGreaterThan(0);
      for (const row of r.results) {
        expect(row.publisher).toBeTruthy();
        expect(row.license).toBeTruthy();
        expect(row.content_hash).toMatch(/^[0-9a-f]{64}$/);
      }
    });
  });

  // §13.6 default-substantive filter behaviour.
  describe('Pattern 13.6 — Default substantive filter', () => {
    it('without include_non_substantive, only substantive results return', async () => {
      const { searchLegislation } = await import('../../src/tools/search-legislation.js');
      // 'účinnost' is the keyword that classifies a provision as
      // effectiveness — searching for it WITHOUT include_non_substantive
      // should return only substantive provisions whose CONTENT mentions
      // it (not the role-classified effectiveness clauses themselves).
      const r = await searchLegislation(db, { query: 'účinnost', limit: 10 });
      for (const row of r.results) {
        expect(row.provision_role).toBe('substantive');
      }
    });

    it('with include_non_substantive, effectiveness results may surface', async () => {
      const { searchLegislation } = await import('../../src/tools/search-legislation.js');
      // We can't assert that an effectiveness row WILL appear (depends on
      // BM25 ordering) — just that the filter is no longer applied. Sanity
      // check: more results returnable than the substantive-only call.
      const restricted = await searchLegislation(db, { query: 'účinnost', limit: 50 });
      const inclusive = await searchLegislation(db, {
        query: 'účinnost',
        limit: 50,
        include_non_substantive: true,
      });
      expect(inclusive.results.length).toBeGreaterThanOrEqual(restricted.results.length);
    });
  });
});
