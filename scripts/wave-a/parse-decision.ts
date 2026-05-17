/**
 * HTML parser for sbirka.nsoud.cz decision pages.
 *
 * Each decision page has the structure:
 *   <h1 class="h1">{TypDecision} Nejvyššího soudu ze dne {date}, sp. zn. {spis_zn}[, ECLI:CZ:NS:...]</h1>
 *   <table class="content-table">
 *     <tr><td>Právní věta:</td><td>{summary HTML}</td></tr>
 *     <tr><td>Soud:</td><td>{Nejvyšší soud}</td></tr>
 *     <tr><td>Datum rozhodnutí:</td><td>{DD.MM.YYYY}</td></tr>
 *     <tr><td>Spisová značka:</td><td>{spis_zn}</td></tr>
 *     <tr><td>Číslo rozhodnutí:</td><td>{number}</td></tr>
 *     <tr><td>Rok:</td><td>{YYYY}</td></tr>
 *     <tr><td>Sešit:</td><td>{N}</td></tr>
 *     <tr><td>Typ rozhodnutí:</td><td>{Usnesení|Rozsudek|...}</td></tr>
 *     <tr><td>Heslo:</td><td>{keyword, keyword, ...}</td></tr>
 *     <tr><td>Předpisy:</td><td>{cited statutes as HTML}</td></tr>
 *     <tr><td>Druh:</td><td>{Rozhodnutí ve věcech ...}</td></tr>
 *     <tr><td></td><td>Sbírkový text rozhodnutí — full body HTML</td></tr>
 *   </table>
 *
 * Older decisions (pre-ECLI era) omit ECLI from the title and may omit
 * Soud field. The parser falls back gracefully for those.
 */

export interface ParsedDecision {
  // URL the page was fetched from. Required for the citation envelope.
  source_url: string;
  // Numeric collection ID from /sbirka/{id}/ in the URL.
  collection_id: string;
  // Decision title from <h1>. Verbatim Czech.
  title: string;
  // Decision type (Usnesení, Rozsudek, Stanovisko, etc.) parsed from "Typ rozhodnutí" or title.
  decision_type: string | null;
  // ECLI if present in title (post-2012 decisions). Format: ECLI:CZ:NS:YYYY:spis_zn.
  ecli: string | null;
  // Spisová značka (file number). Always present.
  spis_zn: string | null;
  // Decision date as ISO 8601 (YYYY-MM-DD).
  decision_date: string | null;
  // Court name. Always "Nejvyšší soud" for this corpus.
  court: string;
  // Collection issue number (Číslo rozhodnutí within the curated Sbírka).
  collection_number: string | null;
  // Collection year and booklet number (rok / sešit).
  collection_year: string | null;
  collection_booklet: string | null;
  // Keyword list (Heslo). Comma-separated in source HTML.
  keywords: string[];
  // Cited statutes/provisions (Předpisy). Free-text list separated by <br/>.
  cited_statutes: string[];
  // Druh field (decision category).
  category: string | null;
  // Právní věta (legal headnote). Short summary text without HTML tags.
  headnote: string | null;
  // Full Sbírkový text rozhodnutí — concatenated paragraph text with HTML tags stripped.
  body_text: string;
  // Per-source-URL signature of the body content (sha256 hash applied externally).
  raw_body_html: string;
}

/**
 * Extract a single field from the content-table by its left-column label.
 * Returns the raw HTML of the right cell, or null if the row is absent.
 */
