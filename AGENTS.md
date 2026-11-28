# Agent Guide — SunShade Tracker

See `.antigravityrules` for architecture directives.

## Definition of Done (before moving any item to `in_review`)

- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] `npm run dod:ui` passes against a local production server

### `npm run dod:ui`

Playwright + axe-core UI audit (`scripts/dod-ui-check.mjs`). Start the app first (when running
locally without Hub SSO or `.env.local`, set `NEXT_PUBLIC_BYPASS_AUTH=true` and `NEXT_PUBLIC_APP_URL`
alongside your Supabase env vars so `/login` renders locally instead of redirecting to Hub):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key \
NEXT_PUBLIC_APP_URL=http://localhost:3000 \
NEXT_PUBLIC_BYPASS_AUTH=true \
npm run build
npx next start -p 3000
npm run dod:ui
```

It audits `/` and `/login` (plus `/[tenantSlug]/[projectSlug]` when `UI_AUDIT_STORAGE_STATE`,
`UI_AUDIT_TENANT_SLUG` and `UI_AUDIT_PROJECT_SLUG` are set, verifying HTTP 2xx, no unexpected
redirects to `/login` or Hub, and `[data-testid="workspace-shell"]` readiness) at mobile
(`375x667`) and desktop (`1280x800`), and fails on:

- axe-core `wcag2a`/`wcag2aa` violations of `serious` or `critical` impact (including `color-contrast`)
- horizontal overflow, or visible controls clipped outside the viewport (excluding controls inside horizontally scrollable containers)
- mobile (< 768px) tap targets under 32x32px, or overlapping sibling controls
- visible `<img>` elements that failed to load

`UI_AUDIT_BASE_URL` overrides the default `http://localhost:3000`. CI runs this on PRs via `.github/workflows/ui-audit.yml`.
