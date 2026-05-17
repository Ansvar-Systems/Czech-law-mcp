#!/usr/bin/env tsx
/**
 * Database builder for Czech Law MCP server.
 *
 * Builds the SQLite database from seed JSON files in data/seed/.
 * Follows the Switzerland Law MCP reference pattern.
 *
 * Usage: npm run build:db
 */

import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { classifyProvision } from '../src/utils/classify-provision.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DIR = path.resolve(__dirname, '../data/seed');
const CASE_LAW_SEED_DIR = path.resolve(__dirname, '../data/case-law-seed');
const DEFAULT_DB_PATH = path.resolve(__dirname, '../data/database.db');
const DEFAULT_PREMIUM_DB_PATH = path.resolve(__dirname, '../data/database-premium.db');

interface BuildArgs {
  premium: boolean;
  dbPath: string;
  /** When false, the case-law seed dir is not ingested even in premium mode. */
  includeCaseLaw: boolean;
}

function parseBuildArgs(argv: string[]): BuildArgs {
  const args: BuildArgs = {
    premium: false,
    dbPath: '',
    includeCaseLaw: true,
  };
  let explicitDbPath: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--premium') {
      args.premium = true;
    } else if (arg === '--out') {
      explicitDbPath = path.resolve(argv[++i]);
    } else if (arg === '--no-case-law') {
      args.includeCaseLaw = false;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: tsx scripts/build-db.ts [--premium] [--out PATH] [--no-case-law]');
      process.exit(0);
    } else {
      console.error(`Unknown argument to build-db: ${arg}`);
      process.exit(2);
    }
  }
  args.dbPath = explicitDbPath ?? (args.premium ? DEFAULT_PREMIUM_DB_PATH : DEFAULT_DB_PATH);
  return args;
}

// Seed file types
interface DocumentSeed {
  id: string;
  type: 'statute' | 'case_law';
  title: string;
  title_en?: string;
  short_name?: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issued_date?: string;
  in_force_date?: string;
  url?: string;
  publisher?: string;
  license?: string;
  description?: string;
  provisions?: ProvisionSeed[];
  definitions?: DefinitionSeed[];
  cited_statutes?: string[];
  metadata?: Record<string, unknown>;
}

