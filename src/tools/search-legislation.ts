/**
 * search_legislation — Full-text search across Czech statute provisions.
 *
 * Implements Pattern 13 of the law-MCP golden standard:
 *   §13.1  BM25 column weighting (title weighted 10× content)
 *   §13.3  Source-attribution fields on every result (Gate 13)
 *   §13.4  Dedup keyed on (document_id, provision_ref, content_hash)
 *   §13.5  Multi-token degradation in buildFtsQueryVariants (utils/fts-query.ts)
 *   §13.6  Default-filter to provision_role='substantive' (caller can opt out)
 *   §13.9  Canonical SearchLegislationResult envelope (flat fields, no per-item _citation nesting)
 *
 * Spec: docs/guides/law-mcp-golden-standard.md Pattern 13
 */

import type Database from '@ansvar/mcp-sqlite';
import { buildFtsQueryVariants, buildLikePattern, sanitizeFtsInput } from '../utils/fts-query.js';
import { resolveDocumentId } from '../utils/statute-id.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface SearchLegislationInput {
  query: string;
  document_id?: string;
  status?: string;
  as_of_date?: string;
  limit?: number;
  /**
   * Include transitional and effectiveness clauses in results. Default false:
   * search returns substantive provisions only, matching how a Czech lawyer
   * reads the corpus. Set true when explicitly hunting for "Účinnost" /
   * "Přechodná" sections (§13.6).
   */
  include_non_substantive?: boolean;
  /**
   * Optional informational filter on provision form (body / appendix /
   * definitions / table / catalogue). NEVER applied by default — appendices
   * and definitions can be binding substantive law (§13.6).
   */
  provision_form?: 'body' | 'appendix' | 'definitions' | 'table' | 'catalogue';
}

/**
 * Canonical search-response envelope per Pattern 13.9 (flat fields, no
 * per-result _citation nesting). The gateway pass-through model assumes the
 * MCP populates these fields directly from the joined legal_documents row.
 */
export interface SearchLegislationResult {
  // Identity
  document_id: string;
  document_title: string;
  provision_ref: string;
  chapter: string | null;
  section: string;
  title: string | null;

  // Content
  snippet: string;
  relevance: number;

  // Source attribution (Gate 13)
  source_url: string;
  publisher: string;
  license: string;
  effective_date?: string;
  attribution_text?: string;
  last_verified?: string;

