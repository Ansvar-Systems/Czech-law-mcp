/**
 * Core tool tests for Czech Law MCP.
 * Tests against the built database (data/database.db).
 *
 * Requires the 1.2 GB database file — skipped automatically in CI
 * or any environment where data/database.db is absent.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from '@ansvar/mcp-sqlite';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { getProvision } from '../src/tools/get-provision.js';
import { searchLegislation } from '../src/tools/search-legislation.js';
import { listSources } from '../src/tools/list-sources.js';

const DB_PATH = resolve(import.meta.dirname, '..', 'data', 'database.db');
const HAS_DB = existsSync(DB_PATH);

describe.skipIf(!HAS_DB)('Czech Law MCP Tools', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    db = new Database(DB_PATH, { readonly: true });
  });

  afterAll(() => {
    db.close();
  });

  describe('list_sources', () => {
    it('returns source metadata and database stats', async () => {
      const result = await listSources(db);
      expect(result.results).toBeDefined();
      expect(result.results.database.document_count).toBeGreaterThanOrEqual(10);
      expect(result.results.database.provision_count).toBeGreaterThanOrEqual(4000);
      expect(result.results.database.tier).toBe('free');
    });

    it('has populated legal definitions from real statutes', () => {
      const row = db.prepare('SELECT COUNT(*) as count FROM definitions').get() as { count: number };
      expect(Number(row.count)).toBeGreaterThanOrEqual(150);
    });
  });

  describe('get_provision', () => {
    it('retrieves ZZOU § 1 by direct ID', async () => {
      const result = await getProvision(db, { document_id: 'cz:110/2019', provision_ref: '§ 1' });
      expect(result.results.length).toBe(1);
      expect(result.results[0].content).toContain('Tento zákon zapracovává');
      expect(result.results[0].document_id).toBe('cz:110/2019');
    });

    it('retrieves ZKB § 1 by short name', async () => {
      const result = await getProvision(db, { document_id: 'ZKB', provision_ref: '§ 1' });
      expect(result.results.length).toBe(1);
      expect(result.results[0].content).toContain('kybernetické bezpečnosti');
    });

    it('retrieves trestní zákoník § 230', async () => {
      const result = await getProvision(db, { document_id: 'cz:40/2009', provision_ref: '§ 230' });
      expect(result.results.length).toBe(1);
      expect(result.results[0].content).toContain('neoprávněně získá přístup');
      expect(result.results[0].content).toContain('počítačovému systému');
    });

    it('retrieves občanský zákoník § 2985', async () => {
      const result = await getProvision(db, { document_id: 'OZ', provision_ref: '§ 2985' });
      expect(result.results.length).toBe(1);
      expect(result.results[0].content).toContain('obchodní tajemství');
    });

    it('retrieves ZEK § 89', async () => {
      const result = await getProvision(db, { document_id: 'ZEK', provision_ref: '§ 89' });
      expect(result.results.length).toBe(1);
      expect(result.results[0].content).toContain('důvěrnost zpráv');
    });

    it('retrieves ZSVD § 3', async () => {
      const result = await getProvision(db, { document_id: 'ZSVD', provision_ref: '§ 3' });
      expect(result.results.length).toBe(1);
      expect(result.results[0].content).toContain('Kvalifikovaný poskytovatel');
    });

    it('returns all provisions for a document when no ref is provided', async () => {
      const result = await getProvision(db, { document_id: 'cz:110/2019' });
      expect(result.results.length).toBeGreaterThanOrEqual(60);
    });

    it('returns empty for non-existent law', async () => {
      const result = await getProvision(db, { document_id: 'Zákon č. 999/2099', provision_ref: '§ 1' });
      expect(result.results).toHaveLength(0);
    });

    it('returns empty for non-existent provision', async () => {
      const result = await getProvision(db, { document_id: 'cz:110/2019', provision_ref: '§ 999' });
      expect(result.results).toHaveLength(0);
    });
  });

  describe('search_legislation', () => {
    it('finds provisions matching "osobních údajů"', async () => {
      const result = await searchLegislation(db, { query: 'osobních údajů' });
      expect(result.results.length).toBeGreaterThan(0);
      const allText = result.results.map(r => `${r.snippet} ${r.title}`).join(' ');
      expect(allText.toLowerCase()).toContain('osobních');
    });

    it('finds provisions matching "bezpečnostní incident"', async () => {
      const result = await searchLegislation(db, { query: 'bezpečnostní incident' });
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('finds provisions matching "elektronických komunikací"', async () => {
      const result = await searchLegislation(db, { query: 'elektronických komunikací' });
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('finds provisions matching "obchodní tajemství"', async () => {
      const result = await searchLegislation(db, { query: 'obchodní tajemství' });
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('finds provisions matching "počítačovému systému"', async () => {
      const result = await searchLegislation(db, { query: 'počítačovému systému' });
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('returns empty for gibberish query', async () => {
      const result = await searchLegislation(db, { query: 'xyzzyplugh99' });
      expect(result.results).toHaveLength(0);
    });

    it('respects limit parameter', async () => {
      const result = await searchLegislation(db, { query: 'zákon', limit: 3 });
      expect(result.results.length).toBeLessThanOrEqual(3);
    });
  });
});
