/**
 * Core tool tests for Czech Law MCP.
 * Tests against the built database (data/database.db).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from '@ansvar/mcp-sqlite';
import { resolve } from 'path';
import { getProvision } from '../src/tools/get-provision.js';
import { searchLegislation } from '../src/tools/search-legislation.js';
import { listSources } from '../src/tools/list-sources.js';

const DB_PATH = resolve(import.meta.dirname, '..', 'data', 'database.db');

describe('Czech Law MCP Tools', () => {
  let db: InstanceType<typeof Database>;

  beforeAll(() => {
    db = new Database(DB_PATH, { readonly: true });
  });

  afterAll(() => {
    db.close();
  });

  // ---------------------------------------------------------------------------
  // list_sources
  // ---------------------------------------------------------------------------
  describe('list_sources', () => {
    it('should return source metadata and database stats', async () => {
      const result = await listSources(db);
      expect(result.results).toBeDefined();
      expect(result.results.database.document_count).toBe(10);
      expect(result.results.database.provision_count).toBeGreaterThanOrEqual(200);
      expect(result.results.database.tier).toBe('free');
    });
  });

  // ---------------------------------------------------------------------------
  // get_provision
  // ---------------------------------------------------------------------------
  describe('get_provision', () => {
    it('should retrieve GDPR Act § 1 by direct ID', async () => {
      const result = await getProvision(db, { document_id: 'cz:110/2019', provision_ref: '§ 1' });
      expect(result.results.length).toBe(1);
      expect(result.results[0].content).toContain('Regulation (EU) 2016/679');
      expect(result.results[0].document_id).toBe('cz:110/2019');
    });

    it('should retrieve Cybersecurity Act § 1 by short name', async () => {
      const result = await getProvision(db, { document_id: 'Cybersecurity Act', provision_ref: '§ 1' });
      expect(result.results.length).toBe(1);
      expect(result.results[0].content).toContain('cybersecurity');
    });

    it('should retrieve Criminal Code § 230 (unauthorised access)', async () => {
      const result = await getProvision(db, { document_id: 'Criminal Code (Cybercrime)', provision_ref: '§ 230' });
      expect(result.results.length).toBe(1);
      expect(result.results[0].content).toContain('unauthorised access');
      expect(result.results[0].content).toContain('computer system');
    });

    it('should retrieve Civil Code § 2985a (trade secret definition)', async () => {
      const result = await getProvision(db, { document_id: 'Civil Code (Trade Secrets)', provision_ref: '§ 2985a' });
      expect(result.results.length).toBe(1);
      expect(result.results[0].content).toContain('trade secret');
      expect(result.results[0].content).toContain('Directive (EU) 2016/943');
    });

    it('should retrieve Electronic Communications Act § 14 (confidentiality)', async () => {
      const result = await getProvision(db, { document_id: 'Electronic Communications Act', provision_ref: '§ 14' });
      expect(result.results.length).toBe(1);
      expect(result.results[0].content).toContain('confidentiality');
    });

    it('should retrieve Trust Services Act § 3 (electronic signatures)', async () => {
      const result = await getProvision(db, { document_id: 'Trust Services Act', provision_ref: '§ 3' });
      expect(result.results.length).toBe(1);
      expect(result.results[0].content).toContain('electronic signature');
    });

    it('should retrieve all provisions for a document when no ref given', async () => {
      const result = await getProvision(db, { document_id: 'cz:110/2019' });
      expect(result.results.length).toBe(25);
    });

    it('should return empty for non-existent law', async () => {
      const result = await getProvision(db, { document_id: 'Zákon č. 999/2099', provision_ref: '§ 1' });
      expect(result.results).toHaveLength(0);
    });

    it('should return empty for non-existent provision', async () => {
      const result = await getProvision(db, { document_id: 'cz:110/2019', provision_ref: '§ 999' });
      expect(result.results).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // search_legislation
  // ---------------------------------------------------------------------------
  describe('search_legislation', () => {
    it('should find provisions matching "personal data"', async () => {
      const result = await searchLegislation(db, { query: 'personal data' });
      expect(result.results.length).toBeGreaterThan(0);
      const allText = result.results.map(r => `${r.snippet} ${r.title}`).join(' ');
      expect(allText.toLowerCase()).toContain('personal data');
    });

    it('should find provisions matching "cybersecurity incident"', async () => {
      const result = await searchLegislation(db, { query: 'cybersecurity incident' });
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('should find provisions matching "electronic signature"', async () => {
      const result = await searchLegislation(db, { query: 'electronic signature' });
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('should find provisions matching "trade secret"', async () => {
      const result = await searchLegislation(db, { query: 'trade secret' });
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('should find provisions matching "critical infrastructure"', async () => {
      const result = await searchLegislation(db, { query: 'critical infrastructure' });
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('should return empty for gibberish query', async () => {
      const result = await searchLegislation(db, { query: 'xyzzyplugh99' });
      expect(result.results).toHaveLength(0);
    });

    it('should respect limit parameter', async () => {
      const result = await searchLegislation(db, { query: 'security', limit: 3 });
      expect(result.results.length).toBeLessThanOrEqual(3);
    });
  });
});
