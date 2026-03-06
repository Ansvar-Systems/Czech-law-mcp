/**
 * Statute ID resolution for Czech Law MCP.
 *
 * Resolves fuzzy document references (titles, IDs) to database document IDs.
 * Czech legislation identifier resolution
 * (e.g., "Privacy Act 1988", "Corporations Act 2001").
 */

import type Database from '@ansvar/mcp-sqlite';

/**
 * Resolve a document identifier to a database document ID.
 * Supports:
 * - Direct ID match (e.g., "privacy-act-1988")
 * - Title match (e.g., "Privacy Act 1988", "Privacy Act")
 * - Short name/abbreviation match (e.g., "SOCI Act")
 * - Fuzzy title substring match
 */
export function resolveDocumentId(
  db: InstanceType<typeof Database>,
  input: string,
): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Direct ID match
  const directMatch = db.prepare(
    'SELECT id FROM legal_documents WHERE id = ?'
  ).get(trimmed) as { id: string } | undefined;
  if (directMatch) return directMatch.id;

  // Exact short-name match first (prevents broad collisions on short tokens like "OZ").
  const exactShortName = db.prepare(
    'SELECT id FROM legal_documents WHERE LOWER(short_name) = LOWER(?) LIMIT 1'
  ).get(trimmed) as { id: string } | undefined;
  if (exactShortName) return exactShortName.id;

  const exactTitle = db.prepare(
    'SELECT id FROM legal_documents WHERE LOWER(title) = LOWER(?) LIMIT 1'
  ).get(trimmed) as { id: string } | undefined;
  if (exactTitle) return exactTitle.id;

  const exactTitleEn = db.prepare(
    'SELECT id FROM legal_documents WHERE LOWER(title_en) = LOWER(?) LIMIT 1'
  ).get(trimmed) as { id: string } | undefined;
  if (exactTitleEn) return exactTitleEn.id;

  // Prefer short_name fuzzy matches before broad title matches.
  const fuzzyShortName = db.prepare(
    'SELECT id FROM legal_documents WHERE LOWER(short_name) LIKE LOWER(?) ORDER BY LENGTH(short_name) ASC LIMIT 1'
  ).get(`%${trimmed}%`) as { id: string } | undefined;
  if (fuzzyShortName) return fuzzyShortName.id;

  const fuzzyTitle = db.prepare(
    'SELECT id FROM legal_documents WHERE LOWER(title) LIKE LOWER(?) OR LOWER(title_en) LIKE LOWER(?) ORDER BY LENGTH(title) ASC LIMIT 1'
  ).get(`%${trimmed}%`, `%${trimmed}%`) as { id: string } | undefined;
  if (fuzzyTitle) return fuzzyTitle.id;

  return null;
}
