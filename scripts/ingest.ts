#!/usr/bin/env tsx
/**
 * Czech Law MCP real ingestion from official e-Sbirka API.
 *
 * Usage:
 *   npm run ingest
 *   npm run ingest -- --limit 3
 *   npm run ingest -- --skip-fetch
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  fetchAllFragments,
  fetchDocumentDetail,
  type DocumentDetailResponse,
  type FragmentRecord,
} from './lib/fetcher.js';
import { parseLawSeed, TARGET_LAWS, type TargetLaw } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');

interface Args {
  limit: number | null;
  skipFetch: boolean;
}

interface CachedPayload {
  law_id: string;
  stale_url: string;
  fetched_at: string;
  detail: DocumentDetailResponse;
  fragments: FragmentRecord[];
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let skipFetch = false;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = Number.parseInt(args[i + 1], 10);
      i += 1;
      continue;
    }
    if (args[i] === '--skip-fetch') {
      skipFetch = true;
    }
  }

  return { limit, skipFetch };
}

function cachePathForLaw(law: TargetLaw): string {
  const base = law.seedFile.replace(/\.json$/i, '');
  return path.join(SOURCE_DIR, `${base}.source.json`);
}

function ensureDirs(): void {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });
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

async function loadLawSource(law: TargetLaw, skipFetch: boolean): Promise<{ detail: DocumentDetailResponse; fragments: FragmentRecord[]; cached: boolean }> {
  if (skipFetch) {
    const cached = loadCache(law);
    if (!cached) {
      throw new Error(`Missing cache for ${law.id} at ${cachePathForLaw(law)}`);
    }
    return { detail: cached.detail, fragments: cached.fragments, cached: true };
  }

  const detail = await fetchDocumentDetail(law.staleUrl);
  const fragments = await fetchAllFragments(law.staleUrl);
  saveCache(law, detail, fragments);
  return { detail, fragments, cached: false };
}

async function ingestLaw(law: TargetLaw, skipFetch: boolean): Promise<{
  id: string;
  seedFile: string;
  provisions: number;
  definitions: number;
  cached: boolean;
}> {
  const { detail, fragments, cached } = await loadLawSource(law, skipFetch);
  const seed = parseLawSeed(law, detail, fragments);

  const seedPath = path.join(SEED_DIR, law.seedFile);
  fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2));

  return {
    id: law.id,
    seedFile: law.seedFile,
    provisions: seed.provisions.length,
    definitions: seed.definitions.length,
    cached,
  };
}

async function main(): Promise<void> {
  const { limit, skipFetch } = parseArgs();
  const selected = limit ? TARGET_LAWS.slice(0, limit) : TARGET_LAWS;

  if (selected.length === 0) {
    throw new Error('No target laws selected for ingestion.');
  }

  ensureDirs();
  if (!limit) {
    clearExistingSeedFiles();
  }

  console.log('Czech Law MCP — Real Ingestion');
  console.log('==============================');
  console.log(`Source: https://www.e-sbirka.cz/sbr-externi`);
  console.log(`Mode: ${skipFetch ? 'cache-only' : 'live fetch with rate limiting'}`);
  if (limit) console.log(`Limit: ${limit}`);
  console.log('');

  const results: {
    id: string;
    seedFile: string;
    provisions: number;
    definitions: number;
    cached: boolean;
    status: string;
  }[] = [];

  let totalProvisions = 0;
  let totalDefinitions = 0;

  for (const law of selected) {
    process.stdout.write(`Fetching ${law.id} (${law.staleUrl})... `);
    try {
      const result = await ingestLaw(law, skipFetch);
      totalProvisions += result.provisions;
      totalDefinitions += result.definitions;
      console.log(`OK (${result.provisions} provisions, ${result.definitions} definitions)`);
      results.push({
        ...result,
        status: result.cached ? 'CACHED' : 'OK',
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
        status: `FAILED: ${message}`,
      });
    }
  }

  console.log('\nIngestion Report');
  console.log('----------------');
  console.log(`Processed laws: ${selected.length}`);
  console.log(`Total provisions: ${totalProvisions}`);
  console.log(`Total definitions: ${totalDefinitions}`);
  console.log('');
  console.log(`${'Law ID'.padEnd(14)} ${'Provisions'.padStart(10)} ${'Definitions'.padStart(12)} ${'Status'.padStart(12)}  Seed file`);
  console.log('-'.repeat(72));
  for (const row of results) {
    console.log(
      `${row.id.padEnd(14)} ${String(row.provisions).padStart(10)} ${String(row.definitions).padStart(12)} ${row.status.padStart(12)}  ${row.seedFile}`,
    );
  }
}

main().catch(error => {
  console.error('Fatal ingestion error:', error);
  process.exit(1);
});

