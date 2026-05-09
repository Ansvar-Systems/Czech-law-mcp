/**
 * Response metadata utilities for Czech Law MCP.
 */

import type Database from '@ansvar/mcp-sqlite';

export interface ResponseMetadata {
  data_source: string;
  jurisdiction: string;
  disclaimer: string;
  freshness?: string;
  note?: string;
  query_strategy?: string;
  // Pattern 13.10: surface FTS5 schema-version + tokenizer to consumers so
  // the gateway and audit tooling can detect drift across deployments.
  fts5_schema_version?: string;
  fts5_tokenizer?: string;
}

export interface ToolResponse<T> {
  results: T;
  _metadata: ResponseMetadata;
  _citation?: import('./citation.js').CitationMetadata;
}

export function generateResponseMetadata(
  db: InstanceType<typeof Database>,
): ResponseMetadata {
  let freshness: string | undefined;
  let ftsSchemaVersion: string | undefined;
  let ftsTokenizer: string | undefined;
  try {
    const row = db.prepare(
      "SELECT key, value FROM db_metadata WHERE key IN ('built_at', 'fts5_schema_version', 'fts5_tokenizer')"
    ).all() as { key: string; value: string }[];
    for (const r of row) {
      if (r.key === 'built_at') freshness = r.value;
      else if (r.key === 'fts5_schema_version') ftsSchemaVersion = r.value;
      else if (r.key === 'fts5_tokenizer') ftsTokenizer = r.value;
    }
  } catch {
    // Ignore — db_metadata absent on un-rebuilt DBs
  }

  return {
    data_source: 'Sbírka zákonů (Collection of Laws) (www.zakonyprolidi.cz) — Ministry of the Interior of the Czech Republic',
    jurisdiction: 'CZ',
    disclaimer:
      'This data is sourced from the Sbírka zákonů (Collection of Laws) under public domain. ' +
      'The authoritative versions are maintained by Ministry of the Interior of the Czech Republic. ' +
      'Always verify with the official Sbírka zákonů (Collection of Laws) portal (www.zakonyprolidi.cz).',
    freshness,
    ...(ftsSchemaVersion && { fts5_schema_version: ftsSchemaVersion }),
    ...(ftsTokenizer && { fts5_tokenizer: ftsTokenizer }),
  };
}
