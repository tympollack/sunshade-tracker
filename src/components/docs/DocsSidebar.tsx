import React from 'react';
import Link from 'next/link';
import { BookOpen, Layers, Kanban, Zap, FileCode, Sparkles, ChevronRight } from 'lucide-react';

export function DocsSidebar() {
  return (
    <aside className="hidden lg:block lg:col-span-3">
      <div className="sticky top-24 space-y-6">
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-orange-400 font-mono">
            Documentation Menu
          </span>
          <nav className="space-y-1 text-xs">
            <a
              href="#overview"
              className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5 text-orange-400" />
              <span>1. Platform Overview</span>
            </a>
            <a
              href="#workspaces-projects"
              className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <Layers className="w-3.5 h-3.5 text-orange-400" />
              <span>2. Workspaces & Projects</span>
            </a>
            <a
              href="#kanban-hierarchy"
              className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <Kanban className="w-3.5 h-3.5 text-orange-400" />
              <span>3. Boards, Tree & Sprints</span>
            </a>
            <a
              href="#automated-ingestion"
              className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-orange-400" />
              <span>4. Automated Ingestion</span>
            </a>
            <a
              href="#quick-reference"
              className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <FileCode className="w-3.5 h-3.5 text-orange-400" />
              <span>5. Quick Reference</span>
            </a>
          </nav>
        </div>

        <div className="p-4 rounded-xl bg-orange-950/20 border border-orange-500/20 space-y-2 text-xs">
          <span className="font-semibold text-orange-300 flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Public Demo</span>
          </span>
          <p className="text-slate-400 leading-relaxed text-[11px]">
            Explore a live public portfolio with pre-populated Epics, Stories, and Tasks.
          </p>
          <Link
            href="/sunshade/portfolio"
            className="inline-flex items-center space-x-1 text-orange-400 hover:text-orange-300 font-medium pt-1 text-xs transition-colors"
          >
            <span>Launch Demo Board</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </aside>
  );
}