function extractFieldHtml(html: string, label: string): string | null {
  // Each row is `<tr>...<td>{label}...</td>...<td[...]>{value}</td></tr>`.
  // The label cell can contain extra markup (tooltip, info icon, whitespace).
  // We match the literal label string anywhere inside the first <td>.
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<tr[^>]*>\\s*<td[^>]*>[\\s\\S]*?${escaped}[\\s\\S]*?<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>\\s*<\\/tr>`,
    'i',
  );
  const m = html.match(re);
  return m ? m[1] : null;
}

/**
 * Strip HTML tags and decode common entities. Preserves paragraph breaks as
 * double newlines so downstream FTS5 indexing sees sentence boundaries.
 */
function stripHtml(html: string): string {
  let text = html;
  // Convert <br/> and <p>/<br> to newlines before tag-stripping.
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/?(p|div|li|tr|td)[^>]*>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  // Decode common entities.
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#039;|&apos;/g, "'");
  text = text.replace(/&[a-z]+;/gi, ' ');
  // Collapse whitespace per-line, keep paragraph breaks.
  text = text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).join('\n');
  // Collapse 3+ newlines to 2.
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

const ECLI_RE = /ECLI:CZ:NS:\d{4}:[A-Z0-9.]+/;
const SPIS_ZN_RE = /sp\.\s*zn\.\s*([0-9A-Za-z\s./-]+?)(?:\s*,\s*ECLI|$)/i;

/**
 * Parse a fetched sbirka.nsoud.cz decision HTML page into a structured row.
 */
export function parseDecision(html: string, sourceUrl: string): ParsedDecision {
  const collectionId = extractCollectionId(sourceUrl);

  // <h1 class="h1">...</h1>
  const h1Match = html.match(/<h1\s+class="h1"[^>]*>([\s\S]*?)<\/h1>/i);
  const title = h1Match ? stripHtml(h1Match[1]) : '';

  // ECLI from title (post-2012 decisions only).
  const ecliMatch = title.match(ECLI_RE);
  const ecli = ecliMatch ? ecliMatch[0] : null;

  // Spisová značka: prefer the dedicated table row; fall back to parsing from h1.
  const spisZnHtml = extractFieldHtml(html, 'Spisová značka:');
  let spisZn: string | null = spisZnHtml ? stripHtml(spisZnHtml).trim() : null;
  if (!spisZn) {
    const m = title.match(SPIS_ZN_RE);
    if (m) spisZn = m[1].trim();
  }

  // Datum rozhodnutí: DD.MM.YYYY or DD. MM. YYYY → YYYY-MM-DD.
  // Older decisions (pre-2010) omit the dedicated table row; fall back to
  // the date embedded in the h1 title ("ze dne 17.07.2003").
  const dateHtml = extractFieldHtml(html, 'Datum rozhodnutí:');
  let decisionDate = dateHtml ? parseCzechDate(stripHtml(dateHtml)) : null;
  if (!decisionDate && title) {
    const titleDateMatch = title.match(/ze dne\s+(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i);
    if (titleDateMatch) {
      decisionDate = parseCzechDate(titleDateMatch[1]);
    }
  }

  // Soud field. Fallback to "Nejvyšší soud" since that is the only court
  // publishing into this collection.
  const courtHtml = extractFieldHtml(html, 'Soud:');
  const court = courtHtml ? stripHtml(courtHtml).trim() : 'Nejvyšší soud';

  const collectionNumber = stripOrNull(extractFieldHtml(html, 'Číslo rozhodnutí:'));
  const collectionYear = stripOrNull(extractFieldHtml(html, 'Rok:'));
  const collectionBooklet = stripOrNull(extractFieldHtml(html, 'Sešit:'));

  // Typ rozhodnutí. Fall back to the first word of the title (Usnesení/Rozsudek/...).
  let decisionType = stripOrNull(extractFieldHtml(html, 'Typ rozhodnutí:'));
  if (!decisionType && title) {
    const firstWord = title.split(/\s+/)[0];
    if (/^(Usnesení|Rozsudek|Stanovisko|Nález)/.test(firstWord)) {
      decisionType = firstWord;
    }
  }

  // Heslo: comma-separated keywords.
  const heslosHtml = extractFieldHtml(html, 'Heslo:');
  const keywords = heslosHtml
    ? stripHtml(heslosHtml).split(',').map(s => s.trim()).filter(Boolean)
    : [];

  // Předpisy: cited statutes — typically separated by <br/>.
  const predpisyHtml = extractFieldHtml(html, 'Předpisy:');
  const citedStatutes = predpisyHtml
    ? stripHtml(predpisyHtml).split('\n').map(s => s.trim()).filter(Boolean)
    : [];

  const category = stripOrNull(extractFieldHtml(html, 'Druh:'));

  // Právní věta (headnote / legal proposition).
  const headnoteHtml = extractFieldHtml(html, 'Právní věta:');
  const headnote = headnoteHtml ? stripHtml(headnoteHtml) : null;

  // Body: the last <tr> with an empty first cell carries the
  // "Sbírkový text rozhodnutí" anchor and the paragraphs that follow.
  // We capture all paragraph HTML inside the <td class="fw-400 ..."> cell.
  const bodyMatch = html.match(
    /<td class="fw-400[^"]*"[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/i,
  );
  const rawBodyHtml = bodyMatch ? bodyMatch[1] : '';
  // Drop the heading <div class="detail-section__table-heading">...</div>
  // so the body starts at the first paragraph of the decision.
  const bodyAfterHeading = rawBodyHtml.replace(
    /<div\s+class="detail-section__table-heading"[\s\S]*?<\/div>/i,
    '',
  );
  const bodyText = stripHtml(bodyAfterHeading);

  return {
    source_url: sourceUrl,
    collection_id: collectionId,
    title,
    decision_type: decisionType,
    ecli,
    spis_zn: spisZn,
    decision_date: decisionDate,
    court,
    collection_number: collectionNumber,
    collection_year: collectionYear,
    collection_booklet: collectionBooklet,
    keywords,
    cited_statutes: citedStatutes,
    category,
    headnote,
    body_text: bodyText,
    raw_body_html: rawBodyHtml,
  };
}

function stripOrNull(html: string | null): string | null {
  if (!html) return null;
  const text = stripHtml(html).trim();
  return text.length === 0 ? null : text;
}

/**
 * Parse Czech date forms ("16.12.2025", "16. 12. 2025", "16. 12. 2025")
 * into ISO 8601. Returns null when input is not a valid date.
 */
export function parseCzechDate(text: string): string | null {
  const m = text.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const month = m[2].padStart(2, '0');
  const year = m[3];
  return `${year}-${month}-${day}`;
}

/**
 * Extract the numeric collection ID from a sbirka.nsoud.cz URL.
 * Returns the ID string, or empty string if not matched.
 */
export function extractCollectionId(url: string): string {
  const m = url.match(/\/sbirka\/(\d+)\/?$/);
  return m ? m[1] : '';
}

/**
 * Derive an MCP document ID for a decision. Prefer ECLI (stable, global),
 * fall back to collection ID prefixed with `cz:ns:sbirka:`.
 */
export function deriveDocumentId(ecli: string | null, collectionId: string): string {
  if (ecli) return `ecli:${ecli.toLowerCase()}`;
  if (collectionId) return `cz:ns:sbirka:${collectionId}`;
  throw new Error('Cannot derive document ID: no ECLI and no collection ID');
}
