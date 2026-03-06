#!/usr/bin/env tsx
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INDEX_PATH = path.resolve(__dirname, '../data/source/all-laws.index.json');
const SEED_DIR = path.resolve(__dirname, '../data/seed');

interface IndexLaw {
  id: string;
  stale_url: string;
  seed_file: string;
  title: string;
}

interface IndexFile {
  discovered: number;
  laws: IndexLaw[];
}

function loadIndex(): IndexFile {
  if (!fs.existsSync(INDEX_PATH)) {
    throw new Error(`Missing all-laws index at ${INDEX_PATH}. Run: npm run ingest:all:index`);
  }
  return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')) as IndexFile;
}

function loadSeedProvisionCount(seedPath: string): number {
  if (!fs.existsSync(seedPath)) return 0;
  const parsed = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as { provisions?: unknown[] };
  return Array.isArray(parsed.provisions) ? parsed.provisions.length : 0;
}

function main(): void {
  const index = loadIndex();
  let withSeed = 0;
  let withProvisions = 0;
  const missing: IndexLaw[] = [];

  for (const law of index.laws) {
    const seedPath = path.join(SEED_DIR, law.seed_file);
    if (!fs.existsSync(seedPath)) {
      missing.push(law);
      continue;
    }

    withSeed += 1;
    const provisions = loadSeedProvisionCount(seedPath);
    if (provisions > 0) {
      withProvisions += 1;
    } else {
      missing.push(law);
    }
  }

  const discovered = index.discovered || index.laws.length;
  const withSeedPct = discovered > 0 ? (withSeed / discovered) * 100 : 0;
  const withProvisionsPct = discovered > 0 ? (withProvisions / discovered) * 100 : 0;

  console.log('All Laws Coverage');
  console.log('=================');
  console.log(`Discovered laws: ${discovered}`);
  console.log(`Seed files present: ${withSeed} (${withSeedPct.toFixed(2)}%)`);
  console.log(`Seed files with provisions: ${withProvisions} (${withProvisionsPct.toFixed(2)}%)`);
  console.log(`Missing or empty: ${missing.length}`);

  if (missing.length > 0) {
    console.log('\nFirst 20 missing/empty laws:');
    for (const law of missing.slice(0, 20)) {
      console.log(`- ${law.id} (${law.stale_url}) -> ${law.seed_file}`);
    }
  }
}

main();
