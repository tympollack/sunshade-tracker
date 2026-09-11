import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase-server';
import { resolvePostAuthDestination } from '@/lib/auth';

/**
 * Intelligent workspace destination handler:
 * - Authenticated users are routed to their active workspace & project.
 * - Unauthenticated users are directed to the public demo workspace (/sunshade/portfolio).
 */
export default async function WorkspacesPage() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const destination = await resolvePostAuthDestination(user.id);
      redirect(destination.pathname);
    }
  } catch (err: any) {
    // If redirect() was called, re-throw Next.js navigation error
    if (err?.digest?.startsWith?.('NEXT_REDIRECT')) {
      throw err;
    }
  }

  // Guest / unauthenticated fallback to public demo workspace
  redirect('/sunshade/portfolio');
}
