import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SunShade Tracker | Multi-Tenant Dynamic Work Item Engine',
  description: 'Schemaless project management and headless agent ingestion utility for the SunShade digital ecosystem',
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