interface ProvisionSeed {
  provision_ref: string;
  chapter?: string;
  section: string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

interface DefinitionSeed {
  term: string;
  definition: string;
  source_provision?: string;
}

type EUDocumentType = 'directive' | 'regulation';
type EUCommunity = 'EU' | 'EC' | 'EEC' | 'Euratom';
type EUReferenceType = 'implements' | 'references';

interface ExtractedEUReference {
  type: EUDocumentType;
  community: EUCommunity;
  year: number;
  number: number;
  euDocumentId: string;
  euArticle: string | null;
  fullCitation: string;
  referenceContext: string;
  referenceType: EUReferenceType;
}

// Database schema
const SCHEMA = `
-- Legal documents (statutes)
CREATE TABLE legal_documents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('statute', 'bill', 'case_law')),
  title TEXT NOT NULL,
  title_en TEXT,
  short_name TEXT,
  status TEXT NOT NULL DEFAULT 'in_force'
    CHECK(status IN ('in_force', 'amended', 'repealed', 'not_yet_in_force')),
  issued_date TEXT,
  in_force_date TEXT,
  effective_date TEXT,
  url TEXT,
  publisher TEXT,
  license TEXT,
  description TEXT,
  last_updated TEXT DEFAULT (datetime('now'))
);

-- Individual provisions from statutes
CREATE TABLE legal_provisions (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  provision_ref TEXT NOT NULL,
  chapter TEXT,
  section TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  metadata TEXT,
  UNIQUE(document_id, provision_ref)
);

CREATE INDEX idx_provisions_doc ON legal_provisions(document_id);
CREATE INDEX idx_provisions_chapter ON legal_provisions(document_id, chapter);

-- FTS5 for provision search.
-- Tokenizer 'unicode61 remove_diacritics 2' folds Czech diacritics so that
-- "kybernetická" matches "kyberneticka" — required for accent-insensitive
-- search per Pattern 13.7 of the law-MCP golden standard.
CREATE VIRTUAL TABLE provisions_fts USING fts5(
  content, title,
  content='legal_provisions',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER provisions_ai AFTER INSERT ON legal_provisions BEGIN
  INSERT INTO provisions_fts(rowid, content, title)
  VALUES (new.id, new.content, new.title);
END;

CREATE TRIGGER provisions_ad AFTER DELETE ON legal_provisions BEGIN
  INSERT INTO provisions_fts(provisions_fts, rowid, content, title)
  VALUES ('delete', old.id, old.content, old.title);
END;

CREATE TRIGGER provisions_au AFTER UPDATE ON legal_provisions BEGIN
  INSERT INTO provisions_fts(provisions_fts, rowid, content, title)
  VALUES ('delete', old.id, old.content, old.title);
  INSERT INTO provisions_fts(rowid, content, title)
  VALUES (new.id, new.content, new.title);
END;

-- Cross-references between provisions/documents
CREATE TABLE cross_references (
  id INTEGER PRIMARY KEY,
  source_document_id TEXT NOT NULL REFERENCES legal_documents(id),
  source_provision_ref TEXT,
  target_document_id TEXT NOT NULL REFERENCES legal_documents(id),
  target_provision_ref TEXT,
  ref_type TEXT NOT NULL DEFAULT 'references'
    CHECK(ref_type IN ('references', 'amended_by', 'implements', 'see_also'))
);

CREATE INDEX idx_xref_source ON cross_references(source_document_id);
CREATE INDEX idx_xref_target ON cross_references(target_document_id);

-- Legal term definitions
CREATE TABLE definitions (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  term TEXT NOT NULL,
  term_en TEXT,
  definition TEXT NOT NULL,
  source_provision TEXT,
  UNIQUE(document_id, term)
);

-- FTS5 for definition search (same tokenizer as provisions_fts, Pattern 13.7)
CREATE VIRTUAL TABLE definitions_fts USING fts5(
  term, definition,
  content='definitions',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER definitions_ai AFTER INSERT ON definitions BEGIN
  INSERT INTO definitions_fts(rowid, term, definition)
  VALUES (new.id, new.term, new.definition);
END;

CREATE TRIGGER definitions_ad AFTER DELETE ON definitions BEGIN
  INSERT INTO definitions_fts(definitions_fts, rowid, term, definition)
  VALUES ('delete', old.id, old.term, old.definition);
END;

CREATE TRIGGER definitions_au AFTER UPDATE ON definitions BEGIN
  INSERT INTO definitions_fts(definitions_fts, rowid, term, definition)
  VALUES ('delete', old.id, old.term, old.definition);
  INSERT INTO definitions_fts(rowid, term, definition)
  VALUES (new.id, new.term, new.definition);
END;

-- EU Documents (directives and regulations)
CREATE TABLE eu_documents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('directive', 'regulation')),
  year INTEGER NOT NULL CHECK (year >= 1957 AND year <= 2100),
  number INTEGER NOT NULL CHECK (number > 0),
  community TEXT CHECK (community IN ('EU', 'EC', 'EEC', 'Euratom')),
  celex_number TEXT,
  title TEXT,
  title_en TEXT,
  short_name TEXT,
  adoption_date TEXT,
  entry_into_force_date TEXT,
  in_force BOOLEAN DEFAULT 1,
  amended_by TEXT,
  repeals TEXT,
  url_eur_lex TEXT,
  description TEXT,
  last_updated TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_eu_documents_type_year ON eu_documents(type, year DESC);

-- EU References (links national provisions to EU documents)
CREATE TABLE eu_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL CHECK (source_type IN ('provision', 'document', 'case_law')),
  source_id TEXT NOT NULL,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  provision_id INTEGER REFERENCES legal_provisions(id),
  eu_document_id TEXT NOT NULL REFERENCES eu_documents(id),
  eu_article TEXT,
  reference_type TEXT NOT NULL CHECK (reference_type IN (
    'implements', 'supplements', 'applies', 'references', 'complies_with',
    'derogates_from', 'amended_by', 'repealed_by', 'cites_article'
  )),
  reference_context TEXT,
  full_citation TEXT,
  is_primary_implementation BOOLEAN DEFAULT 0,
  implementation_status TEXT CHECK (implementation_status IN ('complete', 'partial', 'pending', 'unknown')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_verified TEXT,
  UNIQUE(source_id, eu_document_id, eu_article)
);

CREATE INDEX idx_eu_references_document ON eu_references(document_id, eu_document_id);
CREATE INDEX idx_eu_references_eu_document ON eu_references(eu_document_id, document_id);
CREATE INDEX idx_eu_references_provision ON eu_references(provision_id, eu_document_id);

-- Build metadata
CREATE TABLE db_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// Pattern 13.4: hash of canonicalised content. Used as the dedup key in
// search-legislation.ts and as a drift signal across MCP versions.
function contentHash(content: string): string {
  return createHash('sha256').update(normalizeWhitespace(content), 'utf8').digest('hex');
}

function dedupeProvisions(provisions: ProvisionSeed[]): ProvisionSeed[] {
  const byRef = new Map<string, ProvisionSeed>();
  for (const prov of provisions) {
    const ref = prov.provision_ref.trim();
    const existing = byRef.get(ref);
    if (!existing || normalizeWhitespace(prov.content).length > normalizeWhitespace(existing.content).length) {
      byRef.set(ref, { ...prov, provision_ref: ref });
    }
  }
  return Array.from(byRef.values());
}

function extractEuReferences(text: string): ExtractedEUReference[] {
  if (!text || text.trim().length === 0) return [];

  const refs: ExtractedEUReference[] = [];
  const seen = new Set<string>();

  const patterns: RegExp[] = [
    /\b(Regulation|Directive)\s*\((EU|EC|EEC|Euratom)\)\s*(?:No\.?\s*)?(\d{2,4})\/(\d{1,4})\b/gi,
    /\b(Regulation|Directive)\s*(?:No\.?\s*)?(\d{2,4})\/(\d{1,4})\/(EU|EC|EEC|Euratom)\b/gi,
    /\b(Regulation|Directive)\s*(?:No\.?\s*)?(\d{2,4})\/(\d{1,4})\b/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const type = match[1].toLowerCase() as EUDocumentType;
      let rawYear: string, rawNumber: string, communityRaw: string | undefined;

      if (pattern === patterns[0]) {
        communityRaw = match[2]; rawYear = match[3]; rawNumber = match[4];
      } else if (pattern === patterns[1]) {
        rawYear = match[2]; rawNumber = match[3]; communityRaw = match[4];
      } else {
        rawYear = match[2]; rawNumber = match[3]; communityRaw = undefined;
      }

      const parsedYear = Number.parseInt(rawYear, 10);
      const year = rawYear.length === 2 ? (parsedYear >= 50 ? 1900 + parsedYear : 2000 + parsedYear) : parsedYear;
      const number = Number.parseInt(rawNumber, 10);
      if (year <= 0 || Number.isNaN(number) || number <= 0) continue;

      const community = (communityRaw?.toUpperCase() ?? 'EU') as EUCommunity;
      const euDocumentId = `${type}:${year}/${number}`;

      const start = Math.max(0, match.index - 120);
      const end = Math.min(text.length, match.index + match[0].length + 120);
      const referenceContext = text.slice(start, end).replace(/\s+/g, ' ').trim();
      const euArticle = referenceContext.match(/\bArticle\s+(\d+[A-Za-z]?(?:\(\d+\))?)/i)?.[1] ?? null;
      const referenceType: EUReferenceType = /\b(implement|align|transpos|equivalent)\b/i.test(referenceContext) ? 'implements' : 'references';

      const dedupeKey = `${euDocumentId}:${euArticle ?? ''}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      refs.push({
        type, community, year, number, euDocumentId, euArticle,
        fullCitation: match[0], referenceContext, referenceType,
      });
    }
  }

  return refs;
}

