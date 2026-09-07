import { describe, it, expect } from 'vitest';
import {
  computeEfficiencyMetrics,
  formatEfficiencyStatementCSV,
  formatEfficiencyStatementJSON,
  ECOSYSTEM_NOTE,
} from '@/lib/services/valueLedgerService';

describe('Value Realization Ledger Service', () => {
  it('computes efficiency metrics correctly for standard active workspace', () => {
    // 10 completed items, 2 active projects, $125/hr baseline
    // Hierarchy: 2 * 2.0 = 4.0 hrs ($500.00)
    // Triage: 10 * 0.05 = 0.5 hrs ($62.50)
    // Autonomous: 10 * 0.20 = 2.0 hrs ($250.00)
    // Total Hours = 4.0 + 0.5 + 2.0 = 6.5 hrs
    // Gross Realized Value = 6.5 * 125 = $812.50
    // Subscription Fee = $0.00
    // Net Savings = $812.50
    const res = computeEfficiencyMetrics({
      tenantSlug: 'acme-corp',
      tenantName: 'Acme Corporation',
      tier: 'Pro',
      completedItemsCount: 10,
      activeProjectsCount: 2,
      totalItemsCount: 25,
    });

    expect(res.tenant.slug).toBe('acme-corp');
    expect(res.tenant.name).toBe('Acme Corporation');
    expect(res.kpis.completedItemsCount).toBe(10);
    expect(res.kpis.activeProjectsCount).toBe(2);
    expect(res.kpis.totalItemsCount).toBe(25);
    expect(res.kpis.totalHoursReclaimed).toBe(6.5);
    expect(res.kpis.hourlyRate).toBe(125);
    expect(res.kpis.velocityFactor).toBe('+18%');
    expect(res.kpis.grossRealizedValue).toBe(812.5);
    expect(res.kpis.platformSubscriptionFee).toBe(0.0);
    expect(res.kpis.netRealizedSavings).toBe(812.5);
    expect(res.ecosystemNote).toBe(ECOSYSTEM_NOTE);

    expect(res.itemizedYields).toHaveLength(3);
    const [hierarchy, triage, autonomous] = res.itemizedYields;

    expect(hierarchy.id).toBe('hierarchical-status-rollup');
    expect(hierarchy.hoursReclaimed).toBe(4.0);
    expect(hierarchy.realizedValue).toBe(500.0);

    expect(triage.id).toBe('backlog-triage-state-sync');
    expect(triage.hoursReclaimed).toBe(0.5);
    expect(triage.realizedValue).toBe(62.5);

    expect(autonomous.id).toBe('autonomous-review-dev-cycles');
    expect(autonomous.hoursReclaimed).toBe(2.0);
    expect(autonomous.realizedValue).toBe(250.0);
  });

  it('handles edge case: zero projects and zero completed items without NaN or errors', () => {
    const res = computeEfficiencyMetrics({
      tenantSlug: 'empty-workspace',
      completedItemsCount: 0,
      activeProjectsCount: 0,
      totalItemsCount: 0,
    });

    expect(res.kpis.completedItemsCount).toBe(0);
    expect(res.kpis.activeProjectsCount).toBe(0);
    expect(res.kpis.totalHoursReclaimed).toBe(0);
    expect(res.kpis.grossRealizedValue).toBe(0);
    expect(res.kpis.platformSubscriptionFee).toBe(0.0);
    expect(res.kpis.netRealizedSavings).toBe(0);

    expect(res.itemizedYields[0].hoursReclaimed).toBe(0);
    expect(res.itemizedYields[1].hoursReclaimed).toBe(0);
    expect(res.itemizedYields[2].hoursReclaimed).toBe(0);
  });

  it('handles edge case: uncompleted backlogs only (0 completed, 50 total, 3 active projects)', () => {
    // 3 projects * 2.0 hrs = 6.0 hrs
    // 0 completed items * 0.25 hrs = 0 hrs
    // Total Hours = 6.0 hrs
    // Gross Value = 6.0 * 125 = $750.00
    const res = computeEfficiencyMetrics({
      tenantSlug: 'backlog-heavy',
      completedItemsCount: 0,
      activeProjectsCount: 3,
      totalItemsCount: 50,
    });

    expect(res.kpis.completedItemsCount).toBe(0);
    expect(res.kpis.activeProjectsCount).toBe(3);
    expect(res.kpis.totalItemsCount).toBe(50);
    expect(res.kpis.totalHoursReclaimed).toBe(6.0);
    expect(res.kpis.grossRealizedValue).toBe(750.0);
    expect(res.kpis.netRealizedSavings).toBe(750.0);
  });

  it('handles custom hourly rate and velocity factor overrides', () => {
    const res = computeEfficiencyMetrics({
      tenantSlug: 'enterprise-client',
      completedItemsCount: 20,
      activeProjectsCount: 5,
      totalItemsCount: 40,
      hourlyRate: 150,
      velocityFactor: '+25%',
    });

    // Hierarchy: 5 * 2.0 = 10 hrs
    // Triage + Autonomous: 20 * 0.25 = 5.0 hrs
    // Total: 15.0 hrs
    // Value: 15 * 150 = $2,250.00
    expect(res.kpis.totalHoursReclaimed).toBe(15.0);
    expect(res.kpis.hourlyRate).toBe(150);
    expect(res.kpis.velocityFactor).toBe('+25%');
    expect(res.kpis.grossRealizedValue).toBe(2250.0);
    expect(res.kpis.platformSubscriptionFee).toBe(0.0);
  });

  it('formats CSV output accurately conforming to RFC-4180 rules including carriage returns', () => {
    const res = computeEfficiencyMetrics({
      tenantSlug: 'test-slug',
      tenantName: 'Test, Inc.\r\nSpecial Division',
      completedItemsCount: 4,
      activeProjectsCount: 1,
      totalItemsCount: 10,
    });

    const csv = formatEfficiencyStatementCSV(res);
    expect(csv).toContain('"Test, Inc.\r\nSpecial Division"');
    expect(csv).toContain('Operational Yield & Efficiency Statement');
    expect(csv).toContain('Hierarchical Status Rollup');
    expect(csv).toContain('Platform Subscription Fee,$0.00');
    expect(csv).toContain('Net Realized Savings');
  });

  it('computes velocity factor dynamically based on completed count when not explicitly provided', () => {
    // 0 completed items -> 0%
    const zeroRes = computeEfficiencyMetrics({
      tenantSlug: 'zero-slug',
      completedItemsCount: 0,
      activeProjectsCount: 2,
      totalItemsCount: 10,
    });
    expect(zeroRes.kpis.velocityFactor).toBe('0%');

    // 20 completed items -> +18% (8 + 10)
    const twentyRes = computeEfficiencyMetrics({
      tenantSlug: 'active-slug',
      completedItemsCount: 20,
      activeProjectsCount: 2,
      totalItemsCount: 30,
    });
    expect(twentyRes.kpis.velocityFactor).toBe('+18%');
  });

  it('formats JSON output cleanly', () => {
    const res = computeEfficiencyMetrics({
      tenantSlug: 'test-json',
      completedItemsCount: 2,
      activeProjectsCount: 1,
      totalItemsCount: 5,
    });

    const jsonStr = formatEfficiencyStatementJSON(res);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.tenant.slug).toBe('test-json');
    expect(parsed.kpis.totalHoursReclaimed).toBe(2.5);
  });
});
