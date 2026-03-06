# Privacy & Client Confidentiality

**IMPORTANT READING FOR LEGAL PROFESSIONALS**

This document addresses privacy and confidentiality considerations when using this Tool, with particular attention to professional obligations under Czech bar association rules.

---

## Executive Summary

**Key Risks:**
- Queries through Claude API flow via Anthropic cloud infrastructure
- Query content may reveal client matters and privileged information
- Czech Bar Association rules (Česká advokátní komora — ČAK, cak.cz) require strict confidentiality (povinnost mlčenlivosti) under zákon č. 85/1996 Sb., o advokacii

**Safe Use Options:**
1. **General Legal Research**: Use Tool for non-client-specific queries
2. **Local npm Package**: Install `@ansvar/czech-law-mcp` locally — database queries stay on your machine
3. **Remote Endpoint**: Vercel Streamable HTTP endpoint — queries transit Vercel infrastructure
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
- Recommended for: general research, solo practitioners, matters involving any client context

#### 2. Remote Endpoint (Vercel)

```
Endpoint: https://czech-law-mcp.vercel.app/mcp
```

- Queries transit Vercel infrastructure (Vercel, Inc., USA)
- Tool responses return through the same path
- Subject to Vercel's privacy policy
- Acceptable for: fully anonymized, non-client-specific legal research only

#### 3. On-Premise Deployment (Most Secure)

```bash
docker run -e DATABASE_PATH=/data/czech-law.db ansvar/czech-law-mcp
```

- Full control: no data leaves your infrastructure
- Pair with a self-hosted LLM (e.g., Ollama) to eliminate all external data flows
- Required for: classified matters, government use, matters where mlčenlivost (confidentiality) mandates no external processing

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

Czech lawyers (advokáti) are bound by strict confidentiality rules under **zákon č. 85/1996 Sb., o advokacii**, and the **Etický kodex České advokátní komory**, enforced by the Česká advokátní komora (ČAK, cak.cz). Disciplinary matters are handled by the Kárná komise ČAK.

#### Povinnost Mlčenlivosti (Duty of Confidentiality) — § 21 Zákona o Advokacii

- All client communications are privileged under § 21 zákona č. 85/1996 Sb.
- The duty applies without time limit and survives termination of the mandate (mandátní vztah)
- Client identity may be confidential in sensitive matters
- Case strategy, legal analysis, and factual instructions are protected
- Information that could identify clients or matters must be safeguarded even in anonymized queries
- Breach of confidentiality may result in disciplinary proceedings (kárné řízení) before the Kárná komise ČAK and potential criminal liability

### Czech GDPR Implementation and Personal Data Protection

Under **GDPR Article 28** and the **zákon č. 110/2019 Sb., o zpracování osobních údajů** (Czech GDPR adaptation act), when using services that process client data:

- You are the **Data Controller** (správce osobních údajů) under GDPR Article 4(7)
- AI service providers (Anthropic, Vercel) may be **Data Processors** (zpracovatel osobních údajů) under GDPR Article 4(8)
- A **Data Processing Agreement** (smlouva o zpracování osobních údajů / zpracovatelská smlouva) under GDPR Article 28 may be required before transmitting any personal data
- Ensure adequate technical and organizational measures (technická a organizační opatření, TOMs) are in place
- The **Úřad pro ochranu osobních údajů (ÚOOÚ, uoou.cz)** is the supervisory authority for Czech GDPR compliance; complaints and enforcement actions are handled by ÚOOÚ

### Zákon č. 110/2019 Sb. — Specific Czech Provisions

The Czech adaptation act supplements GDPR with national derogations including:

- Specific rules on processing of personal data by courts and legal professionals
- Age of consent set at 15 years for information society services
- Additional bases for processing in the context of employment and public interest

Advokáti processing client personal data must comply with both GDPR and zákon č. 110/2019 Sb. When in doubt, consult ÚOOÚ guidance at uoou.cz.

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
Example: "What are the penalties for fraud (podvod) under the Czech trestní zákoník (zákon č. 40/2009 Sb.)?"
```

- Query pattern may reveal you are working on a fraud matter
- Anthropic/Vercel logs may link queries to your API key
- Consider using local npm package even for anonymized queries involving sensitive practice areas

### HIGH RISK: Client-Specific Queries

**DO NOT USE through cloud AI services:**

- Remove ALL identifying details before using any cloud deployment
- Use the local npm package with a self-hosted LLM
- Or use commercial legal databases (ASPI, Beck-online, CODEXIS) with proper zpracovatelské smlouvy
- Queries containing client names, company registration numbers (IČO), addresses, or case references are HIGH RISK even if you consider them anonymized

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
- **Vercel** (if using remote endpoint): Subject to [Vercel Privacy Policy](https://vercel.com/legal/privacy-policy)

---

## Recommendations

### For Solo Practitioners / Small Firms (Samostatní advokáti / Malé kanceláře)

1. Use local npm package for maximum privacy
2. General research: Cloud AI is acceptable for fully non-client-specific queries
3. Client matters: Use commercial legal databases (ASPI, Beck-online) with proper zpracovatelské smlouvy under GDPR Article 28
4. Review ČAK ethics guidance on AI tool use before adopting any cloud-based legal AI tool

### For Large Firms / Corporate Legal (Velké kanceláře / Podnikové právní oddělení)

1. Negotiate Data Processing Agreements (smlouvy o zpracování osobních údajů) with AI service providers before use
2. Consider on-premise deployment with self-hosted LLM for client-facing work
3. Train staff on safe vs. unsafe query patterns — include in annual GDPR training
4. Appoint a Data Protection Officer (pověřenec pro ochranu osobních údajů) if required by zákon č. 110/2019 Sb.

### For Government / Public Sector (Státní orgány / Veřejný sektor)

1. Use self-hosted deployment, no external APIs
2. Follow Czech government IT security requirements under **zákon č. 181/2014 Sb., o kybernetické bezpečnosti** (Cyber Security Act) and NÚKIB guidelines
3. Air-gapped option available for classified matters under zákon č. 412/2005 Sb. (Act on Protection of Classified Information)

---

## Questions and Support

- **Privacy Questions**: Open issue on [GitHub](https://github.com/Ansvar-Systems/Czech-law-mcp/issues)
- **Anthropic Privacy**: Contact privacy@anthropic.com
- **ČAK Guidance**: Consult the Česká advokátní komora (cak.cz) for ethics guidance on AI tool use by advokáti
- **ÚOOÚ**: For GDPR compliance queries, see uoou.cz

---

**Last Updated**: 2026-03-06
**Tool Version**: 1.0.0
