# Agent Guide — SunShade Tracker

See `.antigravityrules` for architecture directives.

Read `docs/architecture.mdx` before changing API, auth, data, webhook, or schema-adjacent code.

Read `docs/setup.mdx` before changing setup or verification instructions.

## Repository non-negotiables

### Git and review flow

- Target pull requests at `staging` unless a maintainer explicitly approves another target.
- Do not commit secrets, tokens, workspace API keys, or real customer data.
- Do not use fake runtime data, fake metrics, or invented production URLs.
- Use verified SunShade hostnames: `track.sunshade.icu`, `track-stag.sunshade.icu`, `hub.sunshade.icu`, and `hub-stag.sunshade.icu`.
- Use workspace-relative POSIX paths in documentation. Never hardcode local operating system paths.
- Placeholder Supabase values are allowed only for zero-secret local build, test, and public-page smoke-test instructions.

### Schema and data ownership

- Database migrations belong only in `sunshade-db-platform/supabase/migrations`.
- Do not add `supabase/migrations` or new migration files to this repository.
- `scripts/make-managed-sprints.sql` is an operator script, not migration authority.
- Core application data lives in the Supabase `tracker` schema.
- Treat `public` schema efficiency, token, artifact, and patronage objects as cross-schema integration surfaces. Do not mutate them outside the existing service paths.
- Dynamic workflow taxonomy belongs in `tracker.projects.settings`. Do not hardcode project-specific statuses, hierarchy types, or custom taxonomy into core interfaces.
- Preserve soft-delete filtering for tenants, projects, and work items unless a route intentionally handles archived records.
- Check the returned `{ error }` object from every Supabase call before using returned data. If a compatibility fallback intentionally tolerates an error, document that fallback in nearby code and preserve a safe failure mode.

### Auth, tenancy, and secrets

- `SUPABASE_SERVICE_ROLE_KEY` is server-only. Never expose it to client components, browser bundles, logs, docs, or tests.
- Do not import `src/lib/supabase-server.ts` or other server-only modules from client components.
- Supabase auth cookies use `SameSite=lax`, secure mode in production outside local development, and `Domain=.sunshade.icu` only on `sunshade.icu` or its subdomains.
- Do not weaken Hub SSO callback validation or `next` path sanitization.
- Resolve workspace access through the authenticated session or API key. Never trust `x-tenant-slug` or `tenant_slug` as proof of membership.
- Viewer roles and public demo guests are read-only.
- Workspace API keys are machine credentials. Protect key generation, regeneration, hashing, and one-time display behavior.
- This repository does not currently implement an application-level authentication rate limiter. Do not claim one exists without adding verified implementation and tests.

### Webhooks and automation

- Inbound webhooks must verify tenant or platform secrets with HMAC SHA-256 and constant-time comparison unless the route explicitly documents another approved credential mode.
- Tenant-specific webhook secrets take precedence over platform fallback secrets for protected workspaces.
- Outbound automation webhooks must keep SSRF protections, blocked private networks, manual redirect handling, and the 5000 ms timeout.
- Do not enable `ALLOW_LOCAL_WEBHOOKS` or unsigned webhook behavior in production.
- Do not weaken sanitization or cross-tenant scoping in webhook handlers.

## Definition of Done

Before moving any item to `in_review`:

- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm test` passes
- [ ] `npm run build` succeeds

For documentation-only changes, runtime verification can confirm regression risk but is not a substitute for validating frontmatter, links, route names, environment variables, and restricted file scope.
