# Wave B/C Clarification Email Templates

Outbound clarification requests for the Czech premium-corpus expansion beyond Wave A (`sbirka.nsoud.cz`, merged in PR #75 on 2026-05-17). Each template mirrors the canonical text in the Wave A design document at `Ansvar-Architecture-Documentation/docs/superpowers/specs/2026-05-17-czech-law-premium-replacement-corpus-design.md` §4. Send before the corresponding ingestor lands on `main`.

## Wave B — Nejvyšší správní soud

**To:** `podatelna@nssoud.cz`
**Cc:** Pověřenec pro ochranu osobních údajů NSS

> Subject: Žádost o vyjasnění podmínek užití dat ze sbírky rozhodnutí pro účely vyhledávací služby
>
> Vážení,
>
> Provozujeme komerční vyhledávací službu nad českým právem a chtěli bychom do ní zařadit rozhodnutí Nejvyššího správního soudu publikovaná na sbirka.nssoud.cz a vyhledavac.nssoud.cz. Vycházíme z toho, že rozhodnutí soudu jsou úředním dílem dle §3 odst. 1 písm. a) zákona č. 121/2000 Sb. a tedy nejsou předmětem autorského práva.
>
> Zaznamenali jsme však v patičce stránek formulaci "Všechna práva vyhrazena", která by mohla naznačovat jiný výklad. Prosíme o potvrzení, že rozhodnutí publikovaná NSS na uvedených portálech (i) lze hromadně stáhnout pro účely komerčního zpřístupnění uživatelům naší služby a (ii) NSS nevynucuje databázová práva sui generis na kompilaci nad rámec §3 zákona č. 121/2000 Sb.
>
> Pokud existují konkrétní podmínky (citace zdroje, omezení rychlosti, oznámení), rádi se jim přizpůsobíme.

**Acceptance:** Three outcomes per design doc §4.

1. NSS confirms GREEN — land Wave B per Wave A build sequence steps 3-9.
2. NSS asserts database rights or refuses — downgrade Wave B manifest entry to AMBER; skip premium-tier inclusion; document refusal verbatim in `infrastructure/policy/source-authority-registry.yml` `notes`.
3. No response after 6 weeks — escalate via a second written request before treating as refusal.

## Wave C — Ústavní soud (NALUS)

**To:** `podani@usoud.cz`
**Cc:** Pověřenec pro ochranu osobních údajů `poverenec@usoud.cz` (confirm address before sending)

> Subject: Žádost o hromadný export rozhodnutí z databáze NALUS pro účely komerční vyhledávací služby
>
> Vážení,
>
> Provozujeme komerční vyhledávací službu nad českým právem. Chtěli bychom do našeho indexu zahrnout rozhodnutí Ústavního soudu zpřístupněná v databázi NALUS. Na rozhraní databáze je uvedeno, že "další používání včetně používání doprovodných informací je povoleno pod podmínkou, že je výslovně uveden tento zdroj, zmíněna jeho bezplatnost a upozorněno na jeho neautentickou povahu" — všechny tři podmínky splňujeme v citačním obalu každého výsledku.
>
> Vzhledem k tomu, že systematický přístup přes webové rozhraní vrací HTTP 403 (anti-scrape postoj), prosíme o:
> 1. Hromadný export dosavadního korpusu rozhodnutí (XML / JSON / SQL dump), případně
> 2. Smluvený přístup k API nebo OAI-PMH endpointu, případně
> 3. Sjednanou rychlost stahování přes určenou identitu klienta (User-Agent + IP), pokud jsou bulk-data nevhodné.
>
> Jsme připraveni přizpůsobit citační boilerplate, omezit rychlost, nebo přijmout jakákoli další omezení, která provoz NALUS vyžaduje.

**Acceptance:** Three outcomes per design doc §4.

1. Bulk export granted — ingest dump; build complexity drops to 2; land per Wave A build sequence steps 3-9.
2. Sanctioned access path granted (designated UA + rate) — build slow ingestor honouring negotiated rate; estimate ~30 days for ~100k decisions at 10s/req; land per Wave A steps 3-9.
3. Refused — close Wave C; document refusal verbatim in source-authority registry `notes`; at-risk register stays open for NALUS specifically. Premium tier still ships under Waves A and B coverage.

## When to send

- **Wave B email:** Week 2 of the timeline in design doc §4, in parallel with Wave B ingestor build.
- **Wave C email:** Week 3, after Wave B has landed (or definitively closed).

## Tracking

Once an email is sent, record the outbound timestamp and recipient in `infrastructure/policy/at-risk-mcps.yml` (arch-docs repo) under the `czech-law` entry's `recovery.clarification_requests[]` list per ADR-030. Do not start an ingestor for a YELLOW source while the clarification request is outstanding.
