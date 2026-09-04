/**
 * @sunshade/ui Design System - Glassmorphism Tokens & Presets
 * Standard glass styling presets across Web and Mobile targets.
 */

export const glassPresets = {
  /**
   * Primary standard glassmorphism styling preset
   */
  default: 'backdrop-blur-md bg-stone-950/85 border border-white/10 shadow-xl rounded-2xl',
  standard: 'backdrop-blur-md bg-stone-950/85 border border-white/10 shadow-xl rounded-2xl',
  
  /**
   * Cozy warm ember glass preset
   */
  cozy: 'backdrop-blur-md bg-stone-950/85 border border-amber-500/20 shadow-xl rounded-2xl',

  /**
   * Subtle low-contrast glass preset
   */
  subtle: 'backdrop-blur-sm bg-stone-900/60 border border-white/5 shadow-lg rounded-xl',

  /**
   * Interactive hover/active glass preset
   */
  interactive: 'backdrop-blur-md bg-stone-950/85 border border-white/10 shadow-xl rounded-2xl transition-all duration-200 hover:border-orange-500/30 hover:bg-stone-950/90 active:scale-[0.99]',
} as const;

/**
 * Universal React Native / CSS style objects for environments requiring explicit styling.
 */
export const glassStyles = {
  default: {
    backgroundColor: 'rgba(12, 10, 9, 0.85)', // stone-950 85%
    borderColor: 'rgba(255, 255, 255, 0.10)', // white/10
    borderWidth: 1,
    borderRadius: 16, // rounded-2xl
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  standard: {
    backgroundColor: 'rgba(12, 10, 9, 0.85)', // stone-950 85%
    borderColor: 'rgba(255, 255, 255, 0.10)', // white/10
    borderWidth: 1,
    borderRadius: 16, // rounded-2xl
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  cozy: {
    backgroundColor: 'rgba(20, 16, 14, 0.88)', // warm dark timber
    borderColor: 'rgba(245, 158, 11, 0.20)', // amber-500/20
    borderWidth: 1,
    borderRadius: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.30,
    shadowRadius: 20,
    elevation: 8,
  },
  subtle: {
    backgroundColor: 'rgba(28, 25, 23, 0.60)', // stone-900 60%
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderRadius: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  interactive: {
    backgroundColor: 'rgba(12, 10, 9, 0.85)',
    borderColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
    borderRadius: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
} as const;

export type GlassPresetKey = keyof typeof glassPresets;
