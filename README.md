# Czech Law MCP

[![npm](https://img.shields.io/npm/v/@ansvar/czech-law-mcp)](https://www.npmjs.com/package/@ansvar/czech-law-mcp)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/Ansvar-Systems/Czech-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/Czech-law-mcp/actions/workflows/ci.yml)

A Model Context Protocol (MCP) server providing access to Czech legislation from the official e‑Sbírka API.

**MCP Registry:** `eu.ansvar/czech-law-mcp`
**npm:** `@ansvar/czech-law-mcp`

## Quick Start

### Claude Desktop / Cursor (stdio)

```json
{
  "mcpServers": {
    "czech-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/czech-law-mcp"]
    }
  }
}
```

### Remote (Streamable HTTP)

```
czech-law-mcp.vercel.app/mcp
```

## Data Sources

| Source | Authority | License |
|--------|-----------|---------|
| [e‑Sbírka API](https://www.e-sbirka.cz/sbr-externi) | Ministry of the Interior of the Czech Republic | Government terms for official public legislation (e‑Sbírka) |

> Full provenance: [`sources.yml`](./sources.yml)

## Ingestion

Curated corpus (default):

```bash
npm run ingest
```

Index all Czech laws (`ZAKON` + `ZAKONUST`):

```bash
npm run ingest:all:index
```

Incremental all-laws ingestion (resumable, respects API rate limit):

```bash
npm run ingest:all
```

Coverage report against discovered all-laws index:

```bash
npm run coverage:all-laws
```

## Tools

| Tool | Description |
|------|-------------|
| `search_legislation` | Full-text search across provisions |
| `get_provision` | Retrieve specific article/section |
| `validate_citation` | Validate legal citation |
| `check_currency` | Check if statute is in force |
| `get_eu_basis` | EU legal basis cross-references |
| `get_czech_implementations` | National EU implementations |
| `search_eu_implementations` | Search EU documents |
| `validate_eu_compliance` | EU compliance check |
| `build_legal_stance` | Comprehensive legal research |
| `format_citation` | Citation formatting |
| `list_sources` | Data provenance |
| `about` | Server metadata |

## License

Apache-2.0
