import { HierarchyLevel } from '@/types/tracker';

export interface LevelColorInfo {
  hex: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  dotBg: string;
}

export const LEVEL_COLOR_PALETTE: Record<number, LevelColorInfo> = {
  1: {
    hex: '#c084fc',
    badgeBg: 'bg-slate-900',
    badgeText: 'text-purple-300',
    badgeBorder: 'border-purple-500/60',
    dotBg: 'bg-purple-400',
  },
  2: {
    hex: '#38bdf8',
    badgeBg: 'bg-slate-900',
    badgeText: 'text-sky-300',
    badgeBorder: 'border-sky-500/60',
    dotBg: 'bg-sky-400',
  },
  3: {
    hex: '#34d399',
    badgeBg: 'bg-slate-900',
    badgeText: 'text-emerald-300',
    badgeBorder: 'border-emerald-500/60',
    dotBg: 'bg-emerald-400',
  },
  4: {
    hex: '#fbbf24',
    badgeBg: 'bg-slate-900',
    badgeText: 'text-amber-300',
    badgeBorder: 'border-amber-500/60',
    dotBg: 'bg-amber-400',
  },
  5: {
    hex: '#fb7185',
    badgeBg: 'bg-slate-900',
    badgeText: 'text-rose-300',
    badgeBorder: 'border-rose-500/60',
    dotBg: 'bg-rose-400',
  },
};

export function getDefaultLevelHex(level: number): string {
  const palette: Record<number, string> = {
    1: '#c084fc',
    2: '#38bdf8',
    3: '#34d399',
    4: '#fbbf24',
    5: '#fb7185',
  };
  return palette[level] || '#94a3b8';
}

const DEFAULT_LEVEL_COLOR: LevelColorInfo = {
  hex: '#94a3b8',
  badgeBg: 'bg-slate-900',
  badgeText: 'text-slate-300',
  badgeBorder: 'border-slate-700',
  dotBg: 'bg-slate-400',
};

export function getHierarchyLevelColor(
  type: string,
  hierarchy: HierarchyLevel[] = []
): LevelColorInfo {
  const match = hierarchy.find((h) => h.type.toLowerCase() === type.toLowerCase());
  if (match) {
    if (match.color) {
      return {
        hex: match.color,
        badgeBg: 'bg-slate-900',
        badgeText: 'text-slate-200',
        badgeBorder: 'border-slate-700',
        dotBg: 'bg-emerald-400',
      };
    }
    return LEVEL_COLOR_PALETTE[match.level] || DEFAULT_LEVEL_COLOR;
  }

  // Fallback by standard naming convention if not in hierarchy
  const lower = type.toLowerCase();
  if (lower.includes('project') || lower.includes('initiative')) return LEVEL_COLOR_PALETTE[1];
  if (lower.includes('epic') || lower.includes('milestone')) return LEVEL_COLOR_PALETTE[1];
  if (lower.includes('story') || lower.includes('feature')) return LEVEL_COLOR_PALETTE[2];
  if (lower.includes('task') || lower.includes('subtask')) return LEVEL_COLOR_PALETTE[3];
  if (lower.includes('bug') || lower.includes('defect')) return LEVEL_COLOR_PALETTE[5];

  return DEFAULT_LEVEL_COLOR;
}
