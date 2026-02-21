/**
 * e-Sbirka API fetcher with strict rate limiting.
 *
 * Official source:
 *   https://www.e-sbirka.cz/sbr-externi
 *
 * Used endpoints:
 *   GET /dokumenty-sbirky/{staleUrl}
 *   GET /dokumenty-sbirky/{staleUrl}/fragmenty?cisloStranky={N}
 */

export interface EsbirkaError {
  kod: string;
  popis: string;
  datumCasChyby?: string;
}

export interface DocumentDetailResponse {
  staleUrl: string;
  kodDokumentuSbirky: string;
  uplnaCitace: string;
  zkracenaCitace: string;
  nazev: string;
  datumCasVyhlaseni?: string;
  datumUcinnostiOd?: string;
  datumUcinnostiZneniOd?: string;
  typZneni?: string;
  sbirkaKod?: string;
  dokumentBaseId?: number;
  chyby?: EsbirkaError[];
}

export interface FragmentRecord {
  id: number;
  eli?: string;
  staleUrl?: string;
  kodTypuFragmentu: string;
  hloubka?: number;
  xhtml?: string;
  jeUcinny?: boolean;
}

export interface FragmentPageResponse {
  seznam: FragmentRecord[];
  pocetStranek: number;
  chyby?: EsbirkaError[];
}

export interface SearchLawRecord {
  staleUrl: string;
  nazev: string;
  kodDokumentuSbirky: string;
  stavDokumentuSbirky?: string;
  datum?: string;
}

export interface SearchLawRequest {
  start?: number;
  pocet?: number;
  kodyTypAktu?: string[];
  kodyPodtypAktu?: string[];
  rozsahVyhledavani?: string[];
}

export interface SearchLawResponse {
  pocetCelkem: number;
  seznam: SearchLawRecord[];
  chyby?: EsbirkaError[];
}

const BASE_URL = 'https://www.e-sbirka.cz/sbr-externi';
const USER_AGENT = 'Ansvar-Law-MCP/1.0 (official-esbirka-ingestion)';
const MIN_DELAY_MS = 1200;

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

async function fetchText(url: string, init?: RequestInit, maxRetries = 3): Promise<string> {
  await waitForRateLimit();

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const headers = new Headers(init?.headers);
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }
    headers.set('User-Agent', USER_AGENT);

    const response = await fetch(url, {
      ...init,
      headers,
      redirect: 'follow',
    });

    if (response.status === 429 || response.status >= 500) {
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt + 1) * 1000;
        await sleep(backoff);
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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const body = await fetchText(url, init);
  try {
    return JSON.parse(body) as T;
  } catch (error) {
    throw new Error(`Invalid JSON from ${url}: ${String(error)}; body=${body.slice(0, 240)}`);
  }
}

function throwIfEsbirkaError<T extends { chyby?: EsbirkaError[] }>(url: string, payload: T): T {
  if (payload.chyby && payload.chyby.length > 0) {
    const first = payload.chyby[0];
    throw new Error(`${first.kod}: ${first.popis} (${url})`);
  }
  return payload;
}

function encodeStaleUrl(staleUrl: string): string {
  return encodeURIComponent(staleUrl);
}

export async function fetchDocumentDetail(
  staleUrl: string,
  predmetneDatum?: string,
): Promise<DocumentDetailResponse> {
  const query = predmetneDatum ? `?predmetneDatum=${encodeURIComponent(predmetneDatum)}` : '';
  const url = `${BASE_URL}/dokumenty-sbirky/${encodeStaleUrl(staleUrl)}${query}`;
  const json = await fetchJson<DocumentDetailResponse>(url);
  return throwIfEsbirkaError(url, json);
}

export async function fetchFragmentsPage(staleUrl: string, page: number): Promise<FragmentPageResponse> {
  const url = `${BASE_URL}/dokumenty-sbirky/${encodeStaleUrl(staleUrl)}/fragmenty?cisloStranky=${page}`;
  const json = await fetchJson<FragmentPageResponse>(url);
  return throwIfEsbirkaError(url, json);
}

export async function searchLawDocuments(payload: SearchLawRequest): Promise<SearchLawResponse> {
  const url = `${BASE_URL}/rozsirena-vyhledavani`;
  const json = await fetchJson<SearchLawResponse>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return throwIfEsbirkaError(url, json);
}

export async function fetchAllFragments(staleUrl: string): Promise<FragmentRecord[]> {
  const firstPage = await fetchFragmentsPage(staleUrl, 0);
  const totalPages = Number(firstPage.pocetStranek ?? 1);
  const all = [...firstPage.seznam];

  for (let page = 1; page < totalPages; page += 1) {
    const next = await fetchFragmentsPage(staleUrl, page);
    all.push(...next.seznam);
  }

  return all;
}
