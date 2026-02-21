import type { DocumentDetailResponse, FragmentRecord } from './fetcher.js';

export interface TargetLaw {
  id: string;
  staleUrl: string;
  seedFile: string;
  shortName: string;
  titleEn: string;
  description: string;
}

export interface SeedProvision {
  provision_ref: string;
  chapter?: string;
  section: string;
  title: string;
  content: string;
}

export interface SeedDefinition {
  term: string;
  definition: string;
  source_provision: string;
}

export interface ParsedLawSeed {
  id: string;
  type: 'statute';
  title: string;
  title_en: string;
  short_name: string;
  status: 'in_force';
  issued_date?: string;
  in_force_date?: string;
  url: string;
  description: string;
  provisions: SeedProvision[];
  definitions: SeedDefinition[];
}

interface WorkingProvision {
  provision_ref: string;
  section: string;
  title: string;
  chapter?: string;
  contentParts: string[];
}

const STRUCTURAL_LEVELS: Record<string, number> = {
  Kniha: 0,
  Cast: 1,
  Hlava: 2,
  Dil: 3,
  Oddil: 4,
  Pododdil: 5,
};

const IGNORED_TYPES = new Set<string>([
  'Prefix',
  'Postfix',
  'Novela',
  'Virtual_Document',
  'Virtual_Prefix',
  'Virtual_Postfix',
  'Virtual_Norma',
  'Virtual_Novela',
]);

const TARGET_CZECH_LAWS: TargetLaw[] = [
  {
    id: 'cz:106/1999',
    staleUrl: '/sb/1999/106',
    seedFile: 'zakon-106-1999.json',
    shortName: 'InfZ',
    titleEn: 'Act on Free Access to Information',
    description: 'Regulates the right of public access to information held by public authorities.',
  },
  {
    id: 'cz:110/2019',
    staleUrl: '/sb/2019/110',
    seedFile: 'zakon-110-2019.json',
    shortName: 'ZZOU',
    titleEn: 'Act on Processing of Personal Data',
    description: 'Implements Czech national rules for personal data processing and supervision.',
  },
  {
    id: 'cz:127/2005',
    staleUrl: '/sb/2005/127',
    seedFile: 'zakon-127-2005.json',
    shortName: 'ZEK',
    titleEn: 'Electronic Communications Act',
    description: 'Sets out legal obligations for electronic communications networks and services.',
  },
  {
    id: 'cz:181/2014',
    staleUrl: '/sb/2014/181',
    seedFile: 'zakon-181-2014.json',
    shortName: 'ZKB',
    titleEn: 'Cybersecurity Act',
    description: 'Defines cybersecurity obligations, incident handling, and public authority powers.',
  },
  {
    id: 'cz:240/2000',
    staleUrl: '/sb/2000/240',
    seedFile: 'zakon-240-2000.json',
    shortName: 'Krizovy zakon',
    titleEn: 'Crisis Management Act',
    description: 'Regulates crisis preparedness and crisis management powers in the Czech Republic.',
  },
  {
    id: 'cz:297/2016',
    staleUrl: '/sb/2016/297',
    seedFile: 'zakon-297-2016.json',
    shortName: 'ZSVD',
    titleEn: 'Trust Services for Electronic Transactions Act',
    description: 'Regulates trust services and electronic identification for digital transactions.',
  },
  {
    id: 'cz:365/2000',
    staleUrl: '/sb/2000/365',
    seedFile: 'zakon-365-2000.json',
    shortName: 'ISVS',
    titleEn: 'Act on Public Administration Information Systems',
    description: 'Defines legal requirements for information systems used by public administration.',
  },
  {
    id: 'cz:40/2009',
    staleUrl: '/sb/2009/40',
    seedFile: 'zakon-40-2009.json',
    shortName: 'TZ',
    titleEn: 'Criminal Code',
    description: 'Codifies criminal offenses and penalties, including computer-related crimes.',
  },
  {
    id: 'cz:480/2004',
    staleUrl: '/sb/2004/480',
    seedFile: 'zakon-480-2004.json',
    shortName: 'ZSIS',
    titleEn: 'Act on Certain Information Society Services',
    description: 'Regulates selected legal duties for information society service providers.',
  },
  {
    id: 'cz:89/2012',
    staleUrl: '/sb/2012/89',
    seedFile: 'zakon-89-2012.json',
    shortName: 'OZ',
    titleEn: 'Civil Code',
    description: 'Core private law code governing civil law relationships and obligations.',
  },
];

const BASIC_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&ndash;': '–',
  '&mdash;': '—',
};

function decodeHtmlEntities(input: string): string {
  let out = input;

  for (const [entity, value] of Object.entries(BASIC_ENTITIES)) {
    out = out.split(entity).join(value);
  }

  out = out.replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)));
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)));

  return out;
}

