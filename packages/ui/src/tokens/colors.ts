/**
 * @sunshade/ui Design System - Color Tokens
 * Standardizes color palettes across the SunShade ecosystem and Cozy.
 */

export const sunshadeColors = {
  // SunShade Core Tokens
  burntOrange: '#CC5500',
  charcoal: '#1A1A1A',
  offWhite: '#F9F9F9',
  
  // Extended SunShade Swatches
  orange: {
    50: '#fff7ed',
    100: '#ffedd5',
    200: '#fed7aa',
    300: '#fdba74',
    400: '#fb923c',
    500: '#f97316',
    600: '#ea580c',
    700: '#CC5500', // Core Brand Burnt Orange
    800: '#9a3412',
    900: '#7c2d12',
    950: '#431407',
  },
  charcoalDark: '#121212',
  charcoalLight: '#242424',
} as const;

export const cozyColors = {
  // Cozy Accent Tokens
  amber: '#F59E0B',
  gold: '#D97706',
  bark: '#291E16',
  cream: '#FAF7F2',

  // Extended Cozy Accents
  warmLinen: '#FAF7F2',
  roastedCoffee: '#291E16',
  sunlitAmber: '#F59E0B',
  emberGold: '#D97706',
  timberNight: '#14100E',
  softCream: '#F4ECDF',
} as const;

export const semanticColors = {
  primary: sunshadeColors.burntOrange,
  primaryForeground: '#FFFFFF',
  background: {
    dark: sunshadeColors.charcoal,
    light: sunshadeColors.offWhite,
    cozyLight: cozyColors.cream,
    cozyDark: cozyColors.bark,
  },
  surface: {
    dark: 'rgba(26, 26, 26, 0.85)',
    light: 'rgba(249, 249, 249, 0.90)',
    cozyLight: 'rgba(250, 247, 242, 0.88)',
    cozyDark: 'rgba(41, 30, 22, 0.90)',
  },
  border: {
    subtle: 'rgba(255, 255, 255, 0.10)',
    orange: 'rgba(204, 85, 0, 0.30)',
    amber: 'rgba(245, 158, 11, 0.30)',
  },
  status: {
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
    telemetry: '#06B6D4',
  },
} as const;

export const colorTokens = {
  sunshade: sunshadeColors,
  cozy: cozyColors,
  semantic: semanticColors,
} as const;

export type SunshadeColors = typeof sunshadeColors;
export type CozyColors = typeof cozyColors;
export type SemanticColors = typeof semanticColors;
