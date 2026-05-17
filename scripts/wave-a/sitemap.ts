/**
 * Sitemap walker for sbirka.nsoud.cz.
 *
 * The site exposes a Yoast-style sitemap index at /sitemap_index.xml with
 * 15 sub-sitemaps. Decision pages live under collection-sitemap*.xml with
 * URLs of the form `https://sbirka.nsoud.cz/sbirka/{numeric_id}/`.
 *
 * The category-sitemap and year-collection-sitemap files carry index pages
 * (keyword categories, yearly indexes) and are excluded.
 */

const SITEMAP_INDEX_URL = 'https://sbirka.nsoud.cz/sitemap_index.xml';

const DECISION_URL_RE = /^https:\/\/sbirka\.nsoud\.cz\/sbirka\/\d+\/?$/;

const HTTP_USER_AGENT = 'Ansvar-Law-MCP/1.0 (sbirka-nsoud-ingestion)';
const MIN_DELAY_MS = 2000;

let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_DELAY_MS) {
    await sleep(MIN_DELAY_MS - elapsed);
  }
  lastRequestAt = Date.now();
}

/**
 * Fetch a URL as text with rate-limit + retry on 429/5xx.
 * Exposed so the page fetcher can share the same throttle.
 */
export async function fetchTextWithRateLimit(
  url: string,
  maxRetries = 3,
): Promise<string> {
  await waitForRateLimit();
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': HTTP_USER_AGENT,
        'Accept': 'text/html,application/xml,*/*',
      },
      redirect: 'follow',
    });
    if (response.status === 429 || response.status >= 500) {
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt + 1) * 1000);
        continue;
      }
    }
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status} for ${url}: ${body.slice(0, 240)}`);
    }
    return response.text();
  }
  throw new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}

/**
 * Extract all `<loc>...</loc>` URLs from a sitemap XML body.
 * Returns them in document order (mirrors the sitemap file order, which is
 * chronological by lastmod descending in Yoast).
 */
export function extractLocs(xml: string): string[] {
  const locs: string[] = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    locs.push(m[1].trim());
  }
  return locs;
}

/**
 * List all sub-sitemap URLs from the sitemap index that contain decisions.
 * Filters out `category-sitemap.xml`, `year-collection-sitemap*.xml`,
 * `post-sitemap.xml`, and `page-sitemap.xml` since none of those carry
 * individual decision URLs.
 */
export async function listDecisionSitemaps(
  fetchText: (url: string) => Promise<string> = fetchTextWithRateLimit,
): Promise<string[]> {
  const xml = await fetchText(SITEMAP_INDEX_URL);
  return extractLocs(xml).filter(
    url => /collection-sitemap\d*\.xml$/i.test(url) && !/year-collection/i.test(url),
  );
}

/**
 * List all decision URLs from a single sub-sitemap.
 */
export async function listDecisionUrls(
  sitemapUrl: string,
  fetchText: (url: string) => Promise<string> = fetchTextWithRateLimit,
): Promise<string[]> {
  const xml = await fetchText(sitemapUrl);
  return extractLocs(xml).filter(url => DECISION_URL_RE.test(url));
}

/**
 * Walk the full sitemap tree, returning every decision URL with no duplicates.
 * Yields URLs in sub-sitemap order (most recent collection first).
 */
export async function listAllDecisionUrls(
  fetchText: (url: string) => Promise<string> = fetchTextWithRateLimit,
): Promise<string[]> {
  const sitemaps = await listDecisionSitemaps(fetchText);
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const sitemap of sitemaps) {
    const decisionUrls = await listDecisionUrls(sitemap, fetchText);
    for (const url of decisionUrls) {
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    }
  }
  return urls;
}
