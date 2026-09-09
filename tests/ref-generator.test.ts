import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  deriveProjectPrefix,
  generateNextSequentialRef,
  generateSequentialRefsForBatch,
} from '@/lib/ref-generator';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { supabaseAdmin } from '@/lib/db';

describe('TASK-TRK-BOARD-DEFAULT-REF-TAG: Reference Tag Generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deriveProjectPrefix', () => {
    it('uses settings.ref_prefix if specified', () => {
      expect(deriveProjectPrefix({ settings: { ref_prefix: 'ABC' } })).toBe('ABC');
      expect(deriveProjectPrefix({ settings: { ref_prefix: 'trk' } })).toBe('TRK');
    });

    it('uses settings.prefix if specified', () => {
      expect(deriveProjectPrefix({ settings: { prefix: 'XYZ' } })).toBe('XYZ');
    });

    it('maps known project slugs to their standard prefixes', () => {
      expect(deriveProjectPrefix({ slug: 'sunshade-tracker' })).toBe('TRK');
      expect(deriveProjectPrefix({ slug: 'tracker' })).toBe('TRK');
      expect(deriveProjectPrefix({ slug: 'sunshade-db-platform' })).toBe('DBP');
      expect(deriveProjectPrefix({ slug: 'sunshade-hub' })).toBe('HUB');
      expect(deriveProjectPrefix({ slug: 'makerverse' })).toBe('MKV');
      expect(deriveProjectPrefix({ slug: 'patchwork' })).toBe('PTW');
      expect(deriveProjectPrefix({ slug: 'puk-huk' })).toBe('PH');
      expect(deriveProjectPrefix({ slug: 'wsw' })).toBe('WSW');
    });

    it('derives initials from multi-word slugs', () => {
      expect(deriveProjectPrefix({ slug: 'alpha-beta-gamma' })).toBe('ABG');
      expect(deriveProjectPrefix({ slug: 'custom-tool' })).toBe('CT');
    });

    it('extracts consonants from single word slugs', () => {
      expect(deriveProjectPrefix({ slug: 'platform' })).toBe('PLT');
    });

    it('falls back to PRJ if no slug or settings provided', () => {
      expect(deriveProjectPrefix(undefined)).toBe('PRJ');
      expect(deriveProjectPrefix({ slug: '' })).toBe('PRJ');
    });
  });

  describe('generateSequentialRefsForBatch', () => {
    it('generates sequential refs starting at 01 when project has no existing items', async () => {
      (supabaseAdmin.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [],
          }),
        }),
      });

      const refs = await generateSequentialRefsForBatch('proj-123', 'TRK', 3);
      expect(refs).toEqual(['TRK-01', 'TRK-02', 'TRK-03']);
    });

    it('increments from highest existing number matching prefix', async () => {
      (supabaseAdmin.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              { external_ref_id: 'TRK-01' },
              { external_ref_id: 'TRK-05' },
              { external_ref_id: 'OTHER-99' },
            ],
          }),
        }),
      });

      const ref = await generateNextSequentialRef('proj-123', 'TRK');
      expect(ref).toBe('TRK-06');
    });

    it('detects typed prefix numbers (e.g. TASK-TRK-08)', async () => {
      (supabaseAdmin.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              { external_ref_id: 'STORY-TRK-02' },
              { external_ref_id: 'TASK-TRK-08' },
            ],
          }),
        }),
      });

      const refs = await generateSequentialRefsForBatch('proj-123', 'TRK', 2);
      expect(refs).toEqual(['TRK-09', 'TRK-10']);
    });

    it('skips reserved refs to prevent collisions', async () => {
      (supabaseAdmin.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ external_ref_id: 'TRK-01' }],
          }),
        }),
      });

      const extraReserved = new Set(['TRK-02']);
      const ref = await generateNextSequentialRef('proj-123', 'TRK', extraReserved);
      expect(ref).toBe('TRK-03');
    });
  });
});
