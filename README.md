# Czech Law MCP

[![npm](https://img.shields.io/npm/v/@ansvar/czech-law-mcp)](https://www.npmjs.com/package/@ansvar/czech-law-mcp)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![CI](https://github.com/Ansvar-Systems/Czech-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/Czech-law-mcp/actions/workflows/ci.yml)

A Model Context Protocol (MCP) server providing access to Czech legislation covering data protection, cybersecurity, e-commerce, and criminal law provisions.

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
| [Sbírka zákonů (Collection of Laws)](https://www.zakonyprolidi.cz) | Ministry of the Interior of the Czech Republic | Czech Government Open Data (public domain under Czech Copyright Act § 3) |

> Full provenance: [`sources.yml`](./sources.yml)

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
