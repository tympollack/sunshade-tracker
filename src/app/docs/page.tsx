import React from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Layers,
  Kanban,
  Zap,
  FolderTree,
  Calendar,
  Terminal,
  Shield,
  CheckCircle2,
  ArrowRight,
  ArrowUpRight,
  Sparkles,
  ChevronRight,
  FileCode,
  Hash,
  Database,
} from 'lucide-react';
import { SunShadeLogo } from '@/components/SunShadeLogo';

export const metadata = {
  title: 'Documentation | SunShade Tracker',
  description: 'Learn how to organize initiatives, navigate boards, track sprints, and ingest tasks with SunShade Tracker.',
};

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-orange-500/30 selection:text-orange-200">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <SunShadeLogo
              variant="horizontal"
              size="sm"
              showBadge
              badgeText="Docs"
              href="/"
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

      {/* Main Documentation Body */}
      <div className="max-w-7xl mx-auto px-6 py-12 w-full flex-1 grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Sticky Sidebar Navigation (Desktop) */}
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

        {/* Content Area */}
        <main className="lg:col-span-9 space-y-16">
          {/* Header Introduction */}
          <div className="space-y-4 border-b border-slate-800/80 pb-8">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-xs text-orange-300 font-mono">
              <span>Peplink Documentation Standard</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              SunShade Tracker User Guide
            </h1>
            <p className="text-base text-slate-400 leading-relaxed max-w-3xl">
              Simple, flexible project tracking. Learn how to organize initiatives, plan sprints, prioritize tasks with your team, and ingest tickets automatically from external tools.
            </p>
          </div>

          {/* Section 1: Overview */}
          <section id="overview" className="space-y-5 scroll-mt-24">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
                <BookOpen className="w-4 h-4" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">1. Overview</h2>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              SunShade Tracker is a real-time project management service. It helps teams organize deliverables, collaborate with partners, and maintain visibility into ongoing initiatives without manual status spreadsheets.
            </p>

            <div className="grid sm:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-400 font-mono">
                  Real-Time Updates
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Card movements, priority changes, and status shifts update instantly across your team without page refreshes.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-400 font-mono">
                  Custom Schemas
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Define custom statuses, tags, and hierarchy levels per project. Change workflows any time without database lockouts.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-orange-400 font-mono">
                  Automated Ingestion
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Automated bots, AI agents, and code review tools can push tasks directly into boards via secure API endpoints.
                </p>
              </div>
            </div>
          </section>

          {/* Section 2: Workspaces & Projects */}
          <section id="workspaces-projects" className="space-y-5 scroll-mt-24 border-t border-slate-800/80 pt-10">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
                <Layers className="w-4 h-4" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">2. Workspaces and Projects</h2>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              Work in SunShade Tracker is organized into two primary layers: Workspaces and Projects.
            </p>

            <div className="space-y-4 text-xs text-slate-300">
              <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2">
                <h3 className="text-sm font-semibold text-white">Workspaces</h3>
                <p className="text-slate-400 leading-relaxed">
                  A workspace is the root organization container for your team. Each workspace holds a dedicated set of team members, project boards, and API credentials.
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-400 pt-1">
                  <li><strong>Workspace Slug:</strong> Identifies your team URL (for example: <code className="text-orange-300 font-mono bg-slate-800 px-1 py-0.5 rounded">/pym-energy</code>).</li>
                  <li><strong>API Key:</strong> Bearer token used by automated tools to ingest tasks.</li>
                  <li><strong>Public Demo:</strong> The <code className="text-orange-300 font-mono bg-slate-800 px-1 py-0.5 rounded">/sunshade/portfolio</code> workspace allows public read-only guest inspection.</li>
                </ul>
              </div>

              <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-2">
                <h3 className="text-sm font-semibold text-white">Projects</h3>
                <p className="text-slate-400 leading-relaxed">
                  Projects represent distinct initiatives, repositories, or work streams within a workspace.
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-400 pt-1">
                  <li><strong>Project Reference Prefix:</strong> Every task receives a sequential ID (such as <code className="text-orange-300 font-mono bg-slate-800 px-1 py-0.5 rounded">TRK-01</code> or <code className="text-orange-300 font-mono bg-slate-800 px-1 py-0.5 rounded">ST-14</code>).</li>
                  <li><strong>Project Settings:</strong> Customize statuses, hierarchy types, sprint cycles, and custom metadata fields in the Project Settings panel.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 3: Kanban, Hierarchy & Sprints */}
          <section id="kanban-hierarchy" className="space-y-5 scroll-mt-24 border-t border-slate-800/80 pt-10">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
                <Kanban className="w-4 h-4" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">3. Kanban, Hierarchy, and Sprint Planning</h2>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              Every project provides three complementary views to inspect and organize work items.
            </p>

            <div className="grid md:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-2">
                <div className="flex items-center space-x-2 text-white font-semibold text-sm">
                  <Kanban className="w-4 h-4 text-orange-400" />
                  <span>Kanban Board</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Visual columns showing active items by status. Drag cards to update statuses or drop them between cards to reorder priorities instantly.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-2">
                <div className="flex items-center space-x-2 text-white font-semibold text-sm">
                  <FolderTree className="w-4 h-4 text-orange-400" />
                  <span>Hierarchy Tree</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Nested outline of parent-child relationships. Epics contain Stories, which contain Tasks. Subtrees automatically roll up story points and child item counts.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-2">
                <div className="flex items-center space-x-2 text-white font-semibold text-sm">
                  <Calendar className="w-4 h-4 text-orange-400" />
                  <span>Sprint Planning</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Quarterly and bi-weekly sprint buckets. Allocate backlog items to active sprints, track completion percentage, and balance point capacity.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/30 border border-slate-800 text-xs text-slate-400 leading-relaxed">
              <strong className="text-white block mb-1">Cascade Behavior:</strong>
              When reassigning a story to another project or sprint, all child tasks automatically follow the parent. This prevents tasks from being orphaned across different sprints or initiatives.
            </div>
          </section>

          {/* Section 4: Automated Ingestion */}
          <section id="automated-ingestion" className="space-y-5 scroll-mt-24 border-t border-slate-800/80 pt-10">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
                <Zap className="w-4 h-4" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">4. Automated Task Ingestion</h2>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              External tools, AI review bots, and CI/CD pipelines can programmatically create and nest work items without direct database access.
            </p>

            <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg">
              <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-orange-400" />
                  <span className="font-mono text-xs text-slate-200">HTTP Ingest Request</span>
                </div>
                <span className="text-[11px] font-mono text-orange-400">POST /api/v1/items/ingest</span>
              </div>

              <pre className="p-4 text-xs font-mono text-emerald-300 overflow-x-auto leading-relaxed bg-slate-950">
{`POST https://track.sunshade.icu/api/v1/items/ingest
Authorization: Bearer <YOUR_TENANT_API_KEY>
Content-Type: application/json

{
  "project_slug": "sunshade-tracker",
  "items": [
    {
      "external_ref_id": "STORY-01",
      "title": "Build Authentication Flow",
      "description": "Implement passkey and OAuth logins.",
      "item_type": "story",
      "status": "todo",
      "metadata": {
        "story_points": 5,
        "priority": "High"
      }
    },
    {
      "parent_ref_id": "STORY-01",
      "title": "Configure OAuth Redirect URIs",
      "item_type": "task",
      "status": "todo",
      "metadata": {
        "story_points": 2
      }
    }
  ]
}`}
              </pre>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              When an item provides a <code className="text-orange-300 font-mono bg-slate-800 px-1 py-0.5 rounded">parent_ref_id</code>, the server resolves the parent item automatically, establishing parent-child hierarchy in a single request.
            </p>
          </section>

          {/* Section 5: Quick Reference */}
          <section id="quick-reference" className="space-y-6 scroll-mt-24 border-t border-slate-800/80 pt-10">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
                <FileCode className="w-4 h-4" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">5. Quick Reference</h2>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              Standard status states and hierarchy types used across SunShade Tracker.
            </p>

            {/* Statuses Table */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-white">Default Work Item Statuses</h3>
              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 font-mono uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4">Status ID</th>
                      <th className="py-2.5 px-4">Label</th>
                      <th className="py-2.5 px-4">Description</th>
                      <th className="py-2.5 px-4">Next Step</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    <tr className="hover:bg-slate-900/30">
                      <td className="py-2.5 px-4 text-slate-400">backlog</td>
                      <td className="py-2.5 px-4 text-slate-200">Backlog</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">Unassigned task waiting for sprint prioritization.</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">Allocate to sprint.</td>
                    </tr>
                    <tr className="hover:bg-slate-900/30">
                      <td className="py-2.5 px-4 text-slate-400">todo</td>
                      <td className="py-2.5 px-4 text-slate-200">To Do</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">Prioritized work ready for execution.</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">Assign team member.</td>
                    </tr>
                    <tr className="hover:bg-slate-900/30">
                      <td className="py-2.5 px-4 text-sky-400">in_progress</td>
                      <td className="py-2.5 px-4 text-sky-300">In Progress</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">Active implementation currently in flight.</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">Submit code review.</td>
                    </tr>
                    <tr className="hover:bg-slate-900/30">
                      <td className="py-2.5 px-4 text-amber-400">in_review</td>
                      <td className="py-2.5 px-4 text-amber-300">In Review</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">Pull request or work item under team or QA review.</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">Approve & verify.</td>
                    </tr>
                    <tr className="hover:bg-slate-900/30">
                      <td className="py-2.5 px-4 text-emerald-400">done</td>
                      <td className="py-2.5 px-4 text-emerald-300">Done</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">Delivered, verified, and merged into staging or production.</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">Complete.</td>
                    </tr>
                    <tr className="hover:bg-slate-900/30">
                      <td className="py-2.5 px-4 text-rose-400">blocked</td>
                      <td className="py-2.5 px-4 text-rose-300">Blocked</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">Work paused due to dependencies or external blockers.</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">Resolve blocker.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Hierarchy Table */}
            <div className="space-y-2 pt-2">
              <h3 className="text-sm font-semibold text-white">Default Hierarchy Levels</h3>
              <div className="rounded-xl border border-slate-800 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 font-mono uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4">Level</th>
                      <th className="py-2.5 px-4">Type</th>
                      <th className="py-2.5 px-4">Allowed Parents</th>
                      <th className="py-2.5 px-4">Intended Scope</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    <tr className="hover:bg-slate-900/30">
                      <td className="py-2.5 px-4 text-purple-300">Level 1</td>
                      <td className="py-2.5 px-4 text-white font-semibold">Epic</td>
                      <td className="py-2.5 px-4 text-slate-500">None (Root)</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">Broad initiatives or multi-week milestones.</td>
                    </tr>
                    <tr className="hover:bg-slate-900/30">
                      <td className="py-2.5 px-4 text-blue-300">Level 2</td>
                      <td className="py-2.5 px-4 text-white font-semibold">Story</td>
                      <td className="py-2.5 px-4 text-purple-400">Epic</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">Concrete user story or feature deliverable.</td>
                    </tr>
                    <tr className="hover:bg-slate-900/30">
                      <td className="py-2.5 px-4 text-emerald-300">Level 3</td>
                      <td className="py-2.5 px-4 text-white font-semibold">Task</td>
                      <td className="py-2.5 px-4 text-blue-400">Story, Epic</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">Individual engineering ticket or action item.</td>
                    </tr>
                    <tr className="hover:bg-slate-900/30">
                      <td className="py-2.5 px-4 text-rose-300">Any</td>
                      <td className="py-2.5 px-4 text-white font-semibold">Bug</td>
                      <td className="py-2.5 px-4 text-slate-400">Story, Epic, Task</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">Defect report or regression.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* Footer */}
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
    </div>
  );
}
