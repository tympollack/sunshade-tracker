import React from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { SunShadeLogo } from '@/components/SunShadeLogo';

export function DocsHeader() {
  return (
    <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <SunShadeLogo
            variant="horizontal"
            size="sm"
            showBadge
            badgeText="Docs"
            href="/"
            hideTextOnMobile
          />
          <nav className="hidden md:flex items-center space-x-5 text-xs font-medium text-slate-400">
            <a href="#overview" className="hover:text-orange-400 transition-colors">Overview</a>
            <a href="#workspaces-projects" className="hover:text-orange-400 transition-colors">Workspaces</a>
            <a href="#kanban-hierarchy" className="hover:text-orange-400 transition-colors">Boards & Tree</a>
            <a href="#automated-ingestion" className="hover:text-orange-400 transition-colors">Ingestion</a>
            <a href="#quick-reference" className="hover:text-orange-400 transition-colors">Quick Reference</a>
          </nav>
        </div>

        <div className="flex items-center space-x-3 text-xs font-medium">
          <Link
            href="/"
            className="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900 transition-colors"
          >
            Home
          </Link>
          <Link
            href="/workspaces"
            className="hidden sm:inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-900 transition-colors"
          >
            <span>Workspaces</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-500" />
          </Link>
          <Link
            href="/login"
            className="px-3.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold transition-all shadow-md shadow-orange-950/50"
          >
            Sign In
          </Link>
        </div>
      </div>
    </header>
  );
}
