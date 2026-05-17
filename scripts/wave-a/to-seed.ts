/**
 * Convert a parsed sbirka.nsoud.cz decision into the CaseLawSeed JSON shape
 * accepted by scripts/build-db.ts when --premium is set.
 */
import { createHash } from 'crypto';
import type { ParsedDecision } from './parse-decision.js';
import { deriveDocumentId } from './parse-decision.js';
import type { CaseLawSeed } from './types.js';

const PUBLISHER = 'Nejvyšší soud';
const LICENSE = 'Czech-Statutory-PD';

function contentHash(s: string): string {
  return createHash('sha256').update(s.replace(/\s+/g, ' ').trim(), 'utf8').digest('hex');
}

/**
 * Convert a ParsedDecision into the seed format. Throws if the input is
 * missing the bare-minimum identifiers (collection ID + body text).
 */
export function toSeed(decision: ParsedDecision): CaseLawSeed {
  if (!decision.collection_id) {
    throw new Error(`Decision missing collection_id (source_url=${decision.source_url})`);
  }
  if (!decision.body_text || decision.body_text.length < 50) {
    throw new Error(
      `Decision body too short to be a real decision (source_url=${decision.source_url}, len=${decision.body_text.length})`,
    );
  }
  const id = deriveDocumentId(decision.ecli, decision.collection_id);
  const shortName = decision.spis_zn ?? `NS Sbírka ${decision.collection_id}`;
  return {
    id,
    type: 'case_law',
    title: decision.title || shortName,
    short_name: shortName,
    status: 'in_force',
    issued_date: decision.decision_date ?? undefined,
    url: decision.source_url,
    publisher: PUBLISHER,
    license: LICENSE,
    description: decision.headnote ?? 'Decision of the Supreme Court of the Czech Republic published in the Sbírka soudních rozhodnutí a stanovisek.',
    provisions: [
      {
        // Use spis. zn. as provision_ref when present so callers can look up
        // a decision by "25 Cdo 1552/2025". Fall back to collection ID.
        provision_ref: decision.spis_zn ?? `sbirka-${decision.collection_id}`,
        section: decision.spis_zn ?? decision.collection_id,
        title: decision.title || shortName,
        content: decision.body_text,
        metadata: {
          ecli: decision.ecli,
          decision_type: decision.decision_type,
          decision_date: decision.decision_date,
          court: decision.court,
          keywords: decision.keywords,
          headnote: decision.headnote,
        },
      },
    ],
    cited_statutes: decision.cited_statutes,
    metadata: {
      ecli: decision.ecli,
      spis_zn: decision.spis_zn,
      decision_type: decision.decision_type,
      court: decision.court,
      collection_id: decision.collection_id,
      collection_number: decision.collection_number,
      collection_year: decision.collection_year,
      collection_booklet: decision.collection_booklet,
      keywords: decision.keywords,
      category: decision.category,
      headnote: decision.headnote,
      source_url: decision.source_url,
      content_hash_at_ingest: contentHash(decision.body_text),
    },
  };
}
