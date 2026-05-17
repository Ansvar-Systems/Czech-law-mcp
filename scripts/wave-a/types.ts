/**
 * Shared types for the Wave A case-law seed format.
 *
 * Case-law rows land in the same SQLite database as statute rows (single
 * `legal_documents` table with `type IN ('statute', 'bill', 'case_law')`).
 * They are serialised to JSON under data/case-law-seed/{id}.json and ingested
 * by scripts/build-db.ts when premium mode is enabled.
 */
export interface CaseLawSeed {
  /** MCP document ID — either `ecli:...` (preferred) or `cz:ns:sbirka:{id}`. */
  id: string;
  type: 'case_law';
  /** Decision title (Czech, verbatim from sbirka.nsoud.cz <h1>). */
  title: string;
  /** Optional English short name. Unused for Wave A. */
  title_en?: string;
  /** Short name. Defaults to spis. zn. if present, else collection ID. */
  short_name?: string;
  status: 'in_force';
  /** Decision date (ISO 8601). */
  issued_date?: string;
  /** Canonical URL on sbirka.nsoud.cz. */
  url: string;
  /** Publisher (always "Nejvyšší soud" for Wave A). */
  publisher: string;
  /** License code from infrastructure/attribution-licenses.json. */
  license: string;
  /** Plain-text description; defaults to "Decision of the Supreme Court of the Czech Republic". */
  description?: string;
  /**
   * One provision row per decision body. The provision_ref carries the
   * spisová značka (file number) for direct lookup; content carries the full
   * decision text. This keeps the schema parity with statute ingestion.
   */
  provisions: CaseLawProvisionSeed[];
  /**
   * Cited statutes parsed from the Předpisy field. Each becomes a row in the
   * `cross_references` table when ingested.
   */
  cited_statutes?: string[];
  /** Optional metadata bundle stored as JSON on the document row. */
  metadata?: {
    ecli?: string | null;
    spis_zn?: string | null;
    decision_type?: string | null;
    court?: string | null;
    collection_id?: string;
    collection_number?: string | null;
    collection_year?: string | null;
    collection_booklet?: string | null;
    keywords?: string[];
    category?: string | null;
    headnote?: string | null;
    source_url: string;
    content_hash_at_ingest: string;
  };
}

export interface CaseLawProvisionSeed {
  provision_ref: string;
  section: string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
}