export function xhtmlToText(xhtml: string | undefined): string {
  if (!xhtml) return '';

  const withBreaks = xhtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|ul|ol|table|tbody|thead|tfoot)>/gi, '\n');

  const stripped = withBreaks.replace(/<[^>]+>/g, '');
  const decoded = decodeHtmlEntities(stripped);

  return decoded
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function extractSectionNumber(provisionRef: string): string | null {
  const match = provisionRef.match(/^§\s*([0-9]+[a-z]?)/i);
  return match ? match[1] : null;
}

function toIsoDate(value?: string): string | undefined {
  if (!value) return undefined;
  const datePart = value.split('T')[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : undefined;
}

function isStructuralType(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(STRUCTURAL_LEVELS, type);
}

function shouldIgnore(type: string): boolean {
  return IGNORED_TYPES.has(type) || type.startsWith('Virtual_') || type.startsWith('Prefix_') || type.startsWith('Postfix_');
}

function extractDefinitions(provisions: SeedProvision[]): SeedDefinition[] {
  const out: SeedDefinition[] = [];
  const seen = new Set<string>();

  for (const provision of provisions) {
    const content = provision.content;
    const lower = content.toLowerCase();

    if (!lower.includes('se rozumí') && !lower.includes('znamená')) {
      continue;
    }

    const quotedMatches = content.matchAll(/[„"]([^„“"]{2,120})[“"]\s*(?:se\s+)?(?:rozumí|znamená)\s+([^.;\n]{5,260})/gimu);
    for (const match of quotedMatches) {
      const term = match[1].trim();
      const definition = match[2].trim();
      const key = `${term}::${provision.provision_ref}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ term, definition, source_provision: provision.provision_ref });
      }
    }
  }

  return out.slice(0, 100);
}

export function parseLawSeed(
  targetLaw: TargetLaw,
  detail: DocumentDetailResponse,
  fragments: FragmentRecord[],
): ParsedLawSeed {
  const provisions: SeedProvision[] = [];
  const hierarchy: string[] = [];

  let current: WorkingProvision | null = null;
  let previousType = '';
  let previousStructuralLevel: number | null = null;

  const finalizeCurrent = (): void => {
    if (!current) return;
    const content = current.contentParts.join('\n').trim();
    if (content.length > 0) {
      provisions.push({
        provision_ref: current.provision_ref,
        section: current.section,
        title: current.title,
        chapter: current.chapter,
        content,
      });
    }
    current = null;
  };

  for (const fragment of fragments) {
    if (fragment.jeUcinny === false) {
      continue;
    }

    const type = fragment.kodTypuFragmentu;
    const text = xhtmlToText(fragment.xhtml);

    if (isStructuralType(type)) {
      finalizeCurrent();
      previousStructuralLevel = STRUCTURAL_LEVELS[type];
      if (text.length > 0) {
        hierarchy[previousStructuralLevel] = text;
        hierarchy.length = previousStructuralLevel + 1;
      }
      previousType = type;
      continue;
    }

    if (type === 'Nadpis_pod' && previousType !== 'Paragraf' && previousStructuralLevel !== null) {
      if (text.length > 0) {
        const currentLevelHeading = hierarchy[previousStructuralLevel] ?? '';
        hierarchy[previousStructuralLevel] = currentLevelHeading
          ? `${currentLevelHeading} - ${text}`
          : text;
      }
      previousType = type;
      continue;
    }

    if (type === 'Paragraf') {
      finalizeCurrent();

      const provisionRef = text.replace(/\s+/g, ' ').trim();
      const section = extractSectionNumber(provisionRef);
      if (!section) {
        previousType = type;
        continue;
      }

      current = {
        provision_ref: provisionRef,
        section,
        title: provisionRef,
        chapter: hierarchy.filter(Boolean).join(' > ') || undefined,
        contentParts: [],
      };
      previousType = type;
      continue;
    }

    if (!current) {
      previousType = type;
      continue;
    }

    if (type === 'Nadpis_pod' && previousType === 'Paragraf') {
      if (text.length > 0) {
        current.title = `${current.provision_ref} ${text}`;
      }
      previousType = type;
      continue;
    }

    if (shouldIgnore(type) || isStructuralType(type) || type === 'Paragraf') {
      previousType = type;
      continue;
    }

    if (text.length > 0) {
      current.contentParts.push(text);
    }

    previousType = type;
  }

  finalizeCurrent();

  const definitions = extractDefinitions(provisions);
  const url = detail.staleUrl ? `https://www.e-sbirka.cz${detail.staleUrl}` : `https://www.e-sbirka.cz${targetLaw.staleUrl}`;

  return {
    id: targetLaw.id,
    type: 'statute',
    title: detail.uplnaCitace || detail.nazev,
    title_en: targetLaw.titleEn,
    short_name: targetLaw.shortName,
    status: 'in_force',
    issued_date: toIsoDate(detail.datumCasVyhlaseni),
    in_force_date: toIsoDate(detail.datumUcinnostiOd) ?? toIsoDate(detail.datumUcinnostiZneniOd),
    url,
    description: targetLaw.description,
    provisions,
    definitions,
  };
}

export const TARGET_LAWS = TARGET_CZECH_LAWS;

