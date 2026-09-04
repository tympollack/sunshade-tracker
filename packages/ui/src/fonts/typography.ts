import { fontFamilies, typographyPresets } from '../tokens/typography';

/**
 * Standard typography utilities and mappings for @sunshade/ui.
 */
export const fonts = {
  humanUI: fontFamilies.sans,
  systemLedger: fontFamilies.mono,
  nodeTelemetry: fontFamilies.mono,
};

export const typography = typographyPresets;

export const fontClassNames = {
  sans: 'font-sans',
  mono: 'font-mono',
  display: 'font-sans',
  telemetry: 'font-mono tracking-wider',
  ledger: 'font-mono tracking-wide',
};
