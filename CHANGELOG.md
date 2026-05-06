# Changelog

All notable changes to this project will be documented in this file.

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
