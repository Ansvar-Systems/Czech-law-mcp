/**
 * e-Sbirka API fetcher with strict rate limiting.
 *
 * Official source:
 *   https://www.e-sbirka.cz/sbr-externi
 *
 * Used endpoints:
 *   GET /dokumenty-sbirky/{staleUrl}
 *   GET /dokumenty-sbirky/{staleUrl}/fragmenty?cisloStranky={N}
 *   GET /dokumenty-sbirky/{staleUrl}/odkazy-ke-stazeni
 *   GET /stahni/informativni-zneni/{dokumentId}/JSON
 *   GET /souborove-sluzby/verejne-pozadavky-dokumenty/pozadavky/{pozadavekId}
 *   GET /souborove-sluzby/soubory/{id}
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

interface DownloadLinkRef {
  dokumentId: number;
}

interface InformativeDownloadLinks {
  odkazPdf?: DownloadLinkRef;
  odkazDoc?: DownloadLinkRef;
  odkazZip?: DownloadLinkRef;
}

export interface DownloadLinksResponse {
  informativniZneni?: InformativeDownloadLinks;
  chyby?: EsbirkaError[];
}

interface DownloadRequestResponse {
  pozadavekId?: string;
  id?: string;
  stavPozadavku?: string;
  nazevDokumentu?: string;
  chyby?: EsbirkaError[];
}

interface DownloadRequestStatusResponse {
  stav?: string;
  id?: string;
  chyby?: EsbirkaError[];
}

interface InformativeJsonFragment {
  fragmentId: number;
  hloubka?: number;
  typ: string;
  xhtml?: string | null;
}

interface InformativeJsonPayload {
  fragmenty: InformativeJsonFragment[];
}

const BASE_URL = 'https://www.e-sbirka.cz/sbr-externi';
const FILE_SERVICE_BASE_URL = 'https://www.e-sbirka.cz/souborove-sluzby';
const USER_AGENT = 'Ansvar-Law-MCP/1.0 (official-esbirka-ingestion)';
const MIN_DELAY_MS = 1200;
const PUBLIC_DOWNLOAD_STATUS_MAX_POLLS = 20;

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

export async function fetchDownloadLinks(staleUrl: string): Promise<DownloadLinksResponse> {
  const url = `${BASE_URL}/dokumenty-sbirky/${encodeStaleUrl(staleUrl)}/odkazy-ke-stazeni`;
  const json = await fetchJson<DownloadLinksResponse>(url);
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

async function fetchAllFragmentsFromPages(staleUrl: string): Promise<FragmentRecord[]> {
  const firstPage = await fetchFragmentsPage(staleUrl, 0);
  const totalPages = Number(firstPage.pocetStranek ?? 1);
  const all = [...firstPage.seznam];

  for (let page = 1; page < totalPages; page += 1) {
    const next = await fetchFragmentsPage(staleUrl, page);
    all.push(...next.seznam);
  }

  return all;
}

function toFragmentRecord(fragment: InformativeJsonFragment): FragmentRecord {
  return {
    id: fragment.fragmentId,
    hloubka: fragment.hloubka,
    kodTypuFragmentu: fragment.typ,
    xhtml: fragment.xhtml ?? undefined,
    jeUcinny: true,
  };
}

async function requestInformativeJson(documentId: number): Promise<DownloadRequestResponse> {
  const url = `${BASE_URL}/stahni/informativni-zneni/${documentId}/JSON`;
  const json = await fetchJson<DownloadRequestResponse>(url);
  return throwIfEsbirkaError(url, json);
}

async function fetchDownloadRequestStatus(pozadavekId: string): Promise<DownloadRequestStatusResponse> {
  const url = `${FILE_SERVICE_BASE_URL}/verejne-pozadavky-dokumenty/pozadavky/${encodeURIComponent(pozadavekId)}`;
  const json = await fetchJson<DownloadRequestStatusResponse>(url);
  return throwIfEsbirkaError(url, json);
}

async function waitForDownloadFileId(initial: DownloadRequestResponse): Promise<string> {
  if (initial.id) return initial.id;
  if (!initial.pozadavekId) {
    throw new Error('Missing both file id and request id for informative JSON download.');
  }

  let attempt = 0;
  while (attempt < PUBLIC_DOWNLOAD_STATUS_MAX_POLLS) {
    const status = await fetchDownloadRequestStatus(initial.pozadavekId);
    if (status.id) {
      return status.id;
    }

    const state = (status.stav ?? '').toUpperCase();
    if (state === 'CHYBA' || state === 'ERROR' || state === 'FAILED') {
      throw new Error(`Informative JSON request ${initial.pozadavekId} failed with state ${status.stav ?? 'unknown'}.`);
    }

    attempt += 1;
  }

  throw new Error(`Timed out waiting for informative JSON file id (request ${initial.pozadavekId}).`);
}

async function downloadInformativeJsonByFileId(fileId: string): Promise<InformativeJsonPayload> {
  const url = `${FILE_SERVICE_BASE_URL}/soubory/${encodeURIComponent(fileId)}`;
  const payload = await fetchJson<InformativeJsonPayload>(url);
  if (!payload || !Array.isArray(payload.fragmenty)) {
    throw new Error(`Invalid informative JSON payload for file ${fileId}.`);
  }
  return payload;
}

async function fetchAllFragmentsFromInformativeJson(staleUrl: string, documentBaseId?: number): Promise<FragmentRecord[]> {
  let sourceDocumentId: number | null = null;

  if (typeof documentBaseId === 'number' && Number.isFinite(documentBaseId) && documentBaseId > 0) {
    sourceDocumentId = documentBaseId;
  }

  if (sourceDocumentId === null) {
    const links = await fetchDownloadLinks(staleUrl);
    sourceDocumentId =
      links.informativniZneni?.odkazZip?.dokumentId ??
      links.informativniZneni?.odkazPdf?.dokumentId ??
      null;
  }

  if (sourceDocumentId === null) {
    throw new Error(`No informative download document id for ${staleUrl}.`);
  }

  const request = await requestInformativeJson(sourceDocumentId);
  const fileId = await waitForDownloadFileId(request);
  const informativeJson = await downloadInformativeJsonByFileId(fileId);

  return informativeJson.fragmenty.map(toFragmentRecord);
}

export async function fetchAllFragments(staleUrl: string, documentBaseId?: number): Promise<FragmentRecord[]> {
  try {
    const fragments = await fetchAllFragmentsFromInformativeJson(staleUrl, documentBaseId);
    if (fragments.length > 0) {
      return fragments;
    }
  } catch (_error) {
    // Fall back to official paginated endpoint if asynchronous JSON download is unavailable.
  }

  return fetchAllFragmentsFromPages(staleUrl);
}
