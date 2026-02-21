/**
 * Response metadata utilities for Czech Law MCP.
 */

import type Database from '@ansvar/mcp-sqlite';

export interface ResponseMetadata {
  data_source: string;
  jurisdiction: string;
  disclaimer: string;
  freshness?: string;
}

export interface ToolResponse<T> {
  results: T;
  _metadata: ResponseMetadata;
}

export function generateResponseMetadata(
  db: InstanceType<typeof Database>,
): ResponseMetadata {
  let freshness: string | undefined;
  try {
    const row = db.prepare(
      "SELECT value FROM db_metadata WHERE key = 'built_at'"
    ).get() as { value: string } | undefined;
    if (row) freshness = row.value;
  } catch {
    // Ignore
  }

  return {
    data_source: 'Sbírka zákonů (Collection of Laws) (www.zakonyprolidi.cz) — Ministry of the Interior of the Czech Republic',
    jurisdiction: 'CZ',
    disclaimer:
      'This data is sourced from the Sbírka zákonů (Collection of Laws) under public domain. ' +
      'The authoritative versions are maintained by Ministry of the Interior of the Czech Republic. ' +
      'Always verify with the official Sbírka zákonů (Collection of Laws) portal (www.zakonyprolidi.cz).',
    freshness,
  };
}
