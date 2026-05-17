/**
 * Unit tests for the sbirka.nsoud.cz sitemap walker.
 * Uses an inline XML fixture; no network access.
 */
import { describe, it, expect } from 'vitest';
import {
  extractLocs,
  listDecisionSitemaps,
  listDecisionUrls,
  listAllDecisionUrls,
} from '../scripts/wave-a/sitemap.js';

const SITEMAP_INDEX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://sbirka.nsoud.cz/post-sitemap.xml</loc>
    <lastmod>2026-05-13T08:11:20+00:00</lastmod>
  </sitemap>
  <sitemap>
    <loc>https://sbirka.nsoud.cz/page-sitemap.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://sbirka.nsoud.cz/collection-sitemap.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://sbirka.nsoud.cz/collection-sitemap2.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://sbirka.nsoud.cz/category-sitemap.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://sbirka.nsoud.cz/year-collection-sitemap.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://sbirka.nsoud.cz/year-collection-sitemap2.xml</loc>
  </sitemap>
</sitemapindex>`;

const COLLECTION_SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://sbirka.nsoud.cz/sbirka/13855/</loc></url>
  <url><loc>https://sbirka.nsoud.cz/sbirka/13857/</loc></url>
  <url><loc>https://sbirka.nsoud.cz/sbirka/13859/</loc></url>
  <url><loc>https://sbirka.nsoud.cz/aktuality/</loc></url>
  <url><loc>https://sbirka.nsoud.cz/year-collection/rok-2024/</loc></url>
</urlset>`;

describe('extractLocs', () => {
  it('extracts every <loc> URL', () => {
    const locs = extractLocs(COLLECTION_SITEMAP_XML);
    expect(locs).toHaveLength(5);
    expect(locs[0]).toBe('https://sbirka.nsoud.cz/sbirka/13855/');
  });
  it('returns empty list for empty XML', () => {
    expect(extractLocs('<urlset/>')).toEqual([]);
  });
});

describe('listDecisionSitemaps', () => {
  it('filters to collection-sitemap*.xml and excludes year-collection / page / post / category', async () => {
    const sitemaps = await listDecisionSitemaps(async () => SITEMAP_INDEX_XML);
    expect(sitemaps).toEqual([
      'https://sbirka.nsoud.cz/collection-sitemap.xml',
      'https://sbirka.nsoud.cz/collection-sitemap2.xml',
    ]);
  });
});

describe('listDecisionUrls', () => {
  it('keeps only /sbirka/{id}/ URLs', async () => {
    const urls = await listDecisionUrls(
      'https://example.invalid/sitemap.xml',
      async () => COLLECTION_SITEMAP_XML,
    );
    expect(urls).toEqual([
      'https://sbirka.nsoud.cz/sbirka/13855/',
      'https://sbirka.nsoud.cz/sbirka/13857/',
      'https://sbirka.nsoud.cz/sbirka/13859/',
    ]);
  });
});

describe('listAllDecisionUrls', () => {
  it('deduplicates URLs across sub-sitemaps', async () => {
    const fetcher = async (url: string): Promise<string> => {
      if (url.endsWith('sitemap_index.xml')) return SITEMAP_INDEX_XML;
      if (url.endsWith('collection-sitemap.xml')) return COLLECTION_SITEMAP_XML;
      if (url.endsWith('collection-sitemap2.xml')) {
        // Duplicate of /sbirka/13855/ should be skipped on second pass.
        return `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://sbirka.nsoud.cz/sbirka/13855/</loc></url>
          <url><loc>https://sbirka.nsoud.cz/sbirka/99999/</loc></url>
        </urlset>`;
      }
      throw new Error(`Unexpected URL: ${url}`);
    };
    const urls = await listAllDecisionUrls(fetcher);
    expect(urls).toEqual([
      'https://sbirka.nsoud.cz/sbirka/13855/',
      'https://sbirka.nsoud.cz/sbirka/13857/',
      'https://sbirka.nsoud.cz/sbirka/13859/',
      'https://sbirka.nsoud.cz/sbirka/99999/',
    ]);
  });
});
