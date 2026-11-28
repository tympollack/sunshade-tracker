#!/usr/bin/env node
/**
 * dod:ui — Playwright + axe-core UI Definition-of-Done audit.
 *
 * Env:
 *   UI_AUDIT_BASE_URL       Base URL (default http://localhost:3000)
 *   UI_AUDIT_STORAGE_STATE  Optional Playwright storage state JSON for authenticated routes
 *   UI_AUDIT_TENANT_SLUG / UI_AUDIT_PROJECT_SLUG  Authenticated route /[tenant]/[project]
 */
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync } from 'node:fs';

const BASE_URL = process.env.UI_AUDIT_BASE_URL || 'http://localhost:3000';
const STORAGE_STATE = process.env.UI_AUDIT_STORAGE_STATE;
const TENANT = process.env.UI_AUDIT_TENANT_SLUG;
const PROJECT = process.env.UI_AUDIT_PROJECT_SLUG;

const VIEWPORTS = {
  mobile: { width: 375, height: 667 },
  desktop: { width: 1280, height: 800 },
};

const routes = [
  { path: '/', auth: false },
  { path: '/login', auth: false },
];
if (STORAGE_STATE) {
  if (!existsSync(STORAGE_STATE)) {
    console.error(`UI_AUDIT_STORAGE_STATE not found: ${STORAGE_STATE}`);
    process.exit(1);
  }
  if (TENANT && PROJECT) {
    routes.push({
      path: `/${TENANT}/${PROJECT}`,
      auth: true,
      waitForSelector: '[data-testid="workspace-shell"]',
    });
  } else {
    console.warn('[dod:ui] storage state set but UI_AUDIT_TENANT_SLUG/PROJECT_SLUG missing; skipping authenticated route');
  }
}

const normalizePath = (p) => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p);

/** Runs inside the page. */
function domChecks() {
  const vw = window.innerWidth;
  const problems = [];
  if (document.documentElement.scrollWidth > vw + 1) {
    problems.push(`horizontal overflow: scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);
  }
  const sel = 'button, a, [role="button"], input, select';
  const visible = [...document.querySelectorAll(sel)].filter((el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  });
  const name = (el) =>
    `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}[${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}]`;
  const isInsideHorizontalScroller = (el) => {
    let cur = el.parentElement;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      const cs = getComputedStyle(cur);
      if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && cur.scrollWidth > cur.clientWidth + 1) {
        const cr = cur.getBoundingClientRect();
        if (cr.left >= -1 && cr.right <= vw + 1) return true;
      }
      cur = cur.parentElement;
    }
    return false;
  };
  for (const el of visible) {
    const r = el.getBoundingClientRect();
    if ((r.left < -1 || r.right > vw + 1) && !isInsideHorizontalScroller(el)) {
      problems.push(`clipped control: ${name(el)} (${Math.round(r.left)}..${Math.round(r.right)})`);
    }
  }
  if (vw < 768) {
    const rects = visible.map((el) => ({ el, r: el.getBoundingClientRect() }));
    for (const { el, r } of rects) {
      // Inline text links inside prose are exempt from size requirement
      const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
      if (!inline && (r.width < 32 - 0.5 || r.height < 32 - 0.5)) {
        problems.push(`small tap target: ${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ox > 1 && oy > 1) problems.push(`overlapping controls: ${name(a.el)} / ${name(b.el)}`);
      }
    }
  }
  for (const img of document.querySelectorAll('img')) {
    const r = img.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && !(img.complete && img.naturalWidth > 0)) {
      problems.push(`broken image: ${img.currentSrc || img.src}`);
    }
  }
  return problems;
}

const browser = await chromium.launch();
let failures = 0;

for (const route of routes) {
  for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext({
      viewport,
      ...(route.auth ? { storageState: STORAGE_STATE } : {}),
    });
    const page = await context.newPage();
    const label = `${route.path} @ ${vpName} (${viewport.width}x${viewport.height})`;
    try {
      const targetUrl = new URL(route.path, BASE_URL);
      const response = await page.goto(targetUrl.toString(), { waitUntil: 'networkidle' });
      if (!response || !response.ok()) {
        throw new Error(`HTTP ${response ? response.status() : 'no response'} loading ${route.path}`);
      }
      const finalUrl = new URL(page.url());
      if (finalUrl.origin !== targetUrl.origin || normalizePath(finalUrl.pathname) !== normalizePath(targetUrl.pathname)) {
        throw new Error(`Unexpected redirect from ${route.path} to ${finalUrl.toString()}`);
      }
      if (route.waitForSelector) {
        await page.locator(route.waitForSelector).first().waitFor({ state: 'visible', timeout: 15000 });
      }
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const blocking = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      const dom = await page.evaluate(domChecks);
      if (blocking.length === 0 && dom.length === 0) {
        console.log(`PASS ${label}`);
      } else {
        failures++;
        console.error(`FAIL ${label}`);
        for (const v of blocking) {
          console.error(`  [axe:${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`);
          for (const n of v.nodes.slice(0, 3)) console.error(`      ${n.target.join(' ')}`);
        }
        for (const p of dom) console.error(`  [dom] ${p}`);
      }
    } catch (err) {
      failures++;
      console.error(`FAIL ${label}: ${err instanceof Error ? err.message : err}`);
    } finally {
      await context.close();
    }
  }
}

await browser.close();
if (failures > 0) {
  console.error(`\ndod:ui failed: ${failures} route/viewport combination(s) with violations.`);
  process.exit(1);
}
console.log('\ndod:ui passed.');
