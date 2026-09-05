import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getHubBaseUrl } from '@/lib/env';
import { headers } from 'next/headers';

/**
 * Sign out the current user.
 * Clears the Supabase session cookies and redirects to the Hub logout page,
 * which in turn clears the Hub SSO session and returns to Hub's sign-in page.
 */
export async function GET() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();

  const headersList = await headers();
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || '';
  const hubBase = getHubBaseUrl(host);

  // Redirect to Hub's logout endpoint so the SSO session is also cleared
  return NextResponse.redirect(`${hubBase}/logout`);
}
