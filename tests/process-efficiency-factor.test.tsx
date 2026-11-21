import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  calculateBountyPricing,
  enrichItemWithNeglectPricing,
  normalizeProcessEfficiencyFactor,
} from '@/lib/bounties/neglectPricing';
import { getItemTokenCommitment, assertRunnerWeeklyCapacity } from '@/lib/bounties/flexLedgerService';
import { lintProjectSettings } from '@/lib/project-settings-schema';
import { validateProjectSettings } from '@/lib/project-settings-validator';
import { normalizeProjectSettings } from '@/lib/project-settings-utils';
import {
  ProjectSettings,
  getProcessEfficiencyFactor,
  DEFAULT_PROCESS_EFFICIENCY_FACTOR,
} from '@/types/tracker';
import { ProjectSchemaEditor } from '@/components/schema/ProjectSchemaEditor';

const baseSettings: ProjectSettings = {
  schema_version: '1.0',
  hierarchy: [
    { type: 'epic', label: 'Epic', level: 1, allowed_parents: [], color: '#c084fc' },
    { type: 'story', label: 'Story', level: 2, allowed_parents: ['epic'], color: '#38bdf8' },
    { type: 'task', label: 'Task', level: 3, allowed_parents: ['story'], color: '#34d399' },
  ],
  statuses: [
    { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
    { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
    { id: 'complete', label: 'Complete', color: '#22c55e', order: 3, is_completed: true },
  ],
  custom_fields: ['priority'],
};

describe('TASK-TRK-EFFICIENCY-FACTOR-SCHEMA: process_efficiency_factor in Project Settings & Bounty Calculator', () => {
  describe('Normalization & Bounds', () => {
    it('defaults to 1.0 when unset, null, non-positive, or NaN', () => {
      expect(getProcessEfficiencyFactor(baseSettings)).toBe(DEFAULT_PROCESS_EFFICIENCY_FACTOR);
      expect(normalizeProcessEfficiencyFactor(undefined)).toBe(1.0);
      expect(normalizeProcessEfficiencyFactor(null)).toBe(1.0);
      expect(normalizeProcessEfficiencyFactor(0)).toBe(1.0);
      expect(normalizeProcessEfficiencyFactor(-2)).toBe(1.0);
      expect(normalizeProcessEfficiencyFactor(Number.NaN)).toBe(1.0);
    });

    it('clamps valid positive factors into [0.1, 5.0]', () => {
      expect(normalizeProcessEfficiencyFactor(0.01)).toBe(0.1);
      expect(normalizeProcessEfficiencyFactor(99)).toBe(5.0);
      expect(normalizeProcessEfficiencyFactor(1.356)).toBe(1.36);
      expect(getProcessEfficiencyFactor({ ...baseSettings, process_efficiency_factor: 2.25 })).toBe(2.25);
    });

    it('preserves process_efficiency_factor through normalizeProjectSettings', () => {
      const normalized = normalizeProjectSettings({
        ...baseSettings,
        process_efficiency_factor: 1.75,
      });
      expect(normalized.process_efficiency_factor).toBe(1.75);
    });
  });

  describe('Schema & Validator Enforcement', () => {
    it('accepts valid process_efficiency_factor and null in lintProjectSettings & validateProjectSettings', () => {
      expect(lintProjectSettings({ ...baseSettings, process_efficiency_factor: 1.5 }).valid).toBe(true);
      expect(lintProjectSettings({ ...baseSettings, process_efficiency_factor: null }).valid).toBe(true);
      expect(validateProjectSettings({ ...baseSettings, process_efficiency_factor: 1.5 }).valid).toBe(true);
      expect(validateProjectSettings({ ...baseSettings, process_efficiency_factor: null }).valid).toBe(true);
    });

    it('rejects out-of-range or non-numeric process_efficiency_factor', () => {
      const lowLint = lintProjectSettings({ ...baseSettings, process_efficiency_factor: 0.05 });
      expect(lowLint.valid).toBe(false);
      expect(lowLint.errors.some((e) => e.path === 'process_efficiency_factor')).toBe(true);

      const highVal = validateProjectSettings({ ...baseSettings, process_efficiency_factor: 7.5 });
      expect(highVal.valid).toBe(false);
      expect(highVal.errors.some((e) => e.path === 'process_efficiency_factor')).toBe(true);

      const strVal = validateProjectSettings({ ...baseSettings, process_efficiency_factor: '1.5' as any });
      expect(strVal.valid).toBe(false);
      expect(strVal.errors.some((e) => e.path === 'process_efficiency_factor')).toBe(true);
    });
  });

  describe('Bounty Calculator & Flex Commitment Integration', () => {
    it('scales dynamicBountyTokens by processEfficiencyFactor alongside neglectMultiplier', () => {
      const refNow = new Date('2026-11-01T12:00:00Z');
      const lastActivity = new Date('2026-10-17T12:00:00Z'); // 15 days dormant -> 1.5x neglect for medium

      const pricing = calculateBountyPricing({
        estimatedHours: 2.0,
        priority: 'medium',
        lastActivityDate: lastActivity,
        referenceNow: refNow,
        processEfficiencyFactor: 1.25,
      });

      expect(pricing.baseTokens).toBe(120000);
      expect(pricing.neglectMultiplier).toBe(1.5);
      expect(pricing.processEfficiencyFactor).toBe(1.25);
      // 120,000 * 1.5 * 1.25 = 225,000
      expect(pricing.dynamicBountyTokens).toBe(225000);
      expect(pricing.formattedRewardLabel).toBe('225,000 Tokens (1.50x Neglect · 1.25x Efficiency)');
    });

    it('enriches item metadata from projectSettings.process_efficiency_factor', () => {
      const enriched = enrichItemWithNeglectPricing(
        {
          id: 'item-1',
          priority: 'medium',
          created_at: '2026-11-01T00:00:00Z',
          metadata: { estimated_hours: 1.0 },
        },
        new Date('2026-11-01T00:00:00Z'),
        { process_efficiency_factor: 1.5 }
      );

      expect(enriched.metadata.process_efficiency_factor).toBe(1.5);
      expect(enriched.metadata.dynamic_tokens).toBe(90000);
      expect(enriched.metadata.bounty_reward).toBe('90,000 Tokens (1.50x Process Efficiency)');
    });

    it('scales getItemTokenCommitment by process_efficiency_factor when dynamic_tokens is absent', () => {
      const commitment = getItemTokenCommitment({
        metadata: {
          bounty_hours: 2.0,
          neglect_multiplier: 1.0,
          process_efficiency_factor: 1.5,
        },
      });
      expect(commitment).toBe(180000);
    });

    it('enforces project-level process_efficiency_factor in assertRunnerWeeklyCapacity for candidate and existing commitments', async () => {
      const mockClient = {
        from: vi.fn((table: string) => {
          if (table === 'work_items') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    neq: vi.fn().mockResolvedValue({
                      data: [
                        // 7.5 hrs * 2.0x project efficiency = 15 hrs = 900,000 tokens
                        {
                          id: 'existing-proj-item',
                          project_id: 'proj-2x',
                          status: 'in_progress',
                          metadata: { bounty_hours: 7.5 },
                        },
                      ],
                      error: null,
                    }),
                  })),
                })),
              })),
            };
          }
          if (table === 'projects') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn().mockResolvedValue({
                    data: [{ id: 'proj-2x', settings: { process_efficiency_factor: 2.0 } }],
                    error: null,
                  }),
                })),
              })),
            };
          }
          return {};
        }),
      };

      // Candidate 4 hrs * 2.0x project efficiency = 480,000 tokens -> 900,000 + 480,000 = 1,380,000 > 1,200,000
      const result = await assertRunnerWeeklyCapacity({
        supabaseClient: mockClient,
        tenantId: 'tenant-1',
        assignee: 'runner-1',
        candidateItem: {
          id: 'cand-1',
          project_id: 'proj-2x',
          metadata: { bounty_hours: 4.0 },
        },
        projectSettings: { process_efficiency_factor: 2.0 },
      });

      expect(result.allowed).toBe(false);
      expect(result.currentWeeklyTokens).toBe(900000);
      expect(result.candidateBountyTokens).toBe(480000);
      expect(result.tokensExceeded).toBe(180000);
    });
  });

  describe('ProjectSchemaEditor Visual Control', () => {
    it('renders Process Efficiency Factor input and emits updated settings on change', () => {
      const handleChange = vi.fn();
      render(<ProjectSchemaEditor settings={baseSettings} onChange={handleChange} />);

      const input = screen.getByLabelText('Process efficiency factor') as HTMLInputElement;
      expect(input).toBeDefined();
      expect(input.value).toBe('');

      fireEvent.change(input, { target: { value: '1.4' } });
      expect(handleChange).toHaveBeenCalledTimes(1);
      expect(handleChange.mock.calls[0][0].process_efficiency_factor).toBe(1.4);
    });
  });
});
