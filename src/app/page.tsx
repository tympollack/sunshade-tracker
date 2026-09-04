import Link from 'next/link';
import { Layers, Zap, Database, ShieldCheck, Terminal, Cpu, ArrowRight, GitFork, CheckCircle2 } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between">
      {/* Navigation */}
      <header className="border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold">
              ST
            </div>
            <span className="font-semibold tracking-tight text-white text-lg">
              SunShade <span className="text-emerald-400">Tracker</span>
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/50">
              v1.0 Live
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <Link
              href="/sunshade/portfolio"
              className="text-sm text-slate-300 hover:text-white transition-colors"
            >
              Demo Workspace
            </Link>
            <Link
              href="/login"
              className="text-sm px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-all shadow-lg shadow-emerald-950/50"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-16 w-full">
        <div className="text-center space-y-6 max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Headless Agent Ingestion for Gemini Spark & Autonomous Pipelines</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Dynamic, Schemaless Work Item Tracking for <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">SunShade</span>
          </h1>

          <p className="text-lg text-slate-400">
            Eliminating rigid database ENUMs in favor of dynamic per-project JSON schemas. Programmatic headless ingestion, polymorphic work items, and fractional indexing for modern collaborative tools.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <Link
              href="/sunshade/portfolio"
              className="inline-flex items-center space-x-2 px-6 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold transition-all shadow-lg shadow-emerald-500/20"
            >
              <span>Explore SunShade Board</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#api-spec"
              className="inline-flex items-center space-x-2 px-6 py-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-medium transition-all"
            >
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>Ingest API Spec</span>
            </a>
          </div>
        </div>

        {/* Core Pillars Grid */}
        <div className="grid md:grid-cols-3 gap-6 my-20">
          <div className="p-6 rounded-xl bg-slate-900/50 border border-slate-800/80 hover:border-slate-700 transition-all space-y-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-white">Schemaless Polymorphism</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              No rigid PostgreSQL ENUMs. Work item types, statuses, hierarchy levels, and metadata are validated against dynamic JSON schemas stored in project settings.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-slate-900/50 border border-slate-800/80 hover:border-slate-700 transition-all space-y-3">
            <div className="w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-white">Gemini Spark Ingest API</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Headless <code className="text-xs text-emerald-300 bg-slate-800 px-1 py-0.5 rounded">POST /api/v1/items/ingest</code> endpoint. External LLMs can programmatically create, nest, and upsert work items without direct DB access.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-slate-900/50 border border-slate-800/80 hover:border-slate-700 transition-all space-y-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <GitFork className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-white">Fractional Reordering</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Midpoint double precision ordering allows cards to be dropped and reordered anywhere in Kanban columns without cascading table updates or locks.
            </p>
          </div>
        </div>

        {/* API Specification Block */}
        <div id="api-spec" className="my-16 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-2xl">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span className="font-mono text-sm text-slate-200">Ingest API Specification</span>
            </div>
            <span className="text-xs text-emerald-400 font-mono">POST /api/v1/items/ingest</span>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-400">
              External pipelines authenticate with their tenant API key and pass batch payloads. Parents are resolved dynamically via <code className="text-emerald-300 bg-slate-800 px-1 py-0.5 rounded">parent_ref_id</code>:
            </p>
            <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto leading-relaxed">
{`// Headers:
// Authorization: Bearer tk_live_sunshade_master_key
// Content-Type: application/json

POST https://track.sunshade.icu/api/v1/items/ingest
{
  "project_slug": "portfolio",
  "items": [
    {
      "external_ref_id": "SPEC-HUB-11",
      "title": "Deploy Sovereign Event Bus to PatchWork",
      "description": "Auto-generate maintenance tasks from citizen reports.",
      "item_type": "story",
      "status": "in_progress",
      "assignee": "tympollack",
      "metadata": {
        "complexity": 3,
        "priority": "High",
        "origin_agent": "Gemini Spark"
      }
    },
    {
      "external_ref_id": "TASK-HUB-11-A",
      "parent_ref_id": "SPEC-HUB-11",
      "title": "Implement POST /api/events Webhook Route",
      "item_type": "task",
      "status": "planned",
      "metadata": {
        "complexity": 1
      }
    }
  ]
}`}
            </pre>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-8 bg-slate-950/40">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between text-xs text-slate-400 gap-4">
          <span>&copy; {new Date().getFullYear()} SunShade Digital Canopy. All rights reserved.</span>
          <div className="flex items-center space-x-6">
            <span>Schema: <strong className="text-slate-300 font-mono">tracker</strong></span>
            <span>Tenant 0: <strong className="text-emerald-400 font-mono">sunshade</strong></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
