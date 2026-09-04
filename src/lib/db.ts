import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://placeholder-url.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'placeholder-service-key';

export const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceKey,
  {
    db: {
      schema: 'tracker',
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

export default supabaseAdmin;
