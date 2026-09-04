/**
 * Shared Tailwind CSS Configuration Preset for @sunshade/ui
 * CommonJS export for tailwind.config.js consumers.
 */
module.exports = {
  darkMode: ['class', '[data-theme=\"dark\"]'],
  theme: {
    extend: {
      colors: {
        sunshade: {
          DEFAULT: '#CC5500',
          orange: '#CC5500',
          burntOrange: '#CC5500',
          charcoal: '#1A1A1A',
          offwhite: '#F9F9F9',
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#CC5500',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407',
        },
        cozy: {
          amber: '#F59E0B',
          gold: '#D97706',
          bark: '#291E16',
          cream: '#FAF7F2',
          warm: '#F4ECDF',
          timber: '#14100E',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['Roboto Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        telemetry: ['Roboto Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        ledger: ['Roboto Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
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
