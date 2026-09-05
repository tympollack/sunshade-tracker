/**
 * @deprecated Import from '@/lib/supabase-server' instead.
 * This file is kept for backward compatibility during migration.
 * Existing API routes that import supabaseAdmin from '@/lib/db' continue to work.
 */
export { createServiceClient, createServerClient } from '@/lib/supabase-server';

// Lazy singleton service client — only instantiated when first accessed at request time.
// Using a getter function pattern avoids the Proxy type mismatch and is simpler.
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('[tracker] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, {
    db: { schema: 'tracker' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// supabaseAdmin is a function call — this is called at request time inside route handlers,
// not at module load time, so no env vars are needed at build time.
// Each call creates a fresh client (cheap, stateless since persistSession: false).
export const supabaseAdmin = new Proxy<ReturnType<typeof getAdminClient>>(
  {} as ReturnType<typeof getAdminClient>,
  {
    get(_target, prop, receiver) {
      const client = getAdminClient();
      const value = (client as any)[prop];
      if (typeof value === 'function') {
        return value.bind(client);
      }
      return value;
    },
  }
);

export default supabaseAdmin;
