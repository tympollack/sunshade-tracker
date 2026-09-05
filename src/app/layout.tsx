import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://track.sunshade.icu'),
  title: 'SunShade Tracker | Multi-Tenant Dynamic Work Item Engine',
  description: 'Schemaless project management and headless agent ingestion utility for the SunShade digital ecosystem',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
  },
  manifest: '/site.webmanifest',
  openGraph: {
    title: 'SunShade Tracker',
    description: 'Dynamic work item engine and headless agent ingestion for the SunShade digital ecosystem',
    url: 'https://track.sunshade.icu',
    siteName: 'SunShade Tracker',
    images: [
      {
        url: '/logo.png',
        width: 680,
        height: 160,
        alt: 'SunShade Tracker Logo',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#090d16] text-slate-100 antialiased selection:bg-emerald-500/30 selection:text-emerald-300">
        {children}
      </body>
    </html>
  );
}
