/**
 * Unit tests for the sbirka.nsoud.cz decision parser.
 * Uses frozen HTML fixtures under tests/fixtures/.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseDecision,
  parseCzechDate,
  extractCollectionId,
  deriveDocumentId,
} from '../scripts/wave-a/parse-decision.js';
import { toSeed } from '../scripts/wave-a/to-seed.js';

const FIXTURES_DIR = resolve(__dirname, 'fixtures');

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), 'utf8');
}

describe('parseCzechDate', () => {
  it('parses DD.MM.YYYY', () => {
    expect(parseCzechDate('16.12.2025')).toBe('2025-12-16');
  });
  it('parses DD. MM. YYYY (with spaces)', () => {
    expect(parseCzechDate('16. 12. 2025')).toBe('2025-12-16');
  });
  it('pads single-digit day and month', () => {
    expect(parseCzechDate('1.3.2020')).toBe('2020-03-01');
  });
  it('returns null on garbage', () => {
    expect(parseCzechDate('not a date')).toBeNull();
    expect(parseCzechDate('')).toBeNull();
  });
});

describe('extractCollectionId', () => {
  it('extracts numeric ID from /sbirka/{id}/', () => {
    expect(extractCollectionId('https://sbirka.nsoud.cz/sbirka/25445/')).toBe('25445');
  });
  it('handles trailing-slash variants', () => {
    expect(extractCollectionId('https://sbirka.nsoud.cz/sbirka/13855')).toBe('13855');
  });
  it('returns empty string for non-decision URLs', () => {
    expect(extractCollectionId('https://sbirka.nsoud.cz/kontakt/')).toBe('');
  });
});

describe('deriveDocumentId', () => {
  it('prefers ECLI when present', () => {
    const id = deriveDocumentId('ECLI:CZ:NS:2025:25.CDO.1552.2025.1', '25445');
    expect(id).toBe('ecli:ecli:cz:ns:2025:25.cdo.1552.2025.1');
  });
  it('falls back to collection ID when ECLI is absent', () => {
    expect(deriveDocumentId(null, '13855')).toBe('cz:ns:sbirka:13855');
  });
  it('throws when both inputs are empty', () => {
    expect(() => deriveDocumentId(null, '')).toThrow(/Cannot derive document ID/);
  });
});

describe('parseDecision — post-ECLI sample (2025)', () => {
  const html = loadFixture('sbirka-nsoud-25445.html');
  const url = 'https://sbirka.nsoud.cz/sbirka/25445/';
  const decision = parseDecision(html, url);

  it('extracts ECLI from title', () => {
    expect(decision.ecli).toBe('ECLI:CZ:NS:2025:25.CDO.1552.2025.1');
  });
  it('extracts spis. zn.', () => {
    expect(decision.spis_zn).toBe('25 Cdo 1552/2025');
  });
  it('extracts decision date', () => {
    expect(decision.decision_date).toBe('2025-12-16');
  });
  it('extracts collection ID from URL', () => {
    expect(decision.collection_id).toBe('25445');
  });
  it('extracts collection number / year / booklet', () => {
    expect(decision.collection_number).toBe('28');
    expect(decision.collection_year).toBe('2026');
    expect(decision.collection_booklet).toBe('4');
  });
  it('extracts decision type', () => {
    expect(decision.decision_type).toBe('Usnesení');
  });
  it('extracts court name', () => {
    expect(decision.court).toBe('Nejvyšší soud');
  });
  it('extracts keyword list (Heslo)', () => {
    expect(decision.keywords).toContain('Náklady řízení');
    expect(decision.keywords).toContain('Odměna advokáta');
    expect(decision.keywords.length).toBeGreaterThanOrEqual(3);
  });
  it('extracts cited statutes (Předpisy)', () => {
    expect(decision.cited_statutes.length).toBeGreaterThanOrEqual(2);
    expect(decision.cited_statutes.some(s => s.includes('177/1996'))).toBe(true);
  });
  it('extracts category (Druh)', () => {
    expect(decision.category).toContain('občanskoprávních');
  });
  it('extracts headnote (Právní věta)', () => {
    expect(decision.headnote).toMatch(/Odměna advokáta/);
  });
  it('extracts body text', () => {
    expect(decision.body_text.length).toBeGreaterThan(2000);
    expect(decision.body_text).toContain('Dosavadní průběh řízení');
    // Body should not include the table-of-contents heading text.
    expect(decision.body_text).not.toContain('Sbírkový text rozhodnutí');
  });
  it('preserves source URL verbatim', () => {
    expect(decision.source_url).toBe(url);
  });
});

describe('parseDecision — pre-ECLI sample (2003)', () => {
  const html = loadFixture('sbirka-nsoud-13855.html');
  const url = 'https://sbirka.nsoud.cz/sbirka/13855/';
  const decision = parseDecision(html, url);

  it('returns null ECLI (pre-ECLI era)', () => {
    expect(decision.ecli).toBeNull();
  });
  it('still extracts spis. zn. from h1 fallback', () => {
    expect(decision.spis_zn).toBe('11 Tcu 95/2003');
  });
  it('defaults court to Nejvyšší soud when Soud field absent', () => {
    expect(decision.court).toBe('Nejvyšší soud');
  });
  it('extracts decision date from h1 title fallback', () => {
    expect(decision.decision_date).toBe('2003-07-17');
  });
  it('has a non-empty body', () => {
    expect(decision.body_text.length).toBeGreaterThan(100);
  });
});

describe('toSeed', () => {
  const html = loadFixture('sbirka-nsoud-25445.html');
  const url = 'https://sbirka.nsoud.cz/sbirka/25445/';
  const decision = parseDecision(html, url);
  const seed = toSeed(decision);

  it('produces a case_law row', () => {
    expect(seed.type).toBe('case_law');
  });
  it('uses ECLI as document ID', () => {
    expect(seed.id).toMatch(/^ecli:/);
  });
  it('publisher is Nejvyšší soud', () => {
    expect(seed.publisher).toBe('Nejvyšší soud');
  });
  it('license is Czech-Statutory-PD', () => {
    expect(seed.license).toBe('Czech-Statutory-PD');
  });
  it('url is the source URL verbatim', () => {
    expect(seed.url).toBe(url);
  });
  it('has exactly one provision row carrying the body', () => {
    expect(seed.provisions.length).toBe(1);
    expect(seed.provisions[0].content.length).toBeGreaterThan(2000);
    expect(seed.provisions[0].provision_ref).toBe('25 Cdo 1552/2025');
  });
  it('cited statutes are propagated', () => {
    expect(seed.cited_statutes?.length).toBeGreaterThanOrEqual(2);
  });
  it('metadata contains a content hash and the source URL', () => {
    expect(seed.metadata?.source_url).toBe(url);
    expect(seed.metadata?.content_hash_at_ingest).toMatch(/^[a-f0-9]{64}$/);
    expect(seed.metadata?.ecli).toBe('ECLI:CZ:NS:2025:25.CDO.1552.2025.1');
  });
  it('throws on a decision with no body', () => {
    const bad = { ...decision, body_text: '' };
    expect(() => toSeed(bad)).toThrow(/body too short/);
  });
});
