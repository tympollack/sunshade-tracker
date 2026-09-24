import React from 'react';
import Link from 'next/link';

export function DocsFooter() {
  return (
    <footer className="border-t border-slate-800/80 py-8 bg-slate-950/60">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between text-xs text-slate-400 gap-4">
        <div className="flex items-center space-x-4">
          <span>&copy; {new Date().getFullYear()} SunShade Digital Canopy. All rights reserved.</span>
          <span className="text-slate-700">|</span>
          <Link href="/" className="hover:text-slate-200 transition-colors">
            Home
          </Link>
          <Link href="/workspaces" className="hover:text-slate-200 transition-colors">
            Workspaces
          </Link>
          <Link href="/sunshade/portfolio" className="hover:text-slate-200 transition-colors">
            Demo Workspace
          </Link>
        </div>
        <div className="flex items-center space-x-6">
          <span>Tone Standard: <strong className="text-orange-400 font-mono">Peplink</strong></span>
          <span>Platform: <strong className="text-emerald-400 font-mono">SunShade</strong></span>
        </div>
      </div>
    </footer>
  );
}
