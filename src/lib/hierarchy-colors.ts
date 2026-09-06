import { HierarchyLevel } from '@/types/tracker';

export interface LevelColorInfo {
  hex: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  dotBg: string;
}

const LEVEL_COLOR_PALETTE: Record<number, LevelColorInfo> = {
  1: {
    hex: '#a855f7',
    badgeBg: 'bg-purple-500/15',
    badgeText: 'text-purple-300',
    badgeBorder: 'border-purple-500/30',
    dotBg: 'bg-purple-400',
  },
  2: {
    hex: '#38bdf8',
    badgeBg: 'bg-sky-500/15',
    badgeText: 'text-sky-300',
    badgeBorder: 'border-sky-500/30',
    dotBg: 'bg-sky-400',
  },
  3: {
    hex: '#10b981',
    badgeBg: 'bg-emerald-500/15',
    badgeText: 'text-emerald-300',
    badgeBorder: 'border-emerald-500/30',
    dotBg: 'bg-emerald-400',
  },
  4: {
    hex: '#f59e0b',
    badgeBg: 'bg-amber-500/15',
    badgeText: 'text-amber-300',
    badgeBorder: 'border-amber-500/30',
    dotBg: 'bg-amber-400',
  },
  5: {
    hex: '#f43f5e',
    badgeBg: 'bg-rose-500/15',
    badgeText: 'text-rose-300',
    badgeBorder: 'border-rose-500/30',
    dotBg: 'bg-rose-400',
  },
};

const DEFAULT_LEVEL_COLOR: LevelColorInfo = {
  hex: '#94a3b8',
  badgeBg: 'bg-slate-800',
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
        badgeText: 'text-white',
        badgeBorder: 'border-slate-700',
        dotBg: 'bg-emerald-400',
      };
    }
    return LEVEL_COLOR_PALETTE[match.level] || DEFAULT_LEVEL_COLOR;
  }

  // Fallback by standard naming convention if not in hierarchy
  const lower = type.toLowerCase();
  if (lower.includes('project') || lower.includes('initiative')) return LEVEL_COLOR_PALETTE[1];
  if (lower.includes('epic') || lower.includes('milestone')) return LEVEL_COLOR_PALETTE[2];
  if (lower.includes('story') || lower.includes('feature')) return LEVEL_COLOR_PALETTE[3];
  if (lower.includes('task') || lower.includes('subtask') || lower.includes('bug')) return LEVEL_COLOR_PALETTE[4];

  return DEFAULT_LEVEL_COLOR;
}
