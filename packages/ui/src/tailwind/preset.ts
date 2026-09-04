import { sunshadeColors, cozyColors } from '../tokens/colors';
import { fontStacks } from '../tokens/typography';

/**
 * Shared Tailwind CSS Configuration Preset for @sunshade/ui
 * Compatible with Tailwind CSS v3 and v4.
 */
export const sunshadeTailwindPreset = {
  darkMode: ['class', '[data-theme=\"dark\"]'],
  theme: {
    extend: {
      colors: {
        sunshade: {
          DEFAULT: sunshadeColors.burntOrange,
          orange: sunshadeColors.burntOrange,
          charcoal: sunshadeColors.charcoal,
          offwhite: sunshadeColors.offWhite,
          50: sunshadeColors.orange[50],
          100: sunshadeColors.orange[100],
          200: sunshadeColors.orange[200],
          300: sunshadeColors.orange[300],
          400: sunshadeColors.orange[400],
          500: sunshadeColors.orange[500],
          600: sunshadeColors.orange[600],
          700: sunshadeColors.orange[700],
          800: sunshadeColors.orange[800],
          900: sunshadeColors.orange[900],
          950: sunshadeColors.orange[950],
        },
        cozy: {
          amber: cozyColors.amber,
          gold: cozyColors.gold,
          bark: cozyColors.bark,
          cream: cozyColors.cream,
          warm: cozyColors.softCream,
          timber: cozyColors.timberNight,
        },
      },
      fontFamily: {
        sans: fontStacks.humanUI,
        mono: fontStacks.telemetry,
        telemetry: fontStacks.telemetry,
        ledger: fontStacks.ledger,
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        glow: '0 0 20px rgba(204, 85, 0, 0.35)',
        'glow-cozy': '0 0 20px rgba(245, 158, 11, 0.30)',
      },
      backdropBlur: {
        xs: '2px',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
};

export default sunshadeTailwindPreset;
