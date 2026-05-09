// Vendored from Ansvar-Architecture-Documentation@04c77ec8 per
// docs/guides/law-mcp-golden-standard.md Pattern 13.6.
// Source: scripts/ingestion/classify-provision.ts
// SHA-256 of canonical: 08e52cdb266d9468040f1c97675e15a07669d13119187dae8a29c807a8821bab
//
// Re-vendor only when the canonical file changes; do NOT edit in-tree.
//
// Canonical baseline classifier for legal_provisions.metadata.provision_role
// and provision_form. Per-MCP overrides extend the language map.
//
// Spec: docs/superpowers/specs/2026-05-08-mcp-search-quality-standard-design.md §1.6
// Standard: docs/guides/law-mcp-golden-standard.md Pattern 13.6

export type ProvisionRole = 'substantive' | 'transitional' | 'effectiveness';
export type ProvisionForm = 'body' | 'appendix' | 'definitions' | 'table' | 'catalogue';

interface RoleRegexes {
  transitional: RegExp;
  effectiveness: RegExp;
}

// JS \b is ASCII-only; non-ASCII-starting words (Účinnost, Övergångs, Übergangs)
// fail with bare \b. Use Unicode-property-class lookarounds with the /u flag.
// LB = "left boundary" (no preceding letter/number), RB = right boundary.

const ROLE_PATTERNS: Record<string, RoleRegexes> = {
  cs: {
    transitional:  /(?<![\p{L}\p{N}])p[řr]echodn|(?<![\p{L}\p{N}])z[áa]v[ěe]re[čc]n/iu,
    effectiveness: /(?<![\p{L}\p{N}])ú[čc]innost(?![\p{L}\p{N}])/iu,
  },
  sv: {
    transitional:  /(?<![\p{L}\p{N}])[öo]verg[åa]ngs|(?<![\p{L}\p{N}])slutbest/iu,
    effectiveness: /(?<![\p{L}\p{N}])ikrafttr[äa]dande(?![\p{L}\p{N}])/iu,
  },
  de: {
    transitional:  /(?<![\p{L}\p{N}])(übergangs|schluss)best/iu,
    effectiveness: /(?<![\p{L}\p{N}])inkrafttreten(?![\p{L}\p{N}])/iu,
  },
  nl: {
    transitional:  /(?<![\p{L}\p{N}])overgangs/iu,
    effectiveness: /(?<![\p{L}\p{N}])inwerkingtreding(?![\p{L}\p{N}])/iu,
  },
  fr: {
    transitional:  /(?<![\p{L}\p{N}])dispositions\s+transitoires/iu,
    effectiveness: /(?<![\p{L}\p{N}])entr[ée]e\s+en\s+vigueur/iu,
  },
  // extend per-jurisdiction
};

const FORM_PATTERNS: Record<ProvisionForm, RegExp> = {
  appendix:    /^(příloha|bilaga|anhang|bijlage|annexe|allegato|załącznik|annex)(?![\p{L}\p{N}])/iu,
  definitions: /^(definice|definitioner|begriffsbestimmungen|definities|definitions)(?![\p{L}\p{N}])/iu,
  table:       /(?<![\p{L}\p{N}])(tabulka|tabell|tabelle|tabel|table)(?![\p{L}\p{N}])/iu,
  catalogue:   /(?<![\p{L}\p{N}])(seznam|f[oö]rteckning|verzeichnis|lijst)(?![\p{L}\p{N}])/iu,
  body:        /(?!)/, // never matches — body is the default
};

export interface ClassifyInput {
  section: string;
  content?: string;
}

export interface ClassifyOutput {
  role: ProvisionRole;
  form: ProvisionForm;
}

export function classifyProvision(language: string, input: ClassifyInput): ClassifyOutput {
  const langPatterns = ROLE_PATTERNS[language.toLowerCase()];
  let role: ProvisionRole = 'substantive';
  if (langPatterns) {
    if (langPatterns.effectiveness.test(input.section)) role = 'effectiveness';
    else if (langPatterns.transitional.test(input.section)) role = 'transitional';
  }

  let form: ProvisionForm = 'body';
  for (const f of ['appendix', 'definitions', 'table', 'catalogue'] as const) {
    if (FORM_PATTERNS[f].test(input.section)) {
      form = f;
      break;
    }
  }

  return { role, form };
}
