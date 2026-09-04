# ⛱️ SunShade Tracker (`sunshade-tracker`)

> **Multi-tenant, schemaless Project Tracker utility service and headless AI ingest pipeline for the SunShade Digital Ecosystem.**

---

## 🌟 Architectural Overview

SunShade Tracker is designed to provide project management, polymorphic work item tracking, dynamic hierarchy validation, and headless programmatic ingestion for automated AI pipelines (such as Gemini Spark) across all SunShade applications (`hub`, `cozy`, `patchwork`, etc.).

### Key Design Tenets
- **Schemaless & Polymorphic (No Rigid DB ENUMs)**: All item types, column statuses, hierarchy levels, and metadata keys are stored as flexible `text` and validated dynamically against JSON schemas defined in `tracker.projects.settings`.
- **Headless AI Ingestion (`POST /api/v1/items/ingest`)**: Autonomous agents can programmatically create, nest, and update work items using `external_ref_id` and `parent_ref_id` without direct database access.
- **Tenant Isolation & Security**: Workspaces and projects are isolated using multi-tenant schemas, API keys (`tk_live_...`), and PostgreSQL Row Level Security (RLS).
- **Fractional Indexing**: Midpoint floating-point calculations allow items to be reordered without cascading table locks.

---

## 🏗️ Repository Layout

```
sunshade-tracker/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── health/route.ts                # Serverless health endpoint
│   │   │   └── v1/
│   │   │       ├── items/
│   │   │       │   ├── ingest/route.ts        # Headless ingest endpoint (Gemini Spark)
│   │   │       │   └── route.ts               # Work item CRUD, board & tree views
│   │   │       └── projects/
│   │   │           ├── route.ts               # Projects list & creation
│   │   │           └── [projectId]/
│   │   │               ├── route.ts           # Project get/update
│   │   │               └── settings/route.ts  # Export/Import JSON Schema
│   │   ├── (auth)/login/page.tsx              # Workspace login & API key entry
│   │   ├── (dashboard)/[tenantSlug]/[projectSlug]/page.tsx # Interactive Tracker UI
│   │   ├── layout.tsx
│   │   ├── page.tsx                           # Landing page & API spec
│   │   └── globals.css
│   ├── lib/
│   │   ├── db.ts                              # Supabase Admin / Service Role client
│   │   ├── auth-guard.ts                      # API Key / Tenant validator
│   │   └── fractional-index.ts                # Midpoint calculation math
│   └── types/
│       └── tracker.ts                         # Schemaless JSON and DB types
├── .env.example
├── tsconfig.json
├── package.json
└── README.md
```

---

## 🤖 Gemini Spark Ingestion Specification

External LLMs and autonomous agents ingest tasks without querying the database directly.

### Request Endpoint
`POST https://track.sunshade.icu/api/v1/items/ingest` (or `http://localhost:3000/api/v1/items/ingest`)

### Headers
```http
Authorization: Bearer tk_live_sunshade_master_key
Content-Type: application/json
```

### Ingestion Payload Schema
```json
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
}
```

### Ingest Behavior
1. **Dynamic Defaults**: If `item_type` or `status` are omitted, the endpoint defaults to the project's default type (`task`) and first status (`not_started`).
2. **Parent Resolution**: `parent_ref_id` is automatically resolved to the parent work item's UUID, even if created in the exact same batch.
3. **Upsert Semantics**: If an item provides an `external_ref_id`, subsequent calls will update the existing work item instead of creating duplicates (`ON CONFLICT (project_id, external_ref_id)`).
4. **Order Indexing**: New items automatically receive sequential fractional order indexes (`last_order + 1000.0`).

---

## 🗄️ Database Migration (`sunshade-db-platform`)

The schema migration is located in `sunshade-db-platform/supabase/migrations/20260904000002_create_tracker_multitenant_schema.sql`.

### Core Tables
1. **`tracker.tenants`**: Multi-tenant workspaces with generated API keys (`tk_live_...`).
2. **`tracker.projects`**: Projects configured with dynamic `settings` JSONB schema.
3. **`tracker.work_items`**: Polymorphic items referencing `project_id`, optional `parent_id`, and `external_ref_id`.

---

## 🚀 Quickstart & Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Populate:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

### 3. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the landing page and dashboard.

---

## 📡 REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Serverless health check |
| `POST` | `/api/v1/items/ingest` | Headless AI ingest & upsert pipeline |
| `GET` | `/api/v1/items` | List items (`?format=flat\|tree\|board`) |
| `POST` | `/api/v1/items` | Create single work item |
| `PATCH` | `/api/v1/items` | Update or reorder item |
| `GET` | `/api/v1/projects` | List tenant projects |
| `POST` | `/api/v1/projects` | Create new project |
| `GET` | `/api/v1/projects/:projectId/settings` | Export project JSON Schema |
| `PUT` | `/api/v1/projects/:projectId/settings` | Update dynamic schema rules |