  // Search-quality (§13.4 + §13.6)
  content_hash: string;
  provision_role: 'substantive' | 'transitional' | 'effectiveness';
  provision_form: 'body' | 'appendix' | 'definitions' | 'table' | 'catalogue';
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

// SELECT shape used by both FTS and LIKE branches; columns must stay in the
// declared SearchLegislationResult order so consumers can rely on positional
// JSON keys (audit script reads them by name, but downstream test snapshots
// pin the order).
const SELECT_COLS = `
  lp.document_id,
  ld.title AS document_title,
  lp.provision_ref,
  lp.chapter,
  lp.section,
  lp.title,
  ld.url AS source_url,
  COALESCE(ld.publisher, '') AS publisher,
  COALESCE(ld.license, '') AS license,
  ld.effective_date,
  json_extract(lp.metadata, '$.provision_role') AS provision_role_raw,
  json_extract(lp.metadata, '$.provision_form') AS provision_form_raw,
  COALESCE(json_extract(lp.metadata, '$.content_hash'), '') AS content_hash
`;

// Raw row shape from SQLite — provision_role / provision_form arrive as
// strings; we coerce to the typed enum (with substantive / body defaults
// per §13.6 back-compat for un-backfilled MCPs).
interface RawRow {
  document_id: string;
  document_title: string;
  provision_ref: string;
  chapter: string | null;
  section: string;
  title: string | null;
  source_url: string | null;
  publisher: string;
  license: string;
  effective_date: string | null;
  provision_role_raw: string | null;
  provision_form_raw: string | null;
  content_hash: string;
  snippet: string;
  relevance: number;
}

function shapeResult(r: RawRow): SearchLegislationResult {
  return {
    document_id: r.document_id,
    document_title: r.document_title,
    provision_ref: r.provision_ref,
    chapter: r.chapter,
    section: r.section,
    title: r.title,
    snippet: r.snippet,
    relevance: r.relevance,
    source_url: r.source_url ?? '',
    publisher: r.publisher,
    license: r.license,
    ...(r.effective_date && { effective_date: r.effective_date }),
    content_hash: r.content_hash,
    provision_role:
      (r.provision_role_raw as SearchLegislationResult['provision_role']) ?? 'substantive',
    provision_form:
      (r.provision_form_raw as SearchLegislationResult['provision_form']) ?? 'body',
  };
}

export async function searchLegislation(
  db: InstanceType<typeof Database>,
  input: SearchLegislationInput,
): Promise<ToolResponse<SearchLegislationResult[]>> {
  if (!input.query || input.query.trim().length === 0) {
    return { results: [], _metadata: generateResponseMetadata(db) };
  }

  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  // Fetch extra rows to absorb post-fetch dedup losses (§13.4).
  const fetchLimit = limit * 2;
  const queryVariants = buildFtsQueryVariants(sanitizeFtsInput(input.query));

  let resolvedDocId: string | undefined;
  if (input.document_id) {
    const resolved = resolveDocumentId(db, input.document_id);
    resolvedDocId = resolved ?? undefined;
    if (!resolved) {
      return {
        results: [],
        _metadata: {
          ...generateResponseMetadata(db),
          note: `No document found matching "${input.document_id}"`,
        },
      };
    }
  }

  let queryStrategy = 'none';
  for (const ftsQuery of queryVariants) {
    let sql = `
      SELECT
        ${SELECT_COLS},
        snippet(provisions_fts, 0, '>>>', '<<<', '...', 32) AS snippet,
        bm25(provisions_fts, 1.0, 10.0) AS relevance
      FROM provisions_fts
      JOIN legal_provisions lp ON lp.id = provisions_fts.rowid
      JOIN legal_documents  ld ON ld.id = lp.document_id
      WHERE provisions_fts MATCH ?
    `;
    const params: (string | number)[] = [ftsQuery];

    // §13.6: default-filter to substantive provisions; opt-out via
    // include_non_substantive=true. COALESCE preserves behaviour for
    // un-backfilled rows (treat missing as substantive).
    if (!input.include_non_substantive) {
      sql += ` AND COALESCE(json_extract(lp.metadata, '$.provision_role'), 'substantive') = 'substantive'`;
    }

    // §13.6: provision_form filter is OPT-IN only. Never applied by default.
    if (input.provision_form) {
      sql += ` AND COALESCE(json_extract(lp.metadata, '$.provision_form'), 'body') = ?`;
      params.push(input.provision_form);
    }

    if (resolvedDocId) {
      sql += ' AND lp.document_id = ?';
      params.push(resolvedDocId);
    }

    if (input.status) {
      sql += ' AND ld.status = ?';
      params.push(input.status);
    }

    sql += ' ORDER BY relevance LIMIT ?';
    params.push(fetchLimit);

    try {
      const rows = db.prepare(sql).all(...params) as RawRow[];
      if (rows.length > 0) {
        queryStrategy = ftsQuery === queryVariants[0] ? 'exact' : 'fallback';
        const shaped = rows.map(shapeResult);
        const deduped = deduplicateResults(shaped, limit);
        return {
          results: deduped,
          _metadata: {
            ...generateResponseMetadata(db),
            ...(queryStrategy === 'fallback' ? { query_strategy: 'broadened' } : {}),
          },
        };
      }
    } catch {
      // FTS query syntax error — try next variant.
      continue;
    }
  }

  // LIKE fallback — final tier when FTS5 returns no results across all variants.
  {
    const likePattern = buildLikePattern(sanitizeFtsInput(input.query));
    let likeSql = `
      SELECT
        ${SELECT_COLS},
        substr(lp.content, 1, 200) AS snippet,
        0 AS relevance
      FROM legal_provisions lp
      JOIN legal_documents ld ON ld.id = lp.document_id
      WHERE lp.content LIKE ?
    `;
    const likeParams: (string | number)[] = [likePattern];

    if (!input.include_non_substantive) {
      likeSql += ` AND COALESCE(json_extract(lp.metadata, '$.provision_role'), 'substantive') = 'substantive'`;
    }
    if (input.provision_form) {
      likeSql += ` AND COALESCE(json_extract(lp.metadata, '$.provision_form'), 'body') = ?`;
      likeParams.push(input.provision_form);
    }
    if (resolvedDocId) {
      likeSql += ' AND lp.document_id = ?';
      likeParams.push(resolvedDocId);
    }
    if (input.status) {
      likeSql += ' AND ld.status = ?';
      likeParams.push(input.status);
    }

    likeSql += ' LIMIT ?';
    likeParams.push(fetchLimit);

    try {
      const rows = db.prepare(likeSql).all(...likeParams) as RawRow[];
      if (rows.length > 0) {
        const shaped = rows.map(shapeResult);
        return {
          results: deduplicateResults(shaped, limit),
          _metadata: {
            ...generateResponseMetadata(db),
            query_strategy: 'like_fallback',
          },
        };
      }
    } catch {
      // LIKE query failed.
    }
  }

  return { results: [], _metadata: generateResponseMetadata(db) };
}

/**
 * §13.4 — dedup keyed on (document_id, provision_ref, content_hash). Catches
 * byte-identical content under different references (the Czech failure case)
 * AND a single FTS5 row matching twice. Preserves BM25 order via first-wins.
 */
function deduplicateResults(
  rows: SearchLegislationResult[],
  limit: number,
): SearchLegislationResult[] {
  const seen = new Set<string>();
  const out: SearchLegislationResult[] = [];
  for (const row of rows) {
    const key = `${row.document_id}::${row.provision_ref}::${row.content_hash}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}
