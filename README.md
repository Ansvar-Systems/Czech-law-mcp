# Czech Law MCP

<!-- ANSVAR-CTA-BEGIN -->
> ### ▶ Try this MCP instantly via Ansvar Gateway
> **50 free queries/day · no card required · OAuth signup at [ansvar.eu/gateway](https://ansvar.eu/gateway)**
>
> One endpoint, one OAuth signup, access from any MCP-compatible client.

### Connect

**Claude Code** (one line):

```bash
claude mcp add ansvar --transport http https://gateway.ansvar.eu/mcp
```

**Claude Desktop / Cursor** — add to `claude_desktop_config.json` (or `mcp.json`):

```json
{
  "mcpServers": {
    "ansvar": {
      "type": "url",
      "url": "https://gateway.ansvar.eu/mcp"
    }
  }
}
```

**Claude.ai** — Settings → Connectors → Add custom connector → paste `https://gateway.ansvar.eu/mcp`

First request opens an OAuth flow at [ansvar.eu/gateway](https://ansvar.eu/gateway). After signup, your client is bound to your account; tier (free / premium / team / company) determines fan-out, quota, and which downstream MCPs are reachable.

---

## Self-host this MCP

You can also clone this repo and build the corpus yourself. The schema,
fetcher, and tool implementations all live here. What is not in the repo is
the pre-built database — TDM and standards-licensing constraints on the
upstream sources mean we host the corpus on Ansvar infrastructure rather
than redistribute it as a public artifact.

Build your own: run this repo's ingestion script (entry-point varies per
repo — typically `scripts/ingest.sh`, `npm run ingest`, or `make ingest`;
check the repo root).
<!-- ANSVAR-CTA-END -->


MCP server for Czech Law — 45,899 statutes from www.e-sbirka.cz.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-spec--compliant-green.svg)](https://modelcontextprotocol.io)
[![Jurisdiction](https://img.shields.io/badge/Jurisdiction-CZ-informational.svg)](#coverage)

## What this is

This server indexes the legal materials listed under **Sources** below and
exposes them via the Model Context Protocol. Part of the Ansvar MCP fleet —
source-available servers published for self-hosting.

It makes no outbound network calls except to the upstream sources during
ingestion — no analytics, no phone-home.

## Coverage

- **Corpus:** Czech Law — 45,899 statutes, 461,231 provisions
- **Jurisdiction code:** `CZ`
- **Corpus snapshot:** 2026-02-22

The corpus is rebuilt from the upstream sources by the included ingestion script; re-run periodically to refresh.

See **Sources** below for source URLs, terms, and reuse conditions.

## Why this exists

LLMs answering compliance, security, or legal questions from training data
alone will fabricate citations — confidently producing article numbers,
statute names, and source URLs that do not exist, or that do not say what
the model claims. This MCP exists so an agent can call a tool that returns
the real text, the real identifier, and the real source URL straight from
the indexed materials — and ground an answer rather than recall it.

One MCP, one corpus. The point is composition.

The **Ansvar Gateway** ([ansvar.eu](https://ansvar.eu)) joins this MCP
with the rest of the Ansvar fleet behind a single authenticated
endpoint — 300+ servers covering legal jurisdictions, EU
regulations, security frameworks, sector regulators, privacy-pattern
catalogues, and risk-scoring tools. That lets an agent run cross-domain
workflows that no single MCP can serve alone:

- **Threat model and TARA.** Threat enumeration → known component
  vulnerabilities → severity scoring → applicable AI, cybersecurity, and
  automotive obligations → privacy threats. Every finding traceable to
  its source.
- **Gap analysis.** Target framework requirements → current-state
  evidence → unmet obligations → remediation guidance and authority
  opinions. Every gap traceable to the specific requirement that flagged
  it.
- **Data Protection Impact Assessment.** Privacy regulation articles →
  national DPA guidance → privacy-pattern catalogue → applicable case
  law.

### Getting high-quality citations

Citation accuracy degrades when an agent's context fills up. Long inputs
cause retrieval-stage drift — the model recalls claim text correctly but
misattributes the source. Two practices keep accuracy high:

1. **Focused first pass, checking-agent second pass.** Query a small,
   relevant set of MCPs first, then run a separate agent whose only job
   is to re-resolve each citation against the source MCP and flag any
   that no longer match. The checking agent uses the same MCP tools as
   the synthesis agent.
2. **Pull the source text verbatim when in doubt.** Every citation an
   agent emits points back to a tool call against this server. You — or
   another agent — can call the same tool with the same identifier and
   read the raw statute, article, or standard text directly. If the
   verbatim text doesn't support what the agent claimed, the citation
   was misused, regardless of whether the identifier was real.

Both patterns work the same way self-hosted or through the gateway.

## Two ways to use it

**Self-host (free, Apache 2.0)** — clone this repo, run the ingestion script to build your local database from the listed upstream sources, point your MCP client at the local server. Instructions below.

**Use the hosted gateway** — for production use against the curated,
kept-fresh corpus across the full Ansvar MCP fleet, with citation enrichment
and multi-jurisdiction fan-out — see [ansvar.eu](https://ansvar.eu).

## Self-hosting

### Install

```bash
git clone https://github.com/Ansvar-Systems/Czech-law-mcp.git
cd Czech-law-mcp
npm install
```

### Build the database

```bash
npm run build:db
```

Ingestion is a snapshot — your local copy goes stale until you re-run it. The hosted gateway corpus is refreshed continuously.

### Configure your MCP client

```json
{
  "mcpServers": {
    "czech-law-mcp": {
      "command": "node",
      "args": ["dist/index.js"]
    }
  }
}
```

## Sources

| Source | Source URL | Terms / license URL | License basis | Attribution required | Commercial use | Redistribution / caching | Notes |
|---|---|---|---|---|---|---|---|
| [www.e-sbirka.cz](https://www.e-sbirka.cz) | https://www.e-sbirka.cz | [Czech Copyright Act 121/2000 §3](https://www.e-sbirka.cz/eli/cz/sb/2000/121/) | `Czech-Statutory-PD` — Czech Copyright Act 121/2000 Coll. §3 excludes "úřední dílo" (official works) from copyright protection | Yes | Yes | Yes | Same statutory carve-out mechanism as US-Federal-PD (17 USC §105) and Norwegian-Court-Publication. Czech transposition of EU Open Data Directive 2019/1024 (Act 261/2021 Coll.) provides supplementary basis. Catalogued upstream as `Czech-Statutory-PD` (entry_kind: regime). |

## What this repository does not provide

This repository's source — the MCP server code, schema, and ingestion script — is licensed under Apache
2.0. The license below covers the code in this repository only; it does not
extend to the upstream legal materials.

Running ingestion may download, cache, transform, and index materials from the listed upstream sources. You are responsible for confirming that your use of those materials complies with the source terms, attribution requirements, robots/rate limits, database rights, copyright rules, and any commercial-use or redistribution limits that apply in your jurisdiction.

## License

Apache 2.0 — see [LICENSE](LICENSE). Commercial use, modification, and
redistribution of **the source code in this repository** are permitted under
that license. The license does not extend to upstream legal materials downloaded by the ingestion script; those remain governed by the source jurisdictions' own publishing terms (see Sources above).

## The Ansvar gateway

If you'd rather not self-host, [ansvar.eu](https://ansvar.eu) provides this
MCP plus the full Ansvar fleet through a single authenticated endpoint, with
the curated production corpus, multi-MCP query orchestration, and citation
enrichment.

---

Issues: [github.com/Ansvar-Systems/Czech-law-mcp/issues](https://github.com/Ansvar-Systems/Czech-law-mcp/issues) · Security: <security@ansvar.eu>
