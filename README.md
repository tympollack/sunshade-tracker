# SunShade Tracker

SunShade Tracker is a multi-tenant project tracking service for the SunShade ecosystem.

Teams use it to plan work, manage dynamic project workflows, reorder priorities, track sprints, and review operational metrics.

Agents and CI systems use it to ingest work items, read execution context, and update implementation status without direct database access.

## Canonical documentation

The Fumadocs-ready source for the ecosystem documentation portal lives in `docs/`.

| Document | Purpose |
| --- | --- |
| [docs/index.mdx](docs/index.mdx) | Plain-language overview, hostnames, capabilities, and ecosystem relationships. |
| [docs/architecture.mdx](docs/architecture.mdx) | System boundaries, schema ownership, authentication, API contracts, and off-limits rules. |
| [docs/setup.mdx](docs/setup.mdx) | Local setup, zero-secret smoke testing, environment variables, and verification commands. |
| [AGENTS.md](AGENTS.md) | Contributor and AI-agent rules for this repository. |

The running application also exposes product help at `/docs`.

That in-app page is separate from the portable `docs/` directory used by the documentation portal.

## Hostnames

| Environment | Tracker URL | Hub URL |
| --- | --- | --- |
| Production | `https://track.sunshade.icu` | `https://hub.sunshade.icu` |
| Staging | `https://track-stag.sunshade.icu` | `https://hub-stag.sunshade.icu` |
| Local development | `http://localhost:3000` | Local bypass or staging Hub |

## Quickstart

Use Node.js 22 and npm.

```powershell
npm ci
Copy-Item .env.example .env.local -Force
npm run dev
```

Open `http://localhost:3000`.

The example environment uses placeholder Supabase values for zero-secret public-page smoke tests.

Replace those placeholders with real Supabase credentials before using sign-in, workspace mutations, or live API data.

See [docs/setup.mdx](docs/setup.mdx) for the full environment variable table and zero-secret smoke test.

## Verification

Run these commands before review:

```powershell
npx tsc --noEmit
npm test
npm run build
```

Target pull requests at `staging` unless a maintainer explicitly approves another target.

## API entry points

| Methods | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Service health check. |
| POST | `/api/v1/items/ingest` | Batch ingest and upsert work items from headless agents. |
| GET, POST, PATCH, DELETE | `/api/v1/items` | Work item reads and mutations. |
| GET | `/api/v1/items/[id]/context` | Agent execution context in JSON or Markdown. |
| GET, POST, DELETE | `/api/v1/projects` | Project list, creation, and soft deletion. |
| GET, PUT | `/api/v1/projects/[projectId]/settings` | Dynamic project schema settings. |
| GET, POST | `/api/v1/sprints` | Relational sprint list and creation. |
| GET | `/api/v1/telemetry/live` | Live in-flight telemetry with delta polling. |
| POST | `/api/v1/webhooks/ecosystem` | Signed PatchWork and Project Valerie event ingestion. |

The complete verified API surface is documented in [docs/architecture.mdx](docs/architecture.mdx).

## Repository boundaries

- Database migrations belong in `sunshade-db-platform`, not this repository.
- The application queries the Supabase `tracker` schema for core data.
- Dynamic statuses, hierarchy levels, fields, automations, and templates live in `tracker.projects.settings`.
- Server-only secrets must never enter browser code or git.
- Workspace viewers and public demo guests are read-only.
- Do not use fake runtime data in the application, tests, documentation, or examples.
