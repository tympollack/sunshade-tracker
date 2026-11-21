import {
  DEFAULT_LOCALE,
  EN_MESSAGES,
  MESSAGE_CATALOGS,
  type MessageCatalog,
  type TranslationKey,
} from './messages';

export { DEFAULT_LOCALE, EN_MESSAGES, MESSAGE_CATALOGS };
export type { MessageCatalog, TranslationKey };

const INTL_LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  es: 'es-ES',
};

/**
 * Resolves a BCP-47 locale or Accept-Language header into a supported catalog locale,
 * preserving regional subtags for Intl formatting while falling back to DEFAULT_LOCALE.
 */
export function resolveLocale(input?: string | null): string {
  if (!input || typeof input !== 'string') {
    return DEFAULT_LOCALE;
  }
  const candidates = input.split(',');
  for (const candidate of candidates) {
    const rawTag = candidate.split(';')[0]?.trim();
    if (!rawTag) continue;
    const normalized = rawTag.replace(/_/g, '-');
    const baseLang = normalized.split('-')[0].toLowerCase();
    if (MESSAGE_CATALOGS[normalized.toLowerCase()]) {
      return normalized.toLowerCase();
    }
    if (MESSAGE_CATALOGS[baseLang]) {
      return normalized;
    }
  }
  return DEFAULT_LOCALE;
}

function getCatalogForLocale(locale?: string | null): Partial<MessageCatalog> {
  const resolved = resolveLocale(locale);
  const lower = resolved.toLowerCase();
  if (MESSAGE_CATALOGS[lower]) {
    return MESSAGE_CATALOGS[lower];
  }
  const baseLang = lower.split('-')[0];
  return MESSAGE_CATALOGS[baseLang] || EN_MESSAGES;
}

/**
 * Registers or overrides translation strings for a given locale at runtime.
 */
export function registerTranslations(
  locale: string,
  overrides: Partial<MessageCatalog>
): void {
  const key = locale.trim().toLowerCase();
  if (!key) return;
  MESSAGE_CATALOGS[key] = {
    ...(MESSAGE_CATALOGS[key] || {}),
    ...overrides,
  };
}

/**
 * Translates a message key with `{param}` interpolation and locale fallback to English.
 */
export function t(
  key: TranslationKey,
  params?: Record<string, string | number>,
  locale?: string | null
): string {
  const catalog = getCatalogForLocale(locale);
  const template = catalog[key] ?? EN_MESSAGES[key] ?? key;
  if (!params) return template;

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, token) => {
    const val = params[token];
    return val === undefined || val === null ? '' : String(val);
  });
}

/**
 * Formats numbers using Intl.NumberFormat with deterministic locale fallback.
 */
export function formatNumber(
  value: number,
  locale?: string | null,
  options?: Intl.NumberFormatOptions
): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  const resolved = resolveLocale(locale);
  const intlLocale = INTL_LOCALE_MAP[resolved.toLowerCase()] || resolved;
  return new Intl.NumberFormat(intlLocale, options).format(safeValue);
}
