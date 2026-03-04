#!/usr/bin/env tsx
/**
 * Ingest Czech competition authority (ÚOHS) decisions from JSON-LD open data.
 *
 * Source: https://uohs.gov.cz/opendata/rozhodnuti.jsonld
 * Format: JSON-LD with Czech-language keys (rozhodnutí, číslo_jednací, etc.)
 * Volume: 10,000+ decisions per file
 * Auth: None
 * License: Not copyrighted, daily updates
 *
 * Tables populated: agency_guidance (agency = 'UOHS')
 *
 * Usage:
 *   npx tsx scripts/ingest-uohs.ts [--resume] [--limit N] [--dry-run]
 */

import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RESUME = args.includes('--resume');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const JSONLD_URL = 'https://uohs.gov.cz/opendata/rozhodnuti.jsonld';
const DB_PATH = path.resolve(process.cwd(), 'data', 'database.db');
const USER_AGENT = 'Czech-Law-MCP/1.0.0 (https://github.com/Ansvar-Systems/Czech-law-mcp; premium-ingestion)';
const BATCH_SIZE = 500;
const FETCH_TIMEOUT_MS = 120_000; // 2 minutes for ~17 MB file

// ---------------------------------------------------------------------------
// Types — actual ÚOHS JSON-LD structure (Czech-language keys)
// ---------------------------------------------------------------------------

interface UohsDecision {
  typ?: string[];
  iri?: string;
  'věc'?: { cs?: string } | string;
  'číslo_jednací'?: string;
  'spisová_značka'?: string;
  instance?: string[];
  odbor?: string[];
  'datum_právní_moci'?: { typ?: string; datum?: string } | string;
  'účastník'?: Array<{ typ?: string; 'jméno'?: { cs?: string } | string }>;
  'typ_řízení'?: string[];
  'typ_rozhodnutí'?: string[];
  dokument?: Array<{ typ?: string; url?: string }>;
  // Fallback fields (English schema.org style)
  '@id'?: string;
  name?: string;
  identifier?: string;
  description?: string;
  datePublished?: string;
  url?: string;
}

