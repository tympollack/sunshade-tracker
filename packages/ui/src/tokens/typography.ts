/**
 * @sunshade/ui Design System - Typography Tokens
 * Standardizes fonts across human UI layers and telemetry/ledger systems.
 */

export const fontFamilies = {
  /**
   * Human UI layers: Clean, modern sans-serif
   */
  sans: 'Inter, -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, sans-serif',

  /**
   * System ledger, node telemetry, balances, hash strings: Monospaced
   */
  mono: '"Roboto Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',

  /**
   * Display typography
   */
  display: 'Inter, -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
} as const;

export const fontStacks = {
  humanUI: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'Segoe UI', 'Roboto', 'sans-serif'],
  telemetry: ['Roboto Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
  ledger: ['Roboto Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
} as const;

export const typographyPresets = {
  h1: 'font-sans text-3xl font-bold tracking-tight text-white sm:text-4xl',
  h2: 'font-sans text-2xl font-bold tracking-tight text-white sm:text-3xl',
  h3: 'font-sans text-xl font-semibold tracking-tight text-white',
  h4: 'font-sans text-lg font-semibold text-white',
  body: 'font-sans text-sm text-zinc-300 leading-relaxed',
  bodyMuted: 'font-sans text-xs text-zinc-400',
  caption: 'font-sans text-xs text-zinc-500',
  
  // Telemetry & Ledger Presets
  telemetryValue: 'font-mono text-base font-bold tracking-wider text-orange-400',
  telemetryValueLg: 'font-mono text-xl sm:text-2xl font-bold tracking-wider text-orange-400',
  telemetryLabel: 'font-mono text-[11px] uppercase tracking-widest text-zinc-400',
  ledgerHash: 'font-mono text-xs text-zinc-400 truncate',
  tokenAmount: 'font-mono text-sm font-semibold tracking-wide text-zinc-100',
} as const;

export type FontFamilies = typeof fontFamilies;
export type TypographyPresets = typeof typographyPresets;