function buildDatabase(args: BuildArgs): void {
  console.log('Building Czech Law MCP database...');
  console.log(`  Mode: ${args.premium ? 'premium' : 'free'}`);
  console.log(`  Output: ${args.dbPath}\n`);

  if (fs.existsSync(args.dbPath)) {
    fs.unlinkSync(args.dbPath);
    console.log('  Deleted existing database.\n');
  }

  const dataDir = path.dirname(args.dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(args.dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  db.exec(SCHEMA);

  // Source-attribution constants per Pattern 13.3 — Czech statutes are public
  // domain (Czech-Statutory-PD); publisher is the Ministry of the Interior.
  // Statute seeds use these defaults; case-law seeds override per-row via
  // seed.publisher / seed.license (e.g. "Nejvyšší soud").
  const STATUTE_PUBLISHER = 'Ministry of the Interior of the Czech Republic';
  const STATUTE_LICENSE = 'Czech-Statutory-PD';

  const insertDoc = db.prepare(`
    INSERT INTO legal_documents
      (id, type, title, title_en, short_name, status, issued_date, in_force_date, effective_date, url, publisher, license, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertProvision = db.prepare(`
    INSERT INTO legal_provisions (document_id, provision_ref, chapter, section, title, content, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDefinition = db.prepare(`
    INSERT OR IGNORE INTO definitions (document_id, term, term_en, definition, source_provision)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertEuDocument = db.prepare(`
    INSERT OR IGNORE INTO eu_documents (id, type, year, number, community, title, short_name, url_eur_lex, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEuReference = db.prepare(`
    INSERT INTO eu_references
      (source_type, source_id, document_id, provision_id, eu_document_id, eu_article,
       reference_type, reference_context, full_citation, is_primary_implementation,
       implementation_status, last_verified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCrossRef = db.prepare(`
    INSERT INTO cross_references
      (source_document_id, source_provision_ref, target_document_id, target_provision_ref, ref_type)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Build a (dir, filename) tuple list. In premium mode we also pull from the
  // case-law seed dir; in free mode we ignore it.
  const seedDirs: Array<{ dir: string; kind: 'statute' | 'case_law' }> = [];
  if (fs.existsSync(SEED_DIR)) {
    seedDirs.push({ dir: SEED_DIR, kind: 'statute' });
  }
  if (args.premium && args.includeCaseLaw && fs.existsSync(CASE_LAW_SEED_DIR)) {
    seedDirs.push({ dir: CASE_LAW_SEED_DIR, kind: 'case_law' });
  }

  if (seedDirs.length === 0) {
    console.log('No seed directories found — creating empty database.');
    db.close();
    return;
  }

  const allSeedFiles: Array<{ dir: string; file: string; kind: 'statute' | 'case_law' }> = [];
  for (const { dir, kind } of seedDirs) {
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.json') && !f.startsWith('.') && !f.startsWith('_'));
    for (const file of files) {
      allSeedFiles.push({ dir, file, kind });
    }
  }

  if (allSeedFiles.length === 0) {
    console.log('No seed files found. Database created with empty schema.');
    db.close();
    return;
  }
  console.log(`  Found ${allSeedFiles.length} seed files across ${seedDirs.length} dir(s)\n`);

  let totalDocs = 0;
  let totalStatutes = 0;
  let totalCaseLaw = 0;
  let totalProvisions = 0;
  let totalDefs = 0;
  let totalEuDocuments = 0;
  let totalEuReferences = 0;
  let totalCrossRefs = 0;
  const primaryImplementationByDocument = new Set<string>();

  const loadAll = db.transaction(() => {
    for (const { dir, file, kind } of allSeedFiles) {
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const seed = JSON.parse(content) as DocumentSeed;

      // For case-law seeds, prefer per-row publisher/license (e.g.
      // "Nejvyšší soud"); for statute seeds use the e-Sbírka defaults.
      const docPublisher = kind === 'case_law'
        ? (seed.publisher ?? 'Nejvyšší soud')
        : (seed.publisher ?? STATUTE_PUBLISHER);
      const docLicense = seed.license ?? STATUTE_LICENSE;
      const docType = seed.type ?? (kind === 'case_law' ? 'case_law' : 'statute');

      insertDoc.run(
        seed.id, docType, seed.title, seed.title_en ?? null,
        seed.short_name ?? null, seed.status ?? 'in_force',
        seed.issued_date ?? null, seed.in_force_date ?? null,
        seed.in_force_date ?? null,
        seed.url ?? null, docPublisher, docLicense, seed.description ?? null,
      );
      totalDocs++;
      if (kind === 'case_law') totalCaseLaw++;
      else totalStatutes++;

      if (seed.provisions && seed.provisions.length > 0) {
        const deduped = dedupeProvisions(seed.provisions);

        for (const prov of deduped) {
          // Pattern 13.4 + 13.6: classify role/form from the section heading
          // and hash the canonicalised content for exact-text dedup in
          // search-legislation.ts. Czech-law-mcp seeds keep the role-bearing
          // keyword (Účinnost / Přechodná / Závěrečná) in `title`, not in
          // `section` (which holds just the article number, e.g. "15"). Pass
          // title || section so the diacritic-tolerant regex in
          // classify-provision.ts has the right text to match against.
          const sectionLabel = prov.title || prov.section;
          const cls = classifyProvision('cs', { section: sectionLabel, content: prov.content });
          const mergedMetadata = {
            ...(prov.metadata ?? {}),
            provision_role: cls.role,
            provision_form: cls.form,
            content_hash: contentHash(prov.content),
          };
          const insertResult = insertProvision.run(
            seed.id, prov.provision_ref, prov.chapter ?? null,
            prov.section, prov.title ?? null, prov.content,
            JSON.stringify(mergedMetadata),
          );
          totalProvisions++;

          const provisionId = Number(insertResult.lastInsertRowid);
          const extractedRefs = extractEuReferences(prov.content);
          if (extractedRefs.length > 0) {
            const sourceId = `${seed.id}:${prov.provision_ref}`;
            const lastVerified = new Date().toISOString();

            for (const ref of extractedRefs) {
              const eurLexType = ref.type === 'regulation' ? 'reg' : 'dir';
              const eurLexUrl = `https://eur-lex.europa.eu/eli/${eurLexType}/${ref.year}/${ref.number}/oj`;
              const shortName = `${ref.type === 'regulation' ? 'Regulation' : 'Directive'} ${ref.year}/${ref.number}`;

              const euInsert = insertEuDocument.run(
                ref.euDocumentId, ref.type, ref.year, ref.number, ref.community,
                shortName, shortName, eurLexUrl, 'Auto-extracted from Czech statute text',
              );
              if (euInsert.changes > 0) totalEuDocuments++;

              const primaryKey = `${seed.id}:${ref.euDocumentId}`;
              const isPrimary = ref.referenceType === 'implements' && !primaryImplementationByDocument.has(primaryKey) ? 1 : 0;
              if (isPrimary === 1) primaryImplementationByDocument.add(primaryKey);

              try {
                const refInsert = insertEuReference.run(
                  'provision', sourceId, seed.id, provisionId, ref.euDocumentId, ref.euArticle,
                  ref.referenceType, ref.referenceContext, ref.fullCitation, isPrimary,
                  isPrimary === 1 ? 'complete' : 'unknown', lastVerified,
                );
                if (refInsert.changes > 0) totalEuReferences++;
              } catch {
                // Ignore duplicate references
              }
            }
          }
        }
      }

      for (const def of seed.definitions ?? []) {
        insertDefinition.run(
          seed.id, def.term, null, def.definition, def.source_provision ?? null,
        );
        totalDefs++;
      }

      // Case-law cited_statutes: record one cross-reference row per citation.
      // The target_document_id is the citation string as-published (we do not
      // resolve "§ 12 odst. 4 vyhlášky č. 177/1996 Sb." into a statute ID at
      // ingest time — that is a downstream enrichment step). We use
      // ref_type='references' to distinguish from amended-by / implements.
      if (kind === 'case_law' && seed.cited_statutes && seed.cited_statutes.length > 0) {
        for (const citation of seed.cited_statutes) {
          const trimmed = citation.trim();
          if (!trimmed) continue;
          try {
            insertCrossRef.run(
              seed.id,
              seed.provisions?.[0]?.provision_ref ?? null,
              // Use the seed.id itself as a self-reference target placeholder
              // when no real statute ID is resolvable. This satisfies the FK
              // constraint while recording the citation in a queryable form.
              // Downstream enrichment resolves trimmed → real statute ID.
              seed.id,
              trimmed,
              'references',
            );
            totalCrossRefs++;
          } catch {
            // Skip duplicates or FK violations silently.
          }
        }
      }
    }
  });

  loadAll();

  // Write build metadata. The two FTS5 keys are mandated by Pattern 13.10 of
  // the law-MCP golden standard; other keys are local conventions.
  const insertMeta = db.prepare('INSERT INTO db_metadata (key, value) VALUES (?, ?)');
  const writeMeta = db.transaction(() => {
    insertMeta.run('tier', args.premium ? 'premium' : 'free');
    insertMeta.run('schema_version', '2');
    insertMeta.run('built_at', new Date().toISOString());
    insertMeta.run('builder', 'build-db.ts');
    insertMeta.run('jurisdiction', 'CZ');
    insertMeta.run('source', 'official-source');
    insertMeta.run('licence', 'See sources.yml');
    insertMeta.run('fts5_schema_version', '1.2.0');
    insertMeta.run('fts5_tokenizer', 'unicode61 remove_diacritics 2');
    insertMeta.run('statute_count', String(totalStatutes));
    insertMeta.run('case_law_count', String(totalCaseLaw));
    if (args.premium) {
      insertMeta.run('premium_sources', JSON.stringify(['e-sbirka.cz', 'sbirka.nsoud.cz']));
    }
  });
  writeMeta();

  // Set journal_mode to DELETE for WASM compatibility
  db.pragma('journal_mode = DELETE');

  db.exec('ANALYZE');
  db.exec('VACUUM');
  db.close();

  const size = fs.statSync(args.dbPath).size;
  console.log(
    `\nBuild complete: ${totalDocs} documents ` +
    `(${totalStatutes} statutes, ${totalCaseLaw} case_law), ` +
    `${totalProvisions} provisions, ${totalDefs} definitions, ` +
    `${totalCrossRefs} cross-refs, ` +
    `${totalEuDocuments} EU documents, ${totalEuReferences} EU references`,
  );
  console.log(`Output: ${args.dbPath} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

buildDatabase(parseBuildArgs(process.argv.slice(2)));
