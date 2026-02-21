#!/usr/bin/env tsx
/**
 * Bulk ingestion from official e-Sbirka open-data datasets.
 *
 * Source index:
 *   https://opendata.eselpoint.cz/datove-sady-esbirka/
 *
 * This ingester builds law seed files for all Czech laws (ZAKON + ZAKONUST)
 * from official open-data dumps without synthetic text.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline as pipelinePromise } from 'stream/promises';
import { createGunzip } from 'zlib';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { parseLawSeed, type TargetLaw } from './lib/parser.js';
import type { DocumentDetailResponse, FragmentRecord } from './lib/fetcher.js';

const require = createRequire(import.meta.url);
const { chain } = require('stream-chain');
const { parser } = require('stream-json');
const { pick } = require('stream-json/filters/Pick');
const { streamArray } = require('stream-json/streamers/StreamArray');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPEN_DATA_BASE_URL = 'https://opendata.eselpoint.cz/datove-sady-esbirka';
const OPEN_DATA_DIR = path.resolve(__dirname, '../data/source/opendata');
const SEED_DIR = path.resolve(__dirname, '../data/seed');
const LAW_INDEX_PATH = path.resolve(__dirname, '../data/source/all-laws.index.json');
const TEMP_DB_PATH = path.join(OPEN_DATA_DIR, 'ingest-open-data.tmp.db');

const DATASET_FILES = {
  legalActs: '002PravniAkt.json.gz',
  legalActVersions: '001PravniAktZneni.json.gz',
  versionFragments: '003PravniAktZneniFragment.json.gz',
  fragments: '004PravniAktFragment.json.gz',
  metadata: '006PravniAktMetadata.json.gz',
} as const;

const USER_AGENT = 'Ansvar-Law-MCP/1.0 (official-esbirka-opendata-ingestion)';
const MIN_DELAY_MS = 1200;
const BATCH_SIZE = 20_000;
const LAW_SUBTYPES = new Set(['ZAKON', 'ZAKONUST']);

interface Args {
  limit: number | null;
  skipDownload: boolean;
  keepTempDb: boolean;
}

interface ParsedLawRef {
  year: string;
  number: string;
  staleUrl: string;
  lawId: string;
  seedFile: string;
}

interface DocRow {
  doc_id: number;
  law_id: string;
  stale_url: string;
  seed_file: string;
  short_name: string;
  title: string;
  full_citation: string;
  issued_date: string | null;
  in_force_date: string | null;
}

interface IndexLawRow {
  id: string;
  stale_url: string;
  seed_file: string;
  short_name: string;
  title: string;
  description: string;
}

let lastRequestAt = 0;

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let skipDownload = false;
  let keepTempDb = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--limit' && args[i + 1]) {
      limit = Number.parseInt(args[i + 1], 10);
      i += 1;
      continue;
    }
    if (arg === '--skip-download') {
      skipDownload = true;
      continue;
    }
    if (arg === '--keep-temp-db') {
      keepTempDb = true;
    }
  }

  return { limit, skipDownload, keepTempDb };
}

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

function ensureDirs(): void {
  fs.mkdirSync(OPEN_DATA_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });
}

function sanitizeFileToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function stripPrefix(value: string, prefix: string): string {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function parseActIri(actIri: string): ParsedLawRef | null {
  const normalized = stripPrefix(actIri.trim(), 'esel-esb:').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length < 5 || parts[0] !== 'eli' || parts[1] !== 'cz' || parts[2] !== 'sb') {
    return null;
  }

  const year = parts[3];
  const number = parts[4].toLowerCase();
  if (!/^\d{4}$/.test(year)) return null;
  if (number.length === 0) return null;

  const numberToken = sanitizeFileToken(number);
  if (numberToken.length === 0) return null;

  return {
    year,
    number,
    staleUrl: `/sb/${year}/${number}`,
    lawId: `cz:${number}/${year}`,
    seedFile: `zakon-${numberToken}-${year}.json`,
  };
}

function toFullCitation(citation: string, title: string): string {
  const cleanCitation = citation.trim();
  const cleanTitle = title.trim();
  if (!cleanCitation) return cleanTitle;
  if (!cleanTitle) return cleanCitation;
  if (cleanTitle.toLowerCase().includes(cleanCitation.toLowerCase())) {
    return cleanTitle;
  }
  return `${cleanCitation}, ${cleanTitle}`;
}

function clearExistingSeedFiles(): void {
  if (!fs.existsSync(SEED_DIR)) return;
  const entries = fs.readdirSync(SEED_DIR).filter(name => name.endsWith('.json'));
  for (const entry of entries) {
    fs.unlinkSync(path.join(SEED_DIR, entry));
  }
}

async function downloadDatasetFile(fileName: string, skipDownload: boolean): Promise<string> {
  const destination = path.join(OPEN_DATA_DIR, fileName);
  if (fs.existsSync(destination)) {
    return destination;
  }
  if (skipDownload) {
    throw new Error(`Missing open-data file ${destination}; run without --skip-download first.`);
  }

  const url = `${OPEN_DATA_BASE_URL}/${fileName}`;
  await waitForRateLimit();
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }

  const tempPath = `${destination}.part`;
  await pipelinePromise(
    Readable.fromWeb(response.body as unknown as ReadableStream<Uint8Array>),
    fs.createWriteStream(tempPath),
  );
  fs.renameSync(tempPath, destination);

  return destination;
}

async function forEachDatasetItem(
  gzipPath: string,
  onItem: (item: Record<string, unknown>) => void | Promise<void>,
): Promise<void> {
  const pipeline = chain([
    fs.createReadStream(gzipPath),
    createGunzip(),
    parser(),
    pick({ filter: 'položky' }),
    streamArray(),
  ]);

  for await (const chunk of pipeline) {
    await onItem((chunk as { value: Record<string, unknown> }).value);
  }
}

function createTempDb(): Database.Database {
  if (fs.existsSync(TEMP_DB_PATH)) {
    fs.unlinkSync(TEMP_DB_PATH);
  }

  const db = new Database(TEMP_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');

  db.exec(`
    CREATE TABLE docs (
      doc_id INTEGER PRIMARY KEY,
      law_id TEXT NOT NULL,
      stale_url TEXT NOT NULL,
      seed_file TEXT NOT NULL,
      short_name TEXT NOT NULL,
      title TEXT NOT NULL,
      full_citation TEXT NOT NULL,
      issued_date TEXT,
      in_force_date TEXT
    );

    CREATE TABLE doc_fragments (
      doc_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      fragment_id INTEGER NOT NULL,
      PRIMARY KEY (doc_id, position)
    );

    CREATE INDEX idx_doc_fragments_fragment ON doc_fragments(fragment_id);
    CREATE INDEX idx_doc_fragments_doc ON doc_fragments(doc_id, position);

    CREATE TABLE fragments_lookup (
      fragment_id INTEGER PRIMARY KEY,
      fragment_type TEXT,
      fragment_text TEXT
    );
  `);

  return db;
}

function buildTargetLaw(row: DocRow): TargetLaw {
  return {
    id: row.law_id,
    staleUrl: row.stale_url,
    seedFile: row.seed_file,
    shortName: row.short_name,
    titleEn: '',
    description: row.title,
  };
}

function buildDetail(row: DocRow): DocumentDetailResponse {
  return {
    staleUrl: row.stale_url,
    kodDokumentuSbirky: row.short_name,
    uplnaCitace: row.full_citation,
    zkracenaCitace: row.short_name,
    nazev: row.title,
    datumCasVyhlaseni: row.issued_date ?? undefined,
    datumUcinnostiOd: row.in_force_date ?? undefined,
    datumUcinnostiZneniOd: row.in_force_date ?? undefined,
    typZneni: 'AKTUALNI',
    sbirkaKod: 'sb',
    dokumentBaseId: row.doc_id,
  };
}

function saveAllLawsIndex(rows: IndexLawRow[], totalDiscovered: number): void {
  const payload = {
    source: 'opendata.eselpoint.cz/datove-sady-esbirka',
    fetched_at: new Date().toISOString(),
    filter: {
      kodyPodtypAktu: ['ZAKON', 'ZAKONUST'],
      start: 0,
      pocet: totalDiscovered,
    },
    total_from_api: totalDiscovered,
    discovered: rows.length,
    skipped_without_stale_url_match: [],
    laws: rows.map(row => ({
      id: row.id,
      stale_url: row.stale_url,
      seed_file: row.seed_file,
      short_name: row.short_name,
      title: row.title,
      title_en: '',
      description: row.description,
      kod_dokumentu_sbirky: row.short_name,
    })),
  };

  fs.writeFileSync(LAW_INDEX_PATH, JSON.stringify(payload, null, 2));
}

async function main(): Promise<void> {
  const { limit, skipDownload, keepTempDb } = parseArgs();
  ensureDirs();

  console.log('Czech Law MCP — Open Data Bulk Ingestion');
  console.log('========================================');
  console.log(`Source: ${OPEN_DATA_BASE_URL}`);
  if (limit) {
    console.log(`Limit: ${limit}`);
  }
  if (skipDownload) {
    console.log('Download mode: cache-only (--skip-download)');
  }
  console.log('');

  const metadataPath = await downloadDatasetFile(DATASET_FILES.metadata, skipDownload);
  const legalActsPath = await downloadDatasetFile(DATASET_FILES.legalActs, skipDownload);
  const legalActVersionsPath = await downloadDatasetFile(DATASET_FILES.legalActVersions, skipDownload);
  const versionFragmentsPath = await downloadDatasetFile(DATASET_FILES.versionFragments, skipDownload);
  const fragmentsPath = await downloadDatasetFile(DATASET_FILES.fragments, skipDownload);

  const db = createTempDb();

  const insertDoc = db.prepare(`
    INSERT INTO docs (
      doc_id, law_id, stale_url, seed_file, short_name, title, full_citation, issued_date, in_force_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertDocFragment = db.prepare(`
    INSERT INTO doc_fragments (doc_id, position, fragment_id) VALUES (?, ?, ?)
  `);
  const insertFragmentLookup = db.prepare(`
    INSERT INTO fragments_lookup (fragment_id, fragment_type, fragment_text)
    VALUES (?, ?, ?)
    ON CONFLICT(fragment_id) DO UPDATE SET
      fragment_type = excluded.fragment_type,
      fragment_text = excluded.fragment_text
  `);

  console.log('1) Selecting law acts (ZAKON + ZAKONUST) from metadata...');
  const allowedActIris = new Set<string>();
  await forEachDatasetItem(metadataPath, item => {
    const subtype = item['cis-esb-podtyp-právní-akt-položka'];
    const actIri = item['akt-iri'];
    if (typeof subtype === 'string' && typeof actIri === 'string' && LAW_SUBTYPES.has(subtype)) {
      allowedActIris.add(actIri);
    }
  });
  console.log(`   Allowed acts: ${allowedActIris.size}`);

  console.log('2) Resolving latest version document IDs...');
  const latestByAct = new Map<string, { docId: number }>();
  await forEachDatasetItem(legalActsPath, item => {
    const actIri = item['akt-iri'];
    if (typeof actIri !== 'string' || !allowedActIris.has(actIri)) return;

    const latestVersionIri = (item['právní-akt-znění-poslední'] as { iri?: unknown } | undefined)?.iri;
    const versions = Array.isArray(item['právní-akt-znění'])
      ? (item['právní-akt-znění'] as Array<Record<string, unknown>>)
      : [];

    let selected = versions.find(v => v.iri === latestVersionIri);
    if (!selected && versions.length > 0) {
      selected = versions[versions.length - 1];
    }
    if (!selected) return;

    const docId = selected['znění-dokument-id'];
    if (typeof docId !== 'number' || !Number.isFinite(docId)) return;

    latestByAct.set(actIri, { docId });
  });
  console.log(`   Latest law versions: ${latestByAct.size}`);

  const allDocIds = Array.from(latestByAct.values())
    .map(v => v.docId)
    .sort((a, b) => a - b);
  const selectedDocIds = new Set<number>(
    limit && limit > 0 ? allDocIds.slice(0, limit) : allDocIds,
  );
  console.log(`   Selected for ingestion: ${selectedDocIds.size}`);

  console.log('3) Loading selected version metadata...');
  db.exec('BEGIN');
  let docRows = 0;
  const indexRows: IndexLawRow[] = [];
  await forEachDatasetItem(legalActVersionsPath, item => {
    const docId = item['znění-dokument-id'];
    if (typeof docId !== 'number' || !selectedDocIds.has(docId)) return;

    const actIri = item['akt-iri'];
    const actCitation = item['akt-citace'];
    const title = item['akt-název-vyhlášený'];
    if (typeof actIri !== 'string' || typeof actCitation !== 'string' || typeof title !== 'string') return;

    const parsed = parseActIri(actIri);
    if (!parsed) return;

    const inForceDate = item['znění-datum-účinnosti-od'];
    const issuedDate = (item['znění-částka'] as { ['částka-datum-čas-vyhlášení']?: unknown } | undefined)?.['částka-datum-čas-vyhlášení'];
    const fullCitation = toFullCitation(actCitation, title);

    insertDoc.run(
      docId,
      parsed.lawId,
      parsed.staleUrl,
      parsed.seedFile,
      actCitation,
      title,
      fullCitation,
      typeof issuedDate === 'string' ? issuedDate : null,
      typeof inForceDate === 'string' ? inForceDate : null,
    );
    indexRows.push({
      id: parsed.lawId,
      stale_url: parsed.staleUrl,
      seed_file: parsed.seedFile,
      short_name: actCitation,
      title,
      description: title,
    });
    docRows += 1;
    if (docRows % BATCH_SIZE === 0) {
      db.exec('COMMIT; BEGIN');
    }
  });
  db.exec('COMMIT');
  console.log(`   Metadata rows loaded: ${docRows}`);

  console.log('4) Loading version fragment mappings...');
  const nextPosition = new Map<number, number>();
  const neededFragmentIds = new Set<number>();
  db.exec('BEGIN');
  let mappingRows = 0;
  await forEachDatasetItem(versionFragmentsPath, item => {
    const docId = item['znění-dokument-id'];
    if (typeof docId !== 'number' || !selectedDocIds.has(docId)) return;

    const fragmentId = (item['právní-akt-fragment'] as { ['fragment-id']?: unknown } | undefined)?.['fragment-id'];
    if (typeof fragmentId !== 'number' || !Number.isFinite(fragmentId)) return;

    const position = nextPosition.get(docId) ?? 0;
    nextPosition.set(docId, position + 1);
    insertDocFragment.run(docId, position, fragmentId);
    neededFragmentIds.add(fragmentId);

    mappingRows += 1;
    if (mappingRows % BATCH_SIZE === 0) {
      db.exec('COMMIT; BEGIN');
    }
  });
  db.exec('COMMIT');
  console.log(`   Fragment mappings loaded: ${mappingRows}`);
  console.log(`   Unique needed fragments: ${neededFragmentIds.size}`);

  console.log('5) Loading fragment text/type lookup...');
  db.exec('BEGIN');
  let fragmentRows = 0;
  await forEachDatasetItem(fragmentsPath, item => {
    const fragmentId = item['fragment-id'];
    if (typeof fragmentId !== 'number' || !neededFragmentIds.has(fragmentId)) return;

    const type = item['cis-esb-typ-fragmentu-položka'];
    const text = item['fragment-text'];
    insertFragmentLookup.run(
      fragmentId,
      typeof type === 'string' ? type : null,
      typeof text === 'string' ? text : null,
    );

    fragmentRows += 1;
    if (fragmentRows % BATCH_SIZE === 0) {
      db.exec('COMMIT; BEGIN');
    }
  });
  db.exec('COMMIT');
  console.log(`   Fragment lookup rows loaded: ${fragmentRows}`);

  console.log('6) Building seed files...');
  clearExistingSeedFiles();

  const docs = db.prepare<[], DocRow>(`
    SELECT doc_id, law_id, stale_url, seed_file, short_name, title, full_citation, issued_date, in_force_date
    FROM docs
    ORDER BY doc_id ASC
  `).all();

  const selectFragments = db.prepare<[number], {
    position: number;
    fragment_id: number;
    fragment_type: string | null;
    fragment_text: string | null;
  }>(`
    SELECT df.position, df.fragment_id, fl.fragment_type, fl.fragment_text
    FROM doc_fragments df
    LEFT JOIN fragments_lookup fl ON fl.fragment_id = df.fragment_id
    WHERE df.doc_id = ?
    ORDER BY df.position ASC
  `);

  let written = 0;
  let missingFragmentTypeTotal = 0;
  let missingFragmentTextTotal = 0;
  for (const doc of docs) {
    const targetLaw = buildTargetLaw(doc);
    const detail = buildDetail(doc);
    const rows = selectFragments.all(doc.doc_id);

    const fragments: FragmentRecord[] = rows.map(row => {
      if (!row.fragment_type) {
        missingFragmentTypeTotal += 1;
      }
      if (row.fragment_text === null || row.fragment_text === undefined) {
        missingFragmentTextTotal += 1;
      }
      return {
        id: row.fragment_id,
        kodTypuFragmentu: row.fragment_type ?? 'Unknown',
        xhtml: row.fragment_text ?? undefined,
        jeUcinny: true,
      };
    });

    const seed = parseLawSeed(targetLaw, detail, fragments);
    fs.writeFileSync(path.join(SEED_DIR, targetLaw.seedFile), JSON.stringify(seed, null, 2));
    written += 1;

    if (written % 250 === 0) {
      console.log(`   Seeded ${written}/${docs.length} laws...`);
    }
  }
  console.log(`   Seed files written: ${written}`);
  console.log(`   Missing fragment type values: ${missingFragmentTypeTotal}`);
  console.log(`   Missing fragment text values: ${missingFragmentTextTotal}`);

  saveAllLawsIndex(indexRows, latestByAct.size);
  console.log(`7) Updated law index: ${LAW_INDEX_PATH}`);

  db.close();
  if (!keepTempDb && fs.existsSync(TEMP_DB_PATH)) {
    fs.unlinkSync(TEMP_DB_PATH);
  }

  console.log('\nOpen-data bulk ingestion completed.');
}

main().catch(error => {
  console.error('Fatal open-data ingestion error:', error);
  process.exit(1);
});
