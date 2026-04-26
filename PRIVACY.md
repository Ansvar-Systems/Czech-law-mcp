# Privacy & Client Confidentiality

**IMPORTANT READING FOR LEGAL PROFESSIONALS**

This document addresses privacy and confidentiality considerations when using this Tool, with particular attention to professional obligations under Czech bar association rules.

---

## Executive Summary

**Key Risks:**
- Queries through Claude API flow via Anthropic cloud infrastructure
- Query content may reveal client matters and privileged information
- Czech Bar Association rules (Česká advokátní komora — ČAK) require strict confidentiality (povinnost mlčenlivosti) and data processing controls

**Safe Use Options:**
1. **General Legal Research**: Use Tool for non-client-specific queries
2. **Local npm Package**: Install `@ansvar/czech-law-mcp` locally — database queries stay on your machine
3. **Remote Endpoint**: Ansvar Gateway (`gateway.ansvar.eu`) — queries transit Ansvar infrastructure
4. **On-Premise Deployment**: Self-host with local LLM for privileged matters

---

## Data Flows and Infrastructure

### MCP (Model Context Protocol) Architecture

This Tool uses the **Model Context Protocol (MCP)** to communicate with AI clients:

```
User Query -> MCP Client (Claude Desktop/Cursor/API) -> Anthropic Cloud -> MCP Server -> Database
```

### Deployment Options

#### 1. Local npm Package (Most Private)

```bash
npx @ansvar/czech-law-mcp
```

- Database is local SQLite file on your machine
- No data transmitted to external servers (except to AI client for LLM processing)
- Full control over data at rest

#### 2. Remote Endpoint (Ansvar Gateway)

Access via the Ansvar Gateway (`gateway.ansvar.eu`). The public Vercel endpoint (`czech-law-mcp.vercel.app`) was decommissioned in April 2026.

- Queries transit Ansvar gateway infrastructure
- Tool responses return through the same path
- Subject to Ansvar's privacy policy (ansvar.eu/privacy)

### What Gets Transmitted

When you use this Tool through an AI client:

- **Query Text**: Your search queries and tool parameters
- **Tool Responses**: Statute text (texty zákonů), provision content, search results
- **Metadata**: Timestamps, request identifiers

**What Does NOT Get Transmitted:**
- Files on your computer
- Your full conversation history (depends on AI client configuration)

---

## Professional Obligations (Czech Republic)

### Czech Bar Association Rules

Czech lawyers (advokáti) are bound by strict confidentiality rules under zákon č. 85/1996 Sb., o advokacii, and the Etický kodex České advokátní komory, enforced by the Česká advokátní komora (ČAK).

#### Povinnost Mlčenlivosti (Duty of Confidentiality)

- All client communications are privileged under § 21 zákona o advokacii
- Client identity may be confidential in sensitive matters
- Case strategy and legal analysis are protected
- Information that could identify clients or matters must be safeguarded
- Breach of confidentiality may result in disciplinary proceedings (kárné řízení) before the Kárná komise ČAK

### Czech Personal Data Protection Act (ZOOU) and GDPR

Under **GDPR Article 28** and the **zákon č. 110/2019 Sb., o zpracování osobních údajů**, when using services that process client data:

- You are the **Data Controller** (správce osobních údajů)
- AI service providers (Anthropic, Ansvar) may be **Data Processors** (zpracovatel osobních údajů)
- A **Data Processing Agreement** (smlouva o zpracování osobních údajů) may be required
- Ensure adequate technical and organizational measures (technická a organizační opatření)
- The Office for Personal Data Protection (Úřad pro ochranu osobních údajů — ÚOOÚ, uoou.cz) oversees compliance

---

## Risk Assessment by Use Case

### LOW RISK: General Legal Research

**Safe to use through any deployment:**

```
Example: "What does § 2913 NOZ (zákon č. 89/2012 Sb.) say about contractual liability?"
```

- No client identity involved
- No case-specific facts
- Publicly available legal information

### MEDIUM RISK: Anonymized Queries

**Use with caution:**

```
Example: "What are the penalties for fraud (podvod) under the Czech trestní zákoník?"
```

- Query pattern may reveal you are working on a fraud matter
- Anthropic/Ansvar logs may link queries to your API key

### HIGH RISK: Client-Specific Queries

**DO NOT USE through cloud AI services:**

- Remove ALL identifying details
- Use the local npm package with a self-hosted LLM
- Or use commercial legal databases (ASPI, Beck-online) with proper data processing agreements

---

## Data Collection by This Tool

### What This Tool Collects

**Nothing.** This Tool:

- Does NOT log queries
- Does NOT store user data
- Does NOT track usage
- Does NOT use analytics
- Does NOT set cookies

The database is read-only. No user data is written to disk.

### What Third Parties May Collect

- **Anthropic** (if using Claude): Subject to [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy)
- **Ansvar** (if using gateway endpoint): Subject to [Ansvar Privacy Policy](https://ansvar.eu/privacy)

---

## Recommendations

### For Solo Practitioners / Small Firms (Samostatní advokáti / Malé kanceláře)

1. Use local npm package for maximum privacy
2. General research: Cloud AI is acceptable for non-client queries
3. Client matters: Use commercial legal databases (ASPI, Beck-online) with proper zpracovatelské smlouvy

### For Large Firms / Corporate Legal (Velké kanceláře / Podnikové právní oddělení)

1. Negotiate Data Processing Agreements (smlouvy o zpracování) with AI service providers
2. Consider on-premise deployment with self-hosted LLM
3. Train staff on safe vs. unsafe query patterns

### For Government / Public Sector (Státní orgány / Veřejný sektor)

1. Use self-hosted deployment, no external APIs
2. Follow Czech government IT security requirements (Zákon o kybernetické bezpečnosti)
3. Air-gapped option available for classified matters

---

## Questions and Support

- **Privacy Questions**: Open issue on [GitHub](https://github.com/Ansvar-Systems/Czech-law-mcp/issues)
- **Anthropic Privacy**: Contact privacy@anthropic.com
- **ČAK Guidance**: Consult the Česká advokátní komora (cak.cz) for ethics guidance on AI tool use

---

**Last Updated**: 2026-03-06
**Tool Version**: 1.0.0
