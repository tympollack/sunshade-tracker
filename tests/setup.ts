import '@testing-library/jest-dom';
import { vi } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-supabase-tracker.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-12345';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-12345';
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
// Polyfill PointerEvent for jsdom if missing
if (typeof window !== 'undefined' && !window.PointerEvent) {
  window.PointerEvent = window.MouseEvent as any;
}

// Fallback fetch handler for relative API paths in jsdom/node test environments
if (typeof globalThis.fetch === 'function') {
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = vi.fn().mockImplementation(async (input: any, init?: any) => {
    const urlStr = typeof input === 'string' ? input : input?.url || '';
    if (urlStr.startsWith('/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ item: {} }),
        text: async () => JSON.stringify({ item: {} }),
      };
    }
    return nativeFetch(input, init);
  });
}
