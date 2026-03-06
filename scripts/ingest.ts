#!/usr/bin/env tsx
/**
 * Czech Law MCP real ingestion from official e-Sbirka API.
 *
 * Usage:
 *   npm run ingest
 *   npm run ingest -- --limit 3
 *   npm run ingest -- --skip-fetch
 *   npm run ingest -- --all-laws --skip-existing
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  fetchAllFragments,
  fetchDocumentDetail,
  searchLawDocuments,
  type DocumentDetailResponse,
  type FragmentRecord,
  type SearchLawRecord,
} from './lib/fetcher.js';
import { parseLawSeed, TARGET_LAWS, type TargetLaw } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');
const LAW_INDEX_PATH = path.join(SOURCE_DIR, 'all-laws.index.json');
const ALL_LAW_SUBTYPES = ['ZAKON', 'ZAKONUST'] as const;
const SEARCH_RESULT_WINDOW_LIMIT = 10_000;

interface Args {
  limit: number | null;
  skipFetch: boolean;
  allLaws: boolean;
  indexOnly: boolean;
  skipExisting: boolean;
  refreshIndex: boolean;
}

interface CachedPayload {
  law_id: string;
  stale_url: string;
  fetched_at: string;
  detail: DocumentDetailResponse;
  fragments: FragmentRecord[];
}

interface AllLawsIndexFile {
  source: 'sbr-externi/rozsirena-vyhledavani';
  fetched_at: string;
  filter: {
    kodyPodtypAktu: string[];
    start: number;
    pocet: number;
  };
  total_from_api: number;
  discovered: number;
  skipped_without_stale_url_match: SearchLawRecord[];
  laws: Array<{
    id: string;
    stale_url: string;
    seed_file: string;
    short_name: string;
    title: string;
    title_en: string;
    description: string;
    kod_dokumentu_sbirky: string;
    stav_dokumentu_sbirky?: string;
    datum?: string;
  }>;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let skipFetch = false;
  let allLaws = false;
  let indexOnly = false;
  let skipExisting = false;
  let refreshIndex = false;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = Number.parseInt(args[i + 1], 10);
      i += 1;
      continue;
    }
    if (args[i] === '--skip-fetch') {
      skipFetch = true;
    }
    if (args[i] === '--all-laws') {
      allLaws = true;
    }
    if (args[i] === '--index-only') {
      indexOnly = true;
    }
    if (args[i] === '--skip-existing') {
      skipExisting = true;
    }
    if (args[i] === '--refresh-index') {
      refreshIndex = true;
    }
  }

  return { limit, skipFetch, allLaws, indexOnly, skipExisting, refreshIndex };
}

function cachePathForLaw(law: TargetLaw): string {
  const base = law.seedFile.replace(/\.json$/i, '');
  return path.join(SOURCE_DIR, `${base}.source.json`);
}

function ensureDirs(): void {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });
}

function sanitizeFileToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function targetLawFromSearchRecord(record: SearchLawRecord): TargetLaw | null {
  const staleUrl = record.staleUrl.trim();
  const match = staleUrl.match(/^\/sb\/(\d{4})\/([0-9a-z]+)$/i);
  if (!match) {
    return null;
  }

  const year = match[1];
  const number = match[2].toLowerCase();
  const numberToken = sanitizeFileToken(number);

  return {
    id: `cz:${number}/${year}`,
    staleUrl,
    seedFile: `zakon-${numberToken}-${year}.json`,
    shortName: record.kodDokumentuSbirky,
    titleEn: '',
    description: record.nazev,
  };
}

function toIndexRecord(target: TargetLaw, source: SearchLawRecord): AllLawsIndexFile['laws'][number] {
  return {
    id: target.id,
    stale_url: target.staleUrl,
    seed_file: target.seedFile,
    short_name: target.shortName,
    title: source.nazev,
    title_en: target.titleEn,
    description: target.description,
    kod_dokumentu_sbirky: source.kodDokumentuSbirky,
    stav_dokumentu_sbirky: source.stavDokumentuSbirky,
    datum: source.datum,
  };
}

function toTargetLaw(record: AllLawsIndexFile['laws'][number]): TargetLaw {
  return {
    id: record.id,
    staleUrl: record.stale_url,
    seedFile: record.seed_file,
    shortName: record.short_name,
    titleEn: record.title_en ?? '',
    description: record.description ?? record.title,
  };
}

function saveAllLawsIndex(index: AllLawsIndexFile): void {
  fs.writeFileSync(LAW_INDEX_PATH, JSON.stringify(index, null, 2));
}

function loadAllLawsIndex(): AllLawsIndexFile | null {
  if (!fs.existsSync(LAW_INDEX_PATH)) return null;
  const raw = fs.readFileSync(LAW_INDEX_PATH, 'utf8');
  return JSON.parse(raw) as AllLawsIndexFile;
}

async function fetchAllLawTargets(skipFetch: boolean, refreshIndex: boolean): Promise<TargetLaw[]> {
  if (!refreshIndex) {
    const cachedIndex = loadAllLawsIndex();
    if (cachedIndex) {
      return cachedIndex.laws.map(toTargetLaw);
    }
  }

  if (skipFetch) {
    const cachedIndex = loadAllLawsIndex();
    if (!cachedIndex) {
      throw new Error(`Missing all-laws index cache at ${LAW_INDEX_PATH}`);
    }
    return cachedIndex.laws.map(toTargetLaw);
  }

  const payload = {
    start: 0,
    pocet: SEARCH_RESULT_WINDOW_LIMIT,
    kodyPodtypAktu: [...ALL_LAW_SUBTYPES],
  };
  const response = await searchLawDocuments(payload);

  if (response.pocetCelkem > SEARCH_RESULT_WINDOW_LIMIT) {
    throw new Error(
      `Law result set (${response.pocetCelkem}) exceeds API window (${SEARCH_RESULT_WINDOW_LIMIT}). ` +
      `Sharding by year is required before running --all-laws.`,
    );
  }

  const seen = new Set<string>();
  const laws: TargetLaw[] = [];
  const skipped: SearchLawRecord[] = [];
  const indexRecords: AllLawsIndexFile['laws'] = [];

  for (const record of response.seznam) {
    const target = targetLawFromSearchRecord(record);
    if (!target) {
      skipped.push(record);
      continue;
    }
    if (seen.has(target.id)) continue;
    seen.add(target.id);
    laws.push(target);
    indexRecords.push(toIndexRecord(target, record));
  }

  saveAllLawsIndex({
    source: 'sbr-externi/rozsirena-vyhledavani',
    fetched_at: new Date().toISOString(),
    filter: payload,
    total_from_api: response.pocetCelkem,
    discovered: laws.length,
    skipped_without_stale_url_match: skipped,
    laws: indexRecords,
  });

  return laws;
}

function clearExistingSeedFiles(): void {
  if (!fs.existsSync(SEED_DIR)) return;
  const entries = fs.readdirSync(SEED_DIR).filter(name => name.endsWith('.json'));
  for (const entry of entries) {
    fs.unlinkSync(path.join(SEED_DIR, entry));
  }
}

function saveCache(law: TargetLaw, detail: DocumentDetailResponse, fragments: FragmentRecord[]): void {
  const payload: CachedPayload = {
    law_id: law.id,
    stale_url: law.staleUrl,
    fetched_at: new Date().toISOString(),
    detail,
    fragments,
  };
  fs.writeFileSync(cachePathForLaw(law), JSON.stringify(payload, null, 2));
}

function loadCache(law: TargetLaw): CachedPayload | null {
  const cachePath = cachePathForLaw(law);
  if (!fs.existsSync(cachePath)) return null;
  const raw = fs.readFileSync(cachePath, 'utf8');
  return JSON.parse(raw) as CachedPayload;
}

function readSeedCounts(seedPath: string): { provisions: number; definitions: number } {
  const raw = fs.readFileSync(seedPath, 'utf8');
  const parsed = JSON.parse(raw) as {
    provisions?: unknown[];
    definitions?: unknown[];
  };
  return {
    provisions: Array.isArray(parsed.provisions) ? parsed.provisions.length : 0,
    definitions: Array.isArray(parsed.definitions) ? parsed.definitions.length : 0,
  };
}

async function resolveTargets(allLaws: boolean, skipFetch: boolean, refreshIndex: boolean): Promise<TargetLaw[]> {
  if (!allLaws) {
    return TARGET_LAWS;
  }
  return fetchAllLawTargets(skipFetch, refreshIndex);
}

async function loadLawSource(law: TargetLaw, skipFetch: boolean): Promise<{ detail: DocumentDetailResponse; fragments: FragmentRecord[]; cached: boolean }> {
  if (skipFetch) {
    const cached = loadCache(law);
    if (!cached) {
      throw new Error(`Missing cache for ${law.id} at ${cachePathForLaw(law)}`);
    }
    return { detail: cached.detail, fragments: cached.fragments, cached: true };
  }

  const detail = await fetchDocumentDetail(law.staleUrl);
  const fragments = await fetchAllFragments(law.staleUrl, detail.dokumentBaseId);
  saveCache(law, detail, fragments);
  return { detail, fragments, cached: false };
}

async function ingestLaw(law: TargetLaw, skipFetch: boolean, skipExisting: boolean): Promise<{
  id: string;
  seedFile: string;
  provisions: number;
  definitions: number;
  cached: boolean;
  skippedExisting: boolean;
}> {
  const seedPath = path.join(SEED_DIR, law.seedFile);
  if (skipExisting && fs.existsSync(seedPath)) {
    const existing = readSeedCounts(seedPath);
    return {
      id: law.id,
      seedFile: law.seedFile,
      provisions: existing.provisions,
      definitions: existing.definitions,
      cached: true,
      skippedExisting: true,
    };
  }

  const { detail, fragments, cached } = await loadLawSource(law, skipFetch);
  const seed = parseLawSeed(law, detail, fragments);
  fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2));

  return {
    id: law.id,
    seedFile: law.seedFile,
    provisions: seed.provisions.length,
    definitions: seed.definitions.length,
    cached,
    skippedExisting: false,
  };
}

async function main(): Promise<void> {
  const { limit, skipFetch, allLaws, indexOnly, skipExisting, refreshIndex } = parseArgs();
  const targets = await resolveTargets(allLaws, skipFetch, refreshIndex);
  const selected = limit ? targets.slice(0, limit) : targets;

  if (selected.length === 0) {
    throw new Error('No target laws selected for ingestion.');
  }

  ensureDirs();
  if (!allLaws && !limit) {
    clearExistingSeedFiles();
  }

  console.log('Czech Law MCP — Real Ingestion');
  console.log('==============================');
  console.log(`Source: https://www.e-sbirka.cz/sbr-externi`);
  console.log(`Mode: ${skipFetch ? 'cache-only' : 'live fetch with rate limiting'}`);
  console.log(`Scope: ${allLaws ? 'all laws (ZAKON + ZAKONUST)' : 'curated target set'}`);
  if (allLaws) {
    console.log(`Law index: ${LAW_INDEX_PATH}`);
    if (refreshIndex) {
      console.log('Index refresh: enabled (fetching fresh law index from API)');
    }
  }
  if (indexOnly) {
    console.log('Action: index-only (no detail/fragments fetch)');
  }
  if (skipExisting) {
    console.log('Skip existing: enabled');
  }
  if (limit) console.log(`Limit: ${limit}`);
  console.log('');

  if (indexOnly) {
    console.log(`Indexed/selected laws: ${selected.length}`);
    return;
  }

  const results: {
    id: string;
    seedFile: string;
    provisions: number;
    definitions: number;
    cached: boolean;
    skippedExisting: boolean;
    status: string;
  }[] = [];

  let totalProvisions = 0;
  let totalDefinitions = 0;
  let skippedCount = 0;

  for (const law of selected) {
    process.stdout.write(`Processing ${law.id} (${law.staleUrl})... `);
    try {
      const result = await ingestLaw(law, skipFetch, skipExisting);
      totalProvisions += result.provisions;
      totalDefinitions += result.definitions;

      if (result.skippedExisting) {
        skippedCount += 1;
      }

      const status = result.skippedExisting ? 'SKIPPED' : (result.cached ? 'CACHED' : 'OK');
      const statusText = result.skippedExisting
        ? `SKIPPED (${result.provisions} provisions, ${result.definitions} definitions)`
        : `${status} (${result.provisions} provisions, ${result.definitions} definitions)`;
      console.log(statusText);
      results.push({
        ...result,
        status,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`FAILED (${message})`);
      results.push({
        id: law.id,
        seedFile: law.seedFile,
        provisions: 0,
        definitions: 0,
        cached: false,
        skippedExisting: false,
        status: `FAILED: ${message}`,
      });
    }
  }

  console.log('\nIngestion Report');
  console.log('----------------');
  console.log(`Processed laws: ${selected.length}`);
  console.log(`Total provisions: ${totalProvisions}`);
  console.log(`Total definitions: ${totalDefinitions}`);
  if (skipExisting) {
    console.log(`Skipped existing seeds: ${skippedCount}`);
  }
  console.log('');

  console.log(`${'Law ID'.padEnd(14)} ${'Provisions'.padStart(10)} ${'Definitions'.padStart(12)} ${'Status'.padStart(12)}  Seed file`);
  console.log('-'.repeat(72));
  const rowsToPrint =
    results.length <= 60
      ? results
      : [...results.slice(0, 30), ...results.slice(-30)];

  for (const row of rowsToPrint) {
    console.log(
      `${row.id.padEnd(14)} ${String(row.provisions).padStart(10)} ${String(row.definitions).padStart(12)} ${row.status.padStart(12)}  ${row.seedFile}`,
    );
  }
  if (rowsToPrint.length !== results.length) {
    console.log(`... omitted ${results.length - rowsToPrint.length} rows ...`);
  }
}

main().catch(error => {
  console.error('Fatal ingestion error:', error);
  process.exit(1);
});
