/**
 * FTS5 query helpers for Czech Law MCP.
 *
 * Handles query sanitization and variant generation for SQLite FTS5.
 */

/**
 * Sanitize user input for safe FTS5 queries.
 * Removes characters that have special meaning in FTS5 syntax.
 */
export function sanitizeFtsInput(input: string): string {
  // Preserve trailing * on words (FTS5 prefix search) but strip other special chars
  return input
    .replace(/['"(){}[\]^~:]/g, ' ')
    .replace(/\*(?!\s|$)/g, ' ')    // strip * unless at end of word
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build FTS5 query variants for a search term.
 *
 * For 1-3 tokens: phrase → AND → AND-with-prefix-on-last (specificity ladder).
 * For ≥4 tokens: phrase → top-2-significant-tokens-AND only — Pattern 13.5
 * degradation, prevents the 4-token Czech timeout the customer hit. The
 * 4+ AND-concatenation routinely exceeds 5s on diacritic-bearing FTS5
 * indexes; degradation keeps response time under the latency budget.
 *
 * Standard: docs/guides/law-mcp-golden-standard.md Pattern 13.5
 */
export function buildFtsQueryVariants(sanitized: string): string[] {
  if (!sanitized || sanitized.trim().length === 0) {
    return [];
  }

  const terms = sanitized.split(/\s+/).filter(t => t.length > 0);
  if (terms.length === 0) return [];

  const variants: string[] = [];

  // Pattern 13.5: ≥4 tokens degrade — phrase + top-2-significant-tokens AND.
  if (terms.length >= 4) {
    variants.push(`"${terms.join(' ')}"`);
    const significant = terms.filter(t => t.length >= 4).slice(0, 2);
    if (significant.length === 2) {
      variants.push(significant.join(' AND '));
    }
    return variants;
  }

  // 1-3 tokens: full specificity ladder.
  // Exact phrase (multi-term only)
  if (terms.length > 1) {
    variants.push(`"${terms.join(' ')}"`);
  }

  // AND query (or bare term for 1-token)
  variants.push(terms.join(' AND '));

  // Prefix match (autocomplete-like)
  if (terms.length === 1 && terms[0].length >= 3) {
    variants.push(`${terms[0]}*`);
  } else if (terms.length > 1) {
    const prefix = [...terms.slice(0, -1), `${terms[terms.length - 1]}*`];
    variants.push(prefix.join(' AND '));
  }

  return variants;
}

/**
 * Build a SQL LIKE pattern from search terms.
 * Used as a final fallback when FTS5 returns no results.
 * Example: "penalty offence" -> "%penalty%offence%"
 */
export function buildLikePattern(query: string): string {
  const terms = query.trim().split(/\s+/).filter(t => t.length > 0);
  if (terms.length === 0) return '%';
  return `%${terms.join('%')}%`;
}
