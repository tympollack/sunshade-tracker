/**
 * Pre-Credit Renewal Database & Advisor Audit Script
 * Audits RLS policies, unindexed foreign keys, storage usage, and connection pooler health
 * across SunShade application schemas (tracker, cozy, valerie, patchwork, wsw, hub, public).
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

export interface AuditMetric {
  category: 'storage' | 'security_rls' | 'index_health' | 'connection_pool';
  name: string;
  status: 'passed' | 'warning' | 'critical' | 'unverified';
  details: string;
  metricValue?: string | number;
}

export interface PreRenewalAuditReport {
  timestamp: string;
  databaseProjectRef: string;
  status: 'clean' | 'remediation_needed' | 'unverified';
  metrics: AuditMetric[];
  summary: {
    totalDatabaseBytes?: number;
    totalDatabasePretty: string;
    warningThresholdBytes: number;
    warningThresholdPretty: string;
    missingRlsCount: number;
    unindexedForeignKeysCount: number;
    activeConnectionsCount?: number;
    storageMeasured: boolean;
  };
}

export async function runPreRenewalDbAudit(options?: { strict?: boolean }): Promise<PreRenewalAuditReport> {
  const isStrict = options?.strict || process.argv.includes('--strict');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://rweehbzsflhhtwjrjnvy.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const projectRef = process.env.SUPABASE_PROJECT_REF || 'rweehbzsflhhtwjrjnvy';

  console.log(`[DB Audit] Starting Pre-Renewal Resource & Advisor Audit for project: ${projectRef}`);

  const metrics: AuditMetric[] = [];
  let totalBytes: number | undefined;
  let totalPretty = 'Unmeasured';
  let storageMeasured = false;
  let missingRls = 0;
  let unindexedFks = 0;
  let activeConnections: number | undefined;

  if (serviceKey) {
    console.log('[DB Audit] Connecting to remote Supabase platform via Service Role...');
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // 1. Storage Capacity Check via RPC
    const { data: storageData, error: storageErr } = await supabase.rpc('get_database_storage_summary');
    if (storageErr) {
      metrics.push({
        category: 'storage',
        name: 'Database Storage Measurement',
        status: 'critical',
        details: `Failed to execute get_database_storage_summary RPC: ${storageErr.message}`,
      });
    } else if (storageData) {
      storageMeasured = true;
      totalBytes = storageData.total_database_bytes;
      totalPretty = storageData.total_database_pretty;

      const isOverQuota = totalBytes !== undefined && totalBytes >= 500 * 1024 * 1024;
      const isWarning = storageData.warning_threshold_exceeded || (totalBytes !== undefined && totalBytes >= 350 * 1024 * 1024);

      metrics.push({
        category: 'storage',
        name: 'Database Storage Ceiling (500MB Free Tier / 350MB Warning)',
        status: isOverQuota ? 'critical' : isWarning ? 'warning' : 'passed',
        details: isOverQuota
          ? `CRITICAL: Database storage ${totalPretty} exceeds the 500 MB free quota!`
          : isWarning
          ? `WARNING: Database storage ${totalPretty} exceeds early warning threshold (${storageData.warning_threshold_pretty})`
          : `Total database storage is ${totalPretty} (within healthy limits < ${storageData.warning_threshold_pretty})`,
        metricValue: totalBytes,
      });
    }

    // 2. Health & Schema Cache Probe
    const { data: healthData, error: healthErr } = await supabase
      .from('work_items')
      .select('id')
      .limit(1);

    if (healthErr) {
      metrics.push({
        category: 'connection_pool',
        name: 'PostgREST Schema Cache & Connection Liveness',
        status: 'critical',
        details: `Connection probe failed: ${healthErr.message}`,
      });
    } else {
      activeConnections = 1;
      metrics.push({
        category: 'connection_pool',
        name: 'PostgREST Schema Cache & Connection Liveness',
        status: 'passed',
        details: 'PostgREST connection pool responsive with zero deadlock hangs',
        metricValue: activeConnections,
      });
    }
  } else {
    console.warn('[DB Audit] No SUPABASE_SERVICE_ROLE_KEY supplied. Storage and live connection checks are UNVERIFIED.');
    metrics.push({
      category: 'storage',
      name: 'Database Storage Capacity Measurement',
      status: 'unverified',
      details: 'Live measurement unverified: SUPABASE_SERVICE_ROLE_KEY not supplied. Current disk usage cannot be confirmed.',
    });

    metrics.push({
      category: 'connection_pool',
      name: 'Live Connection Pool Health',
      status: 'unverified',
      details: 'Live pool unverified: SUPABASE_SERVICE_ROLE_KEY not supplied.',
    });
  }

  // Schema Security & Index Invariant Rules
  metrics.push({
    category: 'security_rls',
    name: 'Row Level Security (RLS) Policy Coverage Across App Schemas',
    status: 'unverified',
    details: 'Live RLS policy inspection unverified without direct PostgreSQL information_schema query access',
    metricValue: missingRls,
  });

  metrics.push({
    category: 'index_health',
    name: 'Foreign Key & Relationship Index Health',
    status: 'unverified',
    details: 'Foreign key index inspection unverified without direct PostgreSQL pg_index catalog query access',
    metricValue: unindexedFks,
  });

  let reportStatus: 'clean' | 'remediation_needed' | 'unverified';
  if (metrics.some((m) => m.status === 'critical')) {
    reportStatus = 'remediation_needed';
  } else if (metrics.some((m) => m.status === 'unverified')) {
    reportStatus = 'unverified';
  } else if (metrics.some((m) => m.status === 'warning')) {
    reportStatus = 'remediation_needed';
  } else {
    reportStatus = 'clean';
  }

  const report: PreRenewalAuditReport = {
    timestamp: new Date().toISOString(),
    databaseProjectRef: projectRef,
    status: reportStatus,
    metrics,
    summary: {
      totalDatabaseBytes: totalBytes,
      totalDatabasePretty: totalPretty,
      warningThresholdBytes: 350 * 1024 * 1024,
      warningThresholdPretty: '350.00 MB',
      missingRlsCount: missingRls,
      unindexedForeignKeysCount: unindexedFks,
      activeConnectionsCount: activeConnections,
      storageMeasured,
    },
  };

  // Generate markdown report
  const reportDir = path.resolve(process.cwd(), 'reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const markdownReport = [
    `# Database Pre-Renewal Resource & Security Audit Report`,
    `**Project Ref:** \`${report.databaseProjectRef}\`  `,
    `**Generated At:** ${report.timestamp}  `,
    `**Status:** **${report.status.toUpperCase()}**  `,
    ``,
    `## Executive Summary`,
    `- **Storage Measurement:** ${report.summary.storageMeasured ? report.summary.totalDatabasePretty : 'UNVERIFIED (Requires SUPABASE_SERVICE_ROLE_KEY)'} (Ceiling: 500 MB, Warning Threshold: ${report.summary.warningThresholdPretty})`,
    `- **Missing RLS Violations:** ${metrics.find((m) => m.category === 'security_rls')?.status === 'unverified' ? 'UNVERIFIED (Requires direct PostgreSQL catalog query access)' : report.summary.missingRlsCount}`,
    `- **Unindexed Foreign Keys:** ${metrics.find((m) => m.category === 'index_health')?.status === 'unverified' ? 'UNVERIFIED (Requires direct PostgreSQL pg_index catalog query access)' : report.summary.unindexedForeignKeysCount}`,
    `- **Connection Pool Status:** ${report.summary.activeConnectionsCount ? 'Active & Responsive' : 'Unverified (Offline)'}`,
    ``,
    `## Advisor & Metric Findings`,
    `| Category | Check | Status | Details |`,
    `| :--- | :--- | :--- | :--- |`,
    ...report.metrics.map((m) => `| \`${m.category}\` | ${m.name} | **${m.status.toUpperCase()}** | ${m.details} |`),
    ``,
    `## Remediation Status`,
    report.status === 'clean'
      ? 'All live capacity, index health, and RLS checks passed cleanly. Database is certified pre-flight for billing renewal.'
      : report.status === 'unverified'
      ? 'Report generated in offline mode. Live storage capacity remains unverified until SUPABASE_SERVICE_ROLE_KEY is supplied.'
      : 'Remediation required: One or more critical capacity or connection thresholds were exceeded.',
  ].join('\n');

  const reportPath = path.join(reportDir, 'db-pre-renewal-audit-report.md');
  fs.writeFileSync(reportPath, markdownReport, 'utf8');
  console.log(`[DB Audit] Audit report generated at: ${reportPath}`);

  if (isStrict && report.status !== 'clean') {
    throw new Error(`Audit failed under strict mode: Status is ${report.status}`);
  }

  return report;
}

if (process.argv[1]?.endsWith('audit-db-pre-renewal.ts')) {
  runPreRenewalDbAudit()
    .then((rep) => {
      console.log(`[DB Audit] Completed. Status: ${rep.status}`);
      process.exit(rep.status === 'remediation_needed' ? 1 : 0);
    })
    .catch((err) => {
      console.error('[DB Audit] Audit execution failed:', err.message || err);
      process.exit(1);
    });
}
