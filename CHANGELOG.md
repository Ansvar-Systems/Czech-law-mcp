# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added — Wave A: sbirka.nsoud.cz court-decisions corpus (premium tier)

Replaces the redacted Multi Legal Pile case-law corpus (CC-BY-NC-SA-4.0, removed 2026-05-06) with curated decisions of the Supreme Court of the Czech Republic from `sbirka.nsoud.cz`. License basis: same `Czech-Statutory-PD` §3 carve-out that covers e-Sbírka statutes; Czech Copyright Act 121/2000 Coll. §3 excludes court decisions from copyright protection.

- `scripts/ingest-nsoud-sbirka.ts` — sitemap-driven ingestor. Walks `https://sbirka.nsoud.cz/sitemap_index.xml`, fetches each `/sbirka/{id}/` page, parses metadata (ECLI, spis. zn., date, court, keywords, cited statutes) and the full decision body. Self-imposed rate limit ≥ 2 s per request, single-threaded. `--limit N`, `--resume`, `--out DIR`, `--max-failures N` flags.
- `scripts/wave-a/sitemap.ts`, `scripts/wave-a/parse-decision.ts`, `scripts/wave-a/to-seed.ts`, `scripts/wave-a/types.ts` — sitemap walker, HTML decision parser, seed-format adapter, and shared types.
- `scripts/build-db.ts` — added `--premium` flag and `--out PATH` override. In premium mode, ingests both `data/seed/` (statutes) and `data/case-law-seed/` (court decisions) into a single `legal_documents` table differentiated by `type IN ('statute', 'case_law')`. Cited statutes from `Předpisy` fields populate `cross_references`. The `db_metadata` table now carries `statute_count`, `case_law_count`, and `premium_sources` entries.
- `tests/wave-a-parse-decision.test.ts`, `tests/wave-a-sitemap.test.ts` — 42 unit tests covering ECLI parsing, Czech date forms, sitemap filtering, dedupe, body extraction, and the seed conversion (against two frozen fixtures: post-ECLI and pre-ECLI).
- `tests/fixtures/sbirka-nsoud-25445.html`, `tests/fixtures/sbirka-nsoud-13855.html` — recorded decision pages for offline test runs.
- `sources.yml` — second source entry for `sbirka.nsoud.cz` (premium tier) with verbatim ToS findings, rate-limit envelope, and the §3 re-verification acceptance blocker referenced.
- `package.json` — `build:db:premium` and `ingest:nsoud-sbirka` npm scripts.
- `README.md` — Premium tier section with build-the-database instructions.

The arch-docs companion changes (source-authority registry entry, fleet-manifest `premium_sources[]` patch, and at-risk-register stage flip from `scoped` to `verified`) are tracked in `docs/handover/2026-05-17-czech-wave-a-execution-handover.md`.

## [1.2.0] - 2026-05-06
### Changed
- `sources.yml`: declare `Czech-Statutory-PD` as the license code (Czech Copyright Act 121/2000 §3, official-works carve-out from copyright). Replaces the previous `government_terms` placeholder. Cross-references the upstream catalog entry in `Ansvar-Architecture-Documentation/infrastructure/attribution-licenses.json`.

### Added
- `.github/workflows/check-updates.yml` — daily data-freshness check (restored from golden-standard template; was deleted during 1.1.0 Vercel scrub).
- `.github/workflows/drift-detect.yml` — weekly drift-detection workflow (restored from golden-standard template; was deleted during 1.1.0 Vercel scrub).

### Source attribution airtight (2026-05-02 spec)
This release pairs with `Ansvar-Architecture-Documentation` PR `feat/czech-law-fork-a-2026-05-06`, which adds the `attribution` block to the fleet manifest, registers `e-sbirka.cz` in the source-authority registry, and lands the new `Czech-Statutory-PD` code in the license catalog. After both PRs merge, `audit-source-legitimacy.py` returns GREEN for `czech-law` (free tier). Premium tier remains disabled (`premium_enabled: false`) pending Multi Legal Pile replacement (Fork C scope, ~3-5 weeks).

### Note on per-row `_citation` injection
Per the 2026-05-02 spec L2, each result item from MCP tools must carry `_citation.{source_url, publisher, license}`. The runtime injection is not implemented in this release — tracked as Fork A.5 follow-up. The spec's L2 has three modes (`audit`, `surface`, `refuse`); current production gateway mode determines whether this gates or merely warns. No customer-visible regression expected in the interim because gateway runs in `audit` mode by default during fleet rollout.

## [1.1.0] - 2026-04-26
### Changed
- Removed Vercel artifacts: `vercel.json`, `api/mcp.ts`, `api/health.ts` — public MCP server (`mcp.ansvar.eu`) decommissioned 2026-04-23; access via gateway (`gateway.ansvar.eu`) or npm stdio
- Removed `@vercel/node` from devDependencies
- Removed `"api"` from `tsconfig.json` include paths
- Updated `server.json`: removed decommissioned streamable-http transport entry, version bump to 1.1.0
- Updated `README.md`: removed decommissioned remote-endpoint section; stdio/npx instructions remain
- Resolved 14 npm audit vulnerabilities (undici, vite, hono, @vercel/node chain)

## [1.0.0] - 2026-02-21
### Added
- Initial release of Czech Law MCP
- `search_legislation` tool for full-text search across Czech legislation
- `get_provision` tool for retrieving specific articles
- `validate_citation` tool for citation validation
- `check_currency` tool for checking if legislation is in force
- `get_eu_basis` tool for EU cross-references
- `get_czech_implementations` tool for finding national EU implementations
- `search_eu_implementations` tool for searching EU documents
- `validate_eu_compliance` tool for EU compliance checking
- `build_legal_stance` tool for comprehensive legal research
- `format_citation` tool for citation formatting
- `get_provision_eu_basis` tool for provision-level EU references
- `list_sources` tool for data provenance
- `about` tool for server metadata
- Contract tests with 12 golden test cases
- Health and version endpoints
- Vercel deployment (Strategy A, bundled DB)
- npm package with stdio transport

[1.0.0]: https://github.com/Ansvar-Systems/Czech-law-mcp/releases/tag/v1.0.0
