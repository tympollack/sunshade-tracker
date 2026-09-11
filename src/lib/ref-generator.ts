import { supabaseAdmin } from '@/lib/db';

/**
 * Common abbreviation overrides for known project slugs
 */
const KNOWN_PREFIXES: Record<string, string> = {
  'sunshade-tracker': 'TRK',
  'tracker': 'TRK',
  'sunshade-db-platform': 'DBP',
  'db-platform': 'DBP',
  'sunshade-hub': 'HUB',
  'hub': 'HUB',
  'makerverse': 'MKV',
  'patchwork': 'PTW',
  'lightstone': 'LST',
  'lexshade': 'LEX',
  'puk-huk': 'PH',
  'wsw': 'WSW',
  'valerie': 'VAL',
  'cozy': 'CZY',
};

/**
 * Derives a clean uppercase project prefix (e.g. 'TRK') from project settings, slug, or name.
 */
export function deriveProjectPrefix(project?: {
  slug?: string;
  name?: string;
  settings?: any;
}): string {
  if (!project) return 'PRJ';

  // 1. Explicit prefix in settings
  if (project.settings?.default_prefix && typeof project.settings.default_prefix === 'string') {
    const p = project.settings.default_prefix.trim().toUpperCase();
    if (p) return p;
  }
  if (project.settings?.ref_prefix && typeof project.settings.ref_prefix === 'string') {
    const p = project.settings.ref_prefix.trim().toUpperCase();
    if (p) return p;
  }
  if (project.settings?.prefix && typeof project.settings.prefix === 'string') {
    const p = project.settings.prefix.trim().toUpperCase();
    if (p) return p;
  }

  const slug = (project.slug || '').toLowerCase().trim();
  if (KNOWN_PREFIXES[slug]) {
    return KNOWN_PREFIXES[slug];
  }

  // Strip common prefix 'sunshade-'
  const cleanSlug = slug.replace(/^sunshade-/, '');
  if (KNOWN_PREFIXES[cleanSlug]) {
    return KNOWN_PREFIXES[cleanSlug];
  }

  // Multi-word slug or name (e.g. 'cloud-infra' -> 'CI', 'puk-huk' -> 'PH', 'SunShade Tracker' -> 'ST')
  const rawIdentifier = cleanSlug || (project.name || '').toLowerCase().replace(/[^a-z0-9\s_-]/g, '').trim();
  const parts = rawIdentifier.split(/[-_\s]+/).filter(Boolean);
  if (parts.length >= 2) {
    const initials = parts.map((w) => w[0].toUpperCase()).join('');
    if (initials.length >= 2) return initials.slice(0, 4);
  }

  // Single word: extract consonants if 3+ (e.g. 'tracker' -> 'TRK')
  const word = rawIdentifier.replace(/[^a-z0-9]/g, '');
  if (word.length > 0) {
    const consonants = word.replace(/[aeiou]/g, '').toUpperCase();
    if (consonants.length >= 3) {
      return consonants.slice(0, 3);
    }
    return word.slice(0, 3).toUpperCase();
  }

  return 'PRJ';
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Scans existing external_ref_ids for a project and generates the next sequential
 * reference tag (e.g. 'TRK-01', 'TRK-02', etc.), guaranteeing uniqueness.
 */
export async function generateNextSequentialRef(
  projectId: string,
  prefix: string,
  extraReservedRefs?: Set<string>
): Promise<string> {
  const refs = await generateSequentialRefsForBatch(projectId, prefix, 1, extraReservedRefs);
  return refs[0];
}

/**
 * Generates an array of count unique sequential refs in a single database query.
 */
export async function generateSequentialRefsForBatch(
  projectId: string,
  prefix: string,
  count: number,
  extraReservedRefs?: Set<string>
): Promise<string[]> {
  if (count <= 0) return [];

  // Query all active and soft-deleted refs for this project to avoid unique constraint collisions
  let query: any = supabaseAdmin
    .from('work_items')
    .select('external_ref_id')
    .eq('project_id', projectId);

  const { data: rows } = await query;
  const existingSet = new Set<string>();
  if (extraReservedRefs) {
    extraReservedRefs.forEach((r) => existingSet.add(r.toUpperCase()));
  }

  let maxNum = 0;
  // Patterns:
  // 1. Exact match: ^TRK-(\d+)$
  // 2. Typed match: ^(?:TASK|STORY|EPIC|BUG|PR)-TRK-(\d+)$
  const esc = escapeRegex(prefix.toUpperCase());
  const exactPattern = new RegExp(`^${esc}-(\\d+)$`, 'i');
  const typedPattern = new RegExp(`^[A-Z0-9]+-${esc}-(\\d+)$`, 'i');

  for (const row of rows || []) {
    if (row.external_ref_id && typeof row.external_ref_id === 'string') {
      const ref = row.external_ref_id.trim();
      existingSet.add(ref.toUpperCase());

      const mExact = ref.match(exactPattern);
      if (mExact) {
        const n = parseInt(mExact[1], 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      } else {
        const mTyped = ref.match(typedPattern);
        if (mTyped) {
          const n = parseInt(mTyped[1], 10);
          if (!isNaN(n) && n > maxNum) maxNum = n;
        }
      }
    }
  }

  const generated: string[] = [];
  let candidateNum = maxNum + 1;

  while (generated.length < count) {
    const formatted = `${prefix.toUpperCase()}-${String(candidateNum).padStart(2, '0')}`;
    if (!existingSet.has(formatted.toUpperCase())) {
      generated.push(formatted);
      existingSet.add(formatted.toUpperCase());
    }
    candidateNum++;
  }

  return generated;
}
