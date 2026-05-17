#!/usr/bin/env tsx
/**
 * Wave A ingestor — sbirka.nsoud.cz (curated Supreme Court decisions).
 *
 * Walks the Yoast sitemap index, fetches each /sbirka/{id}/ page, parses the
 * decision metadata + full text, and writes a CaseLawSeed JSON file under
 * data/case-law-seed/. The build-db.ts pipeline ingests those files into
 * the premium SQLite database alongside the e-Sbírka statute rows.
 *
 * Verbatim rate limit: ≥ 2 seconds between requests, single-threaded.
 * robots.txt at https://sbirka.nsoud.cz/robots.txt has empty Disallow (full
 * crawl permitted, no Crawl-Delay specified).
 *
 * License basis: Czech-Statutory-PD (Copyright Act 121/2000 Coll. §3).
 * Per the Wave A design (docs/superpowers/specs/2026-05-17-czech-law-premium-
 * replacement-corpus-design.md §6), §3 verbatim text must be reconfirmed
 * against the deployed e-Sbírka free-tier row at `eli/cz/sb/2000/121` before
 * the routing-table `CZ.premium` flip. This script does NOT enforce that
 * gate; it is enforced by the release-gate runbook in arch-docs.
 *
 * Usage:
 *   tsx scripts/ingest-nsoud-sbirka.ts [--limit N] [--out DIR] [--resume]
 *
 *   --limit N    Stop after N decisions ingested (smoke-test mode).
 *   --out DIR    Override the default output dir (data/case-law-seed/).
 *   --resume     Skip URLs whose seed file already exists. Default off.
 *   --max-failures N  Abort after N consecutive parse failures (default 5).
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { parseDecision } from './wave-a/parse-decision.js';
import { fetchTextWithRateLimit, listAllDecisionUrls } from './wave-a/sitemap.js';
import { toSeed } from './wave-a/to-seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_OUT_DIR = path.resolve(__dirname, '../data/case-law-seed');

interface CliArgs {
  limit: number | null;
  outDir: string;
  resume: boolean;
  maxFailures: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    limit: null,
    outDir: DEFAULT_OUT_DIR,
    resume: false,
    maxFailures: 5,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--limit') {
      args.limit = Number.parseInt(argv[++i], 10);
    } else if (arg === '--out') {
      args.outDir = path.resolve(argv[++i]);
    } else if (arg === '--resume') {
      args.resume = true;
    } else if (arg === '--max-failures') {
      args.maxFailures = Number.parseInt(argv[++i], 10);
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: tsx scripts/ingest-nsoud-sbirka.ts [--limit N] [--out DIR] [--resume] [--max-failures N]',
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return args;
}

function seedFilenameForUrl(url: string): string {
  // Use the collection ID for the filename. This avoids file-system-hostile
  // characters in ECLIs and makes filenames stable across re-ingests.
  const m = url.match(/\/sbirka\/(\d+)\/?$/);
  if (!m) throw new Error(`Cannot derive seed filename from URL: ${url}`);
  return `ns-sbirka-${m[1]}.json`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.outDir)) {
    fs.mkdirSync(args.outDir, { recursive: true });
  }

  console.log('Wave A ingest — sbirka.nsoud.cz');
  console.log(`  Output dir: ${args.outDir}`);
  console.log(`  Limit:      ${args.limit ?? 'no limit'}`);
  console.log(`  Resume:     ${args.resume}`);
  console.log(`  Rate:       ≥ 2s between requests, single-threaded\n`);

  console.log('Listing decision URLs from sitemap index...');
  const urls = await listAllDecisionUrls();
  console.log(`  Found ${urls.length} decision URLs across sub-sitemaps\n`);

  let ingested = 0;
  let skipped = 0;
  let failed = 0;
  let consecutiveFailures = 0;

  for (const url of urls) {
    if (args.limit !== null && ingested >= args.limit) {
      console.log(`\nReached --limit ${args.limit}; stopping.`);
      break;
    }

    const outPath = path.join(args.outDir, seedFilenameForUrl(url));
    if (args.resume && fs.existsSync(outPath)) {
      skipped += 1;
      continue;
    }

    try {
      const html = await fetchTextWithRateLimit(url);
      const decision = parseDecision(html, url);
      const seed = toSeed(decision);
      fs.writeFileSync(outPath, JSON.stringify(seed, null, 2), 'utf8');
      ingested += 1;
      consecutiveFailures = 0;
      if (ingested % 25 === 0) {
        console.log(`  [${ingested}] ${url} → ${path.basename(outPath)}`);
      }
    } catch (error) {
      failed += 1;
      consecutiveFailures += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`  [skip] ${url}: ${message.slice(0, 200)}`);
      if (consecutiveFailures >= args.maxFailures) {
        console.error(
          `\nAborting: ${consecutiveFailures} consecutive failures (threshold ${args.maxFailures}). ` +
            'Check rate-limit posture and source HTML changes.',
        );
        process.exit(1);
      }
    }
  }

  console.log('\nIngest summary:');
  console.log(`  Ingested: ${ingested}`);
  console.log(`  Skipped (resume): ${skipped}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Output: ${args.outDir}`);
}

main().catch(error => {
  console.error('Fatal:', error);
  process.exit(1);
});
