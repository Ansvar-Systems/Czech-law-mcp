# Czech Law MCP Server

**The ASPI (Sbírka zákonů) alternative for the AI age.**

[![npm version](https://badge.fury.io/js/@ansvar%2Fczech-law-mcp.svg)](https://www.npmjs.com/package/@ansvar/czech-law-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/Czech-law-mcp?style=social)](https://github.com/Ansvar-Systems/Czech-law-mcp)
[![CI](https://github.com/Ansvar-Systems/Czech-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/Czech-law-mcp/actions/workflows/ci.yml)
[![Daily Data Check](https://github.com/Ansvar-Systems/Czech-law-mcp/actions/workflows/check-updates.yml/badge.svg)](https://github.com/Ansvar-Systems/Czech-law-mcp/actions/workflows/check-updates.yml)
[![Database](https://img.shields.io/badge/database-pre--built-green)](docs/EU_INTEGRATION_GUIDE.md)
[![Provisions](https://img.shields.io/badge/provisions-461%2C231-blue)](docs/EU_INTEGRATION_GUIDE.md)

Query **45,899 Czech statutes** — from zákon č. 110/2019 Sb. (ochrana osobních údajů) and the Trestní zákoník to the Občanský zákoník, zákon o kybernetické bezpečnosti, and more — directly from Claude, Cursor, or any MCP-compatible client.

If you're building legal tech, compliance tools, or doing Czech legal research, this is your verified reference database.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Why This Exists

Czech legal research is scattered across e-Sbírka, zakonyprolidi.cz, ASPI, and EUR-Lex. Whether you're:
- A **lawyer** validating citations in a brief or smlouva
- A **compliance officer** checking obligations under zákon č. 110/2019 Sb. or zákon č. 181/2014 Sb.
- A **legal tech developer** building tools on Czech law
- A **researcher** tracing legislative history from důvodová zpráva to zákon

...you shouldn't need a dozen browser tabs and manual PDF cross-referencing. Ask Claude. Get the exact provision. With context.

This MCP server makes Czech law **searchable, cross-referenceable, and AI-readable**.

---

## Quick Start

### Use Remotely (No Install Needed)

> Connect directly to the hosted version — zero dependencies, nothing to install.

**Endpoint:** `https://czech-law-mcp.vercel.app/mcp`

| Client | How to Connect |
|--------|---------------|
| **Claude.ai** | Settings > Connectors > Add Integration > paste URL |
| **Claude Code** | `claude mcp add czech-law --transport http https://czech-law-mcp.vercel.app/mcp` |
| **Claude Desktop** | Add to config (see below) |
| **GitHub Copilot** | Add to VS Code settings (see below) |

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "czech-law": {
      "type": "url",
      "url": "https://czech-law-mcp.vercel.app/mcp"
    }
  }
}
```

**GitHub Copilot** — add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "czech-law": {
      "type": "http",
      "url": "https://czech-law-mcp.vercel.app/mcp"
    }
  }
}
```

### Use Locally (npm)

```bash
npx @ansvar/czech-law-mcp
```

**Claude Desktop** — add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

**Cursor / VS Code:**

```json
{
  "mcp.servers": {
    "czech-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/czech-law-mcp"]
    }
  }
}
```

## Example Queries

Once connected, just ask naturally (dotazy fungují v češtině nebo angličtině):

- *"Co říká § 5 zákona č. 110/2019 Sb. o zpracování osobních údajů?"*
- *"Hledat 'ochrana osobních údajů' v české legislativě"*
- *"Je zákon č. 101/2000 Sb. o ochraně osobních údajů stále platný?"*
- *"Jaké jsou trestné činy v oblasti kybernetické kriminality v Trestním zákoníku (č. 40/2009 Sb.)?"*
- *"Které české zákony transponují směrnici NIS2?"*
- *"Hledat ustanovení o elektronickém podpisu v zákoně č. 297/2016 Sb."*
- *"Find provisions about data breach notification in Czech law"*
- *"Validate the citation 'zákon č. 110/2019 Sb., § 10'"*

---

## What's Included

| Category | Count | Details |
|----------|-------|---------|
| **Statutes** | 45,899 zákonů | Comprehensive Czech legislation from e-Sbírka |
| **Provisions** | 461,231 paragrafů | Full-text searchable with FTS5 |
| **Premium: Case law** | 0 (free tier) | Judikatura expansion planned |
| **Premium: Preparatory works** | 0 (free tier) | Důvodové zprávy expansion planned |
| **Premium: Agency guidance** | 10,000 documents | ÚOOÚ, NBÚ, and regulatory guidance |
| **Database Size** | ~1.2 GB | Optimized SQLite — comprehensive corpus |
| **Daily Updates** | Automated | Freshness checks against e-Sbírka |

**Verified data only** — every citation is validated against official sources (e-Sbírka / zakonyprolidi.cz). Zero LLM-generated content.

---

## Why This Works

**Verbatim Source Text (No LLM Processing):**
- All statute text is ingested from e-Sbírka (e-sbirka.cz) official sources
- Provisions are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing — the database contains regulation text, not AI interpretations

**Smart Context Management:**
- Search returns ranked provisions with BM25 scoring (safe for context)
- Provision retrieval gives exact text by zákon number + paragraph
- Cross-references help navigate without loading everything at once

**Technical Architecture:**
```
e-Sbírka API → Parse → SQLite → FTS5 snippet() → MCP response
                 ↑                     ↑
          Provision parser       Verbatim database query
```

### Traditional Research vs. This MCP

| Traditional Approach | This MCP Server |
|---------------------|-----------------|
| Search e-Sbírka by číslo zákona | Search by plain Czech: *"ochrana osobních údajů souhlas"* |
| Navigate multi-chapter statutes manually | Get the exact provision with context |
| Manual cross-referencing between zákony | `build_legal_stance` aggregates across sources |
| "Je tento zákon platný?" → check manually | `check_currency` tool → answer in seconds |
| Find EU basis → dig through EUR-Lex | `get_eu_basis` → linked EU directives instantly |
| No API, no integration | MCP protocol → AI-native |

**Traditional:** Search e-Sbírka → Download PDF → Ctrl+F → Cross-reference with EUR-Lex → Check ÚOOÚ guidance → Repeat

**This MCP:** *"Jaký je evropský základ § 10 zákona č. 110/2019 Sb. o ochraně osobních údajů?"* → Done.

---

## Available Tools (13)

### Core Legal Research Tools (8)

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 full-text search across 461,231 paragrafů with BM25 ranking. Supports quoted phrases, boolean operators, prefix wildcards |
| `get_provision` | Retrieve specific provision by zákon number + paragraph (e.g., "110/2019 Sb." + "§ 5") |
| `check_currency` | Check if a statute is in force (platný/neplatný), amended, or repealed |
| `validate_citation` | Validate citation against database — zero-hallucination check. Supports "zákon č. 110/2019 Sb., § 5" |
| `build_legal_stance` | Aggregate citations from multiple statutes for a legal topic |
| `format_citation` | Format citations per Czech conventions (full/short/pinpoint) |
| `list_sources` | List all available statutes with metadata, coverage scope, and data provenance |
| `about` | Server info, capabilities, dataset statistics, and coverage summary |

### EU Law Integration Tools (5)

| Tool | Description |
|------|-------------|
| `get_eu_basis` | Get EU directives/regulations underlying a Czech statute |
| `get_czech_implementations` | Find Czech laws implementing a specific EU act |
| `search_eu_implementations` | Search EU documents with Czech implementation counts |
| `get_provision_eu_basis` | Get EU law references for a specific provision |
| `validate_eu_compliance` | Check implementation status of Czech statutes against EU directives |

---

## EU Law Integration

Czech Republic is an **EU member state** (since 2004). Czech legislation in data protection, cybersecurity, financial services, and e-commerce is built on EU directives and regulations. The EU bridge tools give you full bi-directional lookup.

| Metric | Value |
|--------|-------|
| **EU Member State** | Yes — since 1 May 2004 |
| **EU References** | Cross-references linking Czech statutes to EU law |
| **Directives transposed** | GDPR, NIS2, DORA, AI Act, eIDAS, PSD2, AML directives, and more |
| **EUR-Lex Integration** | Automated metadata fetching |
| **ÚOOÚ supervision** | Data protection regulatory framework fully covered |

### Key Czech EU Implementations

- **Zákon č. 110/2019 Sb.** — GDPR national implementation (zpracování osobních údajů)
- **Zákon č. 181/2014 Sb.** — Zákon o kybernetické bezpečnosti (NIS Directive transposition)
- **Zákon č. 297/2016 Sb.** — Zákon o službách vytvářejících důvěru (eIDAS transposition)
- **Zákon č. 370/2017 Sb.** — Platební styk (PSD2 transposition)

See [EU_INTEGRATION_GUIDE.md](docs/EU_INTEGRATION_GUIDE.md) for detailed documentation.

---

## Data Sources & Freshness

All content is sourced from authoritative Czech legal databases:

- **[e-Sbírka](https://www.e-sbirka.cz/)** — Elektronická Sbírka zákonů a mezinárodních smluv (official electronic collection)
- **[zakonyprolidi.cz](https://zakonyprolidi.cz/)** — Comprehensive Czech legal database
- **[EUR-Lex](https://eur-lex.europa.eu/)** — Official EU law database (metadata only)

### Data Provenance

| Field | Value |
|-------|-------|
| **Authority** | Ministerstvo vnitra České republiky / e-Sbírka |
| **Retrieval method** | e-Sbírka official data export and open data |
| **Language** | Czech |
| **License** | Public domain (veřejná správa) |
| **Coverage** | 45,899 statutes, 461,231 provisions |
| **Last ingested** | 2026-02-28 |

### Automated Freshness Checks (Daily)

A [daily GitHub Actions workflow](.github/workflows/check-updates.yml) monitors e-Sbírka for changes:

| Check | Method |
|-------|--------|
| **Statute amendments** | e-Sbírka date comparison across 45,899 statutes |
| **New statutes** | Sbírka zákonů publication monitoring |
| **Repealed statutes** | Platnost/neplatnost status change detection |
| **EU reference staleness** | Git commit timestamps — flagged if >90 days old |

**Verified data only** — every citation is validated against official sources. Zero LLM-generated content.

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Docker Security** | Container image scanning + SBOM generation | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |
| **OSSF Scorecard** | OpenSSF best practices scoring | Weekly |
| **Dependabot** | Automated dependency updates | Weekly |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Statute text is sourced from official e-Sbírka publications. However:
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Court case coverage is not included** in the free tier — do not rely solely on this for judikatura research
> - **Verify critical citations** against primary sources (e-Sbírka, Sbírka zákonů) for court filings
> - **EU cross-references** are extracted from statute text and EUR-Lex metadata, not a complete implementation mapping

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [PRIVACY.md](PRIVACY.md)

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment. See [PRIVACY.md](PRIVACY.md) for guidance consistent with **Česká advokátní komora** (Czech Bar Association) professional conduct standards.

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/Czech-law-mcp
cd Czech-law-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                       # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js   # Test with MCP Inspector
```

### Data Management

```bash
npm run ingest                    # Ingest statutes from e-Sbírka
npm run ingest:all                # Full corpus ingestion (all laws, skip existing)
npm run ingest:opendata           # Ingest from open data sources
npm run build:db                  # Rebuild SQLite database
npm run drift:detect              # Run drift detection against anchors
npm run check-updates             # Check for amendments
npm run coverage:all-laws         # Check coverage against full e-Sbírka corpus
```

### Performance

- **Search Speed:** <100ms for most FTS5 queries
- **Database Size:** ~1.2 GB (comprehensive — 45,899 statutes, 461,231 provisions)
- **Reliability:** 100% ingestion success rate

---

## Related Projects: Complete Compliance Suite

This server is part of **Ansvar's Compliance Suite** — MCP servers that work together for end-to-end compliance coverage:

### [@ansvar/eu-regulations-mcp](https://github.com/Ansvar-Systems/EU_compliance_MCP)
**Query 49 EU regulations directly from Claude** — GDPR, AI Act, DORA, NIS2, MiFID II, eIDAS, and more. Full regulatory text with article-level search. `npx @ansvar/eu-regulations-mcp`

### @ansvar/czech-law-mcp (This Project)
**Query 45,899 Czech statutes directly from Claude** — zákon č. 110/2019 Sb., Trestní zákoník, Občanský zákoník, and more. Full provision text with EU cross-references. `npx @ansvar/czech-law-mcp`

### [@ansvar/us-regulations-mcp](https://github.com/Ansvar-Systems/US_Compliance_MCP)
**Query US federal and state compliance laws** — HIPAA, CCPA, SOX, GLBA, FERPA, and more. `npx @ansvar/us-regulations-mcp`

### [@ansvar/security-controls-mcp](https://github.com/Ansvar-Systems/security-controls-mcp)
**Query 261 security frameworks** — ISO 27001, NIST CSF, SOC 2, CIS Controls, SCF, and more. `npx @ansvar/security-controls-mcp`

**70+ national law MCPs** covering Austria, Belgium, Denmark, Estonia, Finland, France, Germany, Ireland, Italy, Luxembourg, Netherlands, Norway, Poland, Portugal, Slovakia, Slovenia, Spain, Sweden, Switzerland, UK, and more.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas:
- Court case law expansion (Ústavní soud, Nejvyšší soud, Nejvyšší správní soud)
- EU cross-reference expansion
- Historical statute versions and amendment tracking
- ÚOOÚ and NBÚ guidance documents
- Důvodové zprávy (legislative preparatory works)

---

## Roadmap

- [x] Core statute database with FTS5 search (45,899 statutes, 461,231 provisions)
- [x] EU law integration with bi-directional lookup
- [x] Premium agency guidance dataset (10,000 documents)
- [x] Vercel Streamable HTTP deployment
- [x] npm package publication
- [ ] Judikatura (court case law) expansion
- [ ] Důvodové zprávy (preparatory works) coverage
- [ ] Full EU text integration (via @ansvar/eu-regulations-mcp)
- [ ] Historical statute versions (amendment tracking)

---

## Citation

If you use this MCP server in academic research:

```bibtex
@software{czech_law_mcp_2026,
  author = {Ansvar Systems AB},
  title = {Czech Law MCP Server: AI-Powered Legal Research Tool},
  year = {2026},
  url = {https://github.com/Ansvar-Systems/Czech-law-mcp},
  note = {45,899 Czech statutes with 461,231 provisions and EU law cross-references}
}
```

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Statutes & Legislation:** Ministerstvo vnitra České republiky / e-Sbírka (public domain)
- **EU Metadata:** EUR-Lex (EU public domain)

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the European market. This MCP server is part of our Central European coverage — alongside Slovak, Polish, and Hungarian law MCPs — ensuring that the full EU compliance picture is accessible from a single AI interface.

So we're open-sourcing it. Navigating 45,899 statutes and 461,231 provisions shouldn't require a law degree.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