interface ParsedDecision {
  document_id: string;
  title: string;
  summary: string;
  issued_date: string;
  url: string;
  pdf_url: string;
  case_reference: string;
  file_reference: string;
  area: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract a stable document ID from the decision. */
function extractDocumentId(d: UohsDecision): string {
  // Use IRI (the unique URL for each decision)
  const iri = d.iri ?? d['@id'] ?? '';
  if (iri) {
    // Extract the detail ID from URL like "detail-23765.html"
    const match = iri.match(/detail-(\d+)/);
    if (match) return `uohs-${match[1]}`;
    // Fallback: slugify the whole path
    const slug = iri.replace(/^https?:\/\/[^/]+\//, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    return `uohs-${slug}`.substring(0, 200);
  }
  // Fallback to číslo jednací or spisová značka
  const cj = d['číslo_jednací'] ?? '';
  if (cj) return `uohs-cj-${cj.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
  const sz = d['spisová_značka'] ?? '';
  if (sz) return `uohs-sz-${sz.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
  return '';
}

/** Extract title from věc (subject matter). */
function extractTitle(d: UohsDecision): string {
  const vec = d['věc'];
  if (vec) {
    if (typeof vec === 'string') return vec;
    if (typeof vec === 'object' && vec.cs) return vec.cs;
  }
  if (d.name) return d.name;
  if (d.description) return d.description.substring(0, 200);
  return d['číslo_jednací'] ?? d['spisová_značka'] ?? 'ÚOHS Decision';
}

/** Extract the date of legal force (datum_právní_moci). */
function extractDate(d: UohsDecision): string {
  const dpm = d['datum_právní_moci'];
  if (dpm) {
    if (typeof dpm === 'string') {
      const m = dpm.match(/(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : '';
    }
    if (typeof dpm === 'object' && dpm.datum) {
      const m = dpm.datum.match(/(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : '';
    }
  }
  if (d.datePublished) {
    const m = d.datePublished.match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }
  return '';
}

/** Extract IRI as the decision URL. */
function extractUrl(d: UohsDecision): string {
  return d.iri ?? d.url ?? d['@id'] ?? '';
}

/** Extract PDF document URL if available. */
function extractPdfUrl(d: UohsDecision): string {
  if (d.dokument && d.dokument.length > 0) {
    return d.dokument[0].url ?? '';
  }
  return '';
}

/** Map the odbor (department) URL to an area category. */
function extractArea(d: UohsDecision): string {
  const odbor = d.odbor?.[0] ?? '';
  if (odbor.includes('verejne-zakazky')) return 'veřejné zakázky';
  if (odbor.includes('hospodarska-soutez')) return 'hospodářská soutěž';
  if (odbor.includes('vyznamna-trzni-sila')) return 'významná tržní síla';
  if (odbor.includes('statni-podpora')) return 'státní podpora';
  return '';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('ÚOHS Competition Decisions Ingestion');
  console.log('='.repeat(55));
  console.log(`  Source:   ${JSONLD_URL}`);
  console.log(`  Mode:     ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Resume:   ${RESUME}`);
  console.log(`  Limit:    ${LIMIT === Infinity ? 'none' : LIMIT}`);
  console.log(`  Database: ${DB_PATH}`);
  console.log();

  // -- Phase 1: Fetch the JSON-LD dataset --
  console.log('Phase 1: Fetching JSON-LD dataset from ÚOHS...');
  console.log('  (File is ~17 MB, may take a moment)');

  let rawData: any;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(JSONLD_URL, {
      headers: {
        Accept: 'application/ld+json, application/json',
        'User-Agent': USER_AGENT,
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    rawData = await res.json();
  } catch (err) {
    console.error('ERROR: Failed to fetch JSON-LD from ÚOHS:', err);
    process.exit(1);
  }

  // The actual ÚOHS data uses Czech key "rozhodnutí" as the array wrapper
  let decisions: UohsDecision[];
  if (rawData['rozhodnutí'] && Array.isArray(rawData['rozhodnutí'])) {
    decisions = rawData['rozhodnutí'];
  } else if (Array.isArray(rawData)) {
    decisions = rawData;
  } else if (rawData['@graph'] && Array.isArray(rawData['@graph'])) {
    decisions = rawData['@graph'];
  } else {
    console.log(`  Unexpected structure. Root keys: ${Object.keys(rawData).join(', ')}`);
    decisions = [rawData as UohsDecision];
  }

  console.log(`  Total decisions in dataset: ${decisions.length.toLocaleString()}`);

  // Log a sample to verify field mapping
  if (decisions.length > 0) {
    const sample = decisions[0];
    console.log(`  Sample keys: ${Object.keys(sample).join(', ')}`);
    console.log(`  Sample iri: ${sample.iri ?? '(none)'}`);
    const sampleVec = sample['věc'];
    const vecStr = typeof sampleVec === 'object' && sampleVec !== null ? JSON.stringify(sampleVec) : String(sampleVec ?? '');
    console.log(`  Sample věc: ${vecStr.substring(0, 80)}`);
  }

  // Apply limit
  if (decisions.length > LIMIT) {
    decisions = decisions.slice(0, LIMIT);
    console.log(`  Limited to: ${decisions.length}`);
  }

  // -- Phase 2: Parse all decisions --
  console.log('\nPhase 2: Parsing decisions...');
  const parsed: ParsedDecision[] = [];
  let parseSkipped = 0;

  for (const decision of decisions) {
    const documentId = extractDocumentId(decision);
    if (!documentId) {
      parseSkipped++;
      continue;
    }

    parsed.push({
      document_id: documentId,
      title: extractTitle(decision),
      summary: '',
      issued_date: extractDate(decision),
      url: extractUrl(decision),
      pdf_url: extractPdfUrl(decision),
      case_reference: decision['číslo_jednací'] ?? '',
      file_reference: decision['spisová_značka'] ?? '',
      area: extractArea(decision),
    });

    if (parsed.length % 2000 === 0) {
      console.log(`  Parsed: ${parsed.length.toLocaleString()}/${decisions.length.toLocaleString()}`);
    }
  }

  console.log(`  Parsed: ${parsed.length.toLocaleString()} decisions (${parseSkipped} skipped)`);

  if (DRY_RUN) {
    console.log('\n  DRY RUN sample:');
    for (const d of parsed.slice(0, 5)) {
      console.log(`    ${d.document_id} | ${d.issued_date} | ${d.title.substring(0, 60)}`);
    }
    if (parsed.length > 5) {
      console.log(`    ... and ${parsed.length - 5} more`);
    }
    return;
  }

  // -- Open database --
  if (!fs.existsSync(DB_PATH)) {
    console.error(`ERROR: No database at ${DB_PATH}. Run 'npm run build:db' first.`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');

    // Verify premium tables exist
    const hasAgencyGuidance = !!db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agency_guidance'")
      .get();
    if (!hasAgencyGuidance) {
      console.error('ERROR: agency_guidance table not found. Run build-db-paid.ts first.');
      process.exit(1);
    }

    // Existing IDs for --resume
    const existingIds = new Set<string>();
    if (RESUME) {
      const rows = db
        .prepare("SELECT document_id FROM agency_guidance WHERE agency = 'UOHS'")
        .all() as { document_id: string }[];
      for (const r of rows) existingIds.add(r.document_id);
      console.log(`  Resume: ${existingIds.size.toLocaleString()} existing ÚOHS entries will be skipped`);
    }

    // Filter out already-ingested
    const toInsert = RESUME
      ? parsed.filter((d) => !existingIds.has(d.document_id))
      : parsed;
    console.log(`  Decisions to insert: ${toInsert.length.toLocaleString()}`);

    if (toInsert.length === 0) {
      console.log('\n  Nothing new to ingest. Done.');
      return;
    }

    // -- Phase 3: Insert into database in batches --
    console.log('\nPhase 3: Inserting into database...');

    const insertGuidance = db.prepare(`
      INSERT OR IGNORE INTO agency_guidance
        (agency, document_id, title, summary, full_text, issued_date, url, related_statute_id)
      VALUES ('UOHS', ?, ?, ?, ?, ?, ?, NULL)
    `);

    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const insertBatch = db.transaction((items: ParsedDecision[]) => {
        for (const d of items) {
          const parts: string[] = [];
          if (d.case_reference) parts.push(`Č.j.: ${d.case_reference}`);
          if (d.file_reference) parts.push(`Sp.zn.: ${d.file_reference}`);
          if (d.area) parts.push(`Oblast: ${d.area}`);
          if (d.pdf_url) parts.push(`PDF: ${d.pdf_url}`);
          const summary = parts.join(' | ');

          const res = insertGuidance.run(
            d.document_id,
            d.title,
            summary,
            '',  // No full text in JSON-LD (only PDF links)
            d.issued_date,
            d.url,
          );
          if (res.changes > 0) inserted++;
          else skipped++;
        }
      });
      insertBatch(batch);

      const progress = Math.min(i + BATCH_SIZE, toInsert.length);
      if (progress % 2000 < BATCH_SIZE || progress === toInsert.length) {
        console.log(`  Progress: ${progress.toLocaleString()}/${toInsert.length.toLocaleString()} (${inserted} inserted, ${skipped} skipped)`);
      }
    }

    // -- Phase 4: Rebuild FTS --
    console.log('\nPhase 4: Rebuilding FTS index...');
    try {
      db.exec("INSERT INTO agency_guidance_fts(agency_guidance_fts) VALUES ('rebuild')");
      console.log('  FTS rebuild complete.');
    } catch (err) {
      console.error('  FTS rebuild failed (non-fatal):', err);
    }

    console.log('\nÚOHS Decisions Ingestion Complete');
    console.log('='.repeat(55));
    console.log(`  Inserted:      ${inserted.toLocaleString()}`);
    console.log(`  Skipped (dup): ${skipped.toLocaleString()}`);
    console.log(`  Parse skipped: ${parseSkipped.toLocaleString()}`);
    console.log(`  Database:      ${DB_PATH}`);
  } finally {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
