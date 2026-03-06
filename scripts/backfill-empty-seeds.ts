#!/usr/bin/env tsx
/**
 * Backfill missing/empty seed files directly from official e-Sbirka API.
 *
 * This script does not synthesize text. It only writes a seed when official
 * detail + fragment payloads produce at least one provision.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchAllFragments, fetchDocumentDetail } from './lib/fetcher.js';
import { parseLawSeed, type TargetLaw } from './lib/parser.js';

interface IndexLaw {
  id: string;
  stale_url: string;
  seed_file: string;
  short_name?: string;
  title?: string;
  title_en?: string;
  description?: string;
}

interface IndexFile {
  discovered: number;
  laws: IndexLaw[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INDEX_PATH = path.resolve(__dirname, '../data/source/all-laws.index.json');
const SEED_DIR = path.resolve(__dirname, '../data/seed');

function loadIndex(): IndexFile {
  if (!fs.existsSync(INDEX_PATH)) {
    throw new Error(`Missing law index at ${INDEX_PATH}.`);
  }
  return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')) as IndexFile;
}

function seedProvisionCount(seedPath: string): number {
  if (!fs.existsSync(seedPath)) return 0;
  const parsed = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as { provisions?: unknown[] };
  return Array.isArray(parsed.provisions) ? parsed.provisions.length : 0;
}

function toTargetLaw(row: IndexLaw): TargetLaw {
  const shortName = row.short_name?.trim() || row.id;
  const description = row.description?.trim() || row.title?.trim() || row.id;
  return {
    id: row.id,
    staleUrl: row.stale_url,
    seedFile: row.seed_file,
    shortName,
    titleEn: row.title_en?.trim() ?? '',
    description,
  };
}

async function main(): Promise<void> {
  const index = loadIndex();
  const backlog = index.laws.filter(row => {
    const seedPath = path.join(SEED_DIR, row.seed_file);
    return seedProvisionCount(seedPath) === 0;
  });

  console.log('Backfill Empty Seeds');
  console.log('====================');
  console.log(`Index laws: ${index.laws.length}`);
  console.log(`Missing/empty seeds: ${backlog.length}`);

  if (backlog.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  let fixed = 0;
  const unresolved: Array<{ id: string; staleUrl: string; reason: string }> = [];

  for (const row of backlog) {
    const targetLaw = toTargetLaw(row);
    const seedPath = path.join(SEED_DIR, row.seed_file);

    try {
      const detail = await fetchDocumentDetail(row.stale_url);
      const fragments = await fetchAllFragments(row.stale_url, detail.dokumentBaseId);
      const seed = parseLawSeed(targetLaw, detail, fragments);

      if (seed.provisions.length === 0) {
        unresolved.push({
          id: row.id,
          staleUrl: row.stale_url,
          reason: 'official fragments fetched but no provision structure/text extracted',
        });
        continue;
      }

      fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2));
      fixed += 1;
      console.log(`Fixed: ${row.id} (${seed.provisions.length} provisions)`);
    } catch (error) {
      unresolved.push({
        id: row.id,
        staleUrl: row.stale_url,
        reason: String(error),
      });
    }
  }

  console.log('');
  console.log(`Backfilled seeds: ${fixed}`);
  console.log(`Unresolved: ${unresolved.length}`);

  if (unresolved.length > 0) {
    console.log('Unresolved laws:');
    for (const item of unresolved) {
      console.log(`- ${item.id} (${item.staleUrl}) -> ${item.reason}`);
    }
  }
}

main().catch(error => {
  console.error('Fatal backfill error:', error);
  process.exit(1);
});
