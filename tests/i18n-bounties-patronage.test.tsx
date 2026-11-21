import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  DEFAULT_LOCALE,
  resolveLocale,
  registerTranslations,
  t,
  formatNumber,
} from '@/lib/i18n';
import { calculateBountyPricing } from '@/lib/bounties/neglectPricing';
import {
  getPatronageLadderTierLabel,
  getBuilderPatronageStatus,
} from '@/lib/services/patronageLadderService';
import { ProjectSchemaEditor } from '@/components/schema/ProjectSchemaEditor';
import { BountyGatewayBoard } from '@/components/bounties/BountyGatewayBoard';
import type { ProjectSettings } from '@/types/tracker';

const sampleSettings: ProjectSettings = {
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
  process_efficiency_factor: 1.5,
};

describe('i18n catalog & locale-aware titles across bounties, schema editor, and patronage ladder', () => {
  describe('resolveLocale, formatNumber & registerTranslations', () => {
    it('resolves supported language tags from Accept-Language headers and falls back cleanly', () => {
      expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
      expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
      expect(resolveLocale('')).toBe(DEFAULT_LOCALE);
      expect(resolveLocale('es-MX,es;q=0.9,en;q=0.8')).toBe('es-MX');
      expect(resolveLocale('fr-FR, es;q=0.7')).toBe('es');
      expect(resolveLocale('ja-JP,fr;q=0.8')).toBe(DEFAULT_LOCALE);
    });

    it('interpolates parameters and supports runtime locale overrides via registerTranslations', () => {
      expect(
        t('bounty.gateway.title', { tenantName: 'SunShade' }, 'es')
      ).toBe('Portal de Recompensas de SunShade');

      registerTranslations('fr', {
        'bounty.gateway.title': 'Portail des Primes {tenantName}',
      });

      expect(resolveLocale('fr-CA,en;q=0.5')).toBe('fr-CA');
      expect(
        t('bounty.gateway.title', { tenantName: 'SunShade' }, 'fr')
      ).toBe('Portail des Primes SunShade');
      // Missing keys in partial custom locale fall back to English default
      expect(t('schema.processEfficiency.title', undefined, 'fr')).toBe(
        'Process Efficiency Factor'
      );
    });

    it('formats integers cleanly per locale and guards non-finite numbers', () => {
      expect(formatNumber(60000, 'en')).toBe('60,000');
      expect(formatNumber(Number.NaN, 'en')).toBe('0');
      expect(formatNumber(1200000, 'es')).toBe(new Intl.NumberFormat('es-ES').format(1200000));
    });
  });

  describe('Locale-aware pricing labels & patronage ladder titles', () => {
    it('renders Spanish reward labels and badges when locale is es', () => {
      const refNow = new Date('2026-11-15T12:00:00Z');
      const lastActivity = new Date('2026-10-31T12:00:00Z');

      const pricing = calculateBountyPricing({
        estimatedHours: 2.0,
        priority: 'medium',
        lastActivityDate: lastActivity,
        referenceNow: refNow,
        processEfficiencyFactor: 1.5,
        patronBoostTokens: 25000,
        locale: 'es',
      });

      expect(pricing.formattedRewardLabel).toContain('Inactividad');
      expect(pricing.formattedRewardLabel).toContain('Eficiencia');
      expect(pricing.formattedRewardLabel).toContain('Impulso de Mecenas');

      const effOnlyPricing = calculateBountyPricing({
        estimatedHours: 2.0,
        priority: 'medium',
        lastActivityDate: refNow,
        referenceNow: refNow,
        processEfficiencyFactor: 1.5,
        locale: 'es',
      });
      expect(effOnlyPricing.formattedRewardLabel).toContain('Eficiencia de Proceso');
    });

    it('localizes oversight graduation ladder tier titles', async () => {
      expect(getPatronageLadderTierLabel('leaf_contributor', 'en')).toBe('Leaf Contributor');
      expect(getPatronageLadderTierLabel('oversight_steward', 'es')).toBe('Custodio de Supervisión');

      const mockSupabase = {
        from: (table: string) => {
          if (table === 'v_builder_patronage_summary') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      builder_user_id: 'user-es',
                      total_patronage_credits: 1250000,
                      active_artifacts_count: 1,
                      hours_sponsored: 20.83,
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          return {};
        },
      };

      const status = await getBuilderPatronageStatus('user-es', mockSupabase, 'es');
      expect(status.ladderTier).toBe('bounty_patron');
      expect(status.ladderTierLabel).toBe('Mecenas de Recompensas');
    });
  });

  describe('Component i18n rendering (ProjectSchemaEditor & BountyGatewayBoard)', () => {
    it('renders ProjectSchemaEditor Process Efficiency Factor title and labels in Spanish when locale="es"', () => {
      render(
        <ProjectSchemaEditor
          settings={sampleSettings}
          onChange={() => {}}
          locale="es"
        />
      );

      expect(screen.getByText('Factor de Eficiencia de Proceso')).toBeDefined();
      expect(screen.getByLabelText('Factor de eficiencia de proceso')).toBeDefined();
      expect(screen.getByText('Multiplicador de recompensa (0.10x – 5.00x).')).toBeDefined();
    });

    it('renders BountyGatewayBoard columns and card badges in Spanish when locale="es"', () => {
      const items = [
        {
          id: 'item-1',
          project_id: 'proj-1',
          external_ref_id: 'TASK-TRK-99',
          status: 'not_started',
          title: 'Localize bounty cards',
          description: 'Remove hardcoded titles',
          assignee: null,
          updated_at: '2026-10-15T12:00:00Z',
          metadata: {
            estimated_hours: 2,
            priority: 'high',
            patron_boost_tokens: 10000,
          },
        },
      ];

      render(
        <BountyGatewayBoard
          items={items}
          projectEfficiencyMap={new Map([['proj-1', 1.25]])}
          locale="es"
        />
      );

      expect(screen.getByText('Recompensas Abiertas')).toBeDefined();
      expect(screen.getByText('Reclamadas / En Progreso')).toBeDefined();
      expect(screen.getByText('En Revisión')).toBeDefined();
      expect(screen.getByText('Completadas y Verificadas')).toBeDefined();
      expect(screen.getAllByText('No hay elementos en esta columna')).toHaveLength(3);
      expect(screen.getByText('Sin asignar')).toBeDefined();
      expect(screen.getByText('Prueba Req.')).toBeDefined();
      expect(screen.getByText(/Impulso de Mecenas/)).toBeDefined();
    });
  });
});
