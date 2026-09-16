import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { authenticateApiKey } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/db';

vi.mock('@/lib/db', () => {
  let activeTable = '';
  let activeFilters: Record<string, any> = {};
  let dbRows: any[] = [];

  const singleMock = vi.fn(async () => {
    const match = dbRows.find((row) => {
      return Object.entries(activeFilters).every(([col, val]) => {
        if (col === 'deleted_at' && val === null) {
          return row.deleted_at === null || row.deleted_at === undefined;
        }
        return row[col] === val;
      });
    });

    if (match) {
      return { data: match, error: null };
    }
    return { data: null, error: { message: 'Row not found' } };
  });

  const isMock = vi.fn((col: string, val: any) => {
    activeFilters[col] = val;
    return { single: singleMock };
  });

  const eqMock = vi.fn((col: string, val: any) => {
    activeFilters[col] = val;
    return { is: isMock, single: singleMock };
  });

  const selectMock = vi.fn((_cols?: string) => {
    activeFilters = {};
    return { eq: eqMock };
  });

  const fromMock = vi.fn((table: string) => {
    activeTable = table;
    return { select: selectMock };
  });

  return {
    supabaseAdmin: {
      from: fromMock,
      _mocks: {
        singleMock,
        isMock,
        eqMock,
        selectMock,
        fromMock,
        setRows: (rows: any[]) => {
          dbRows = rows;
        },
      },
    },
  };
});

describe('Tenant API Key Auth Guard', () => {
  const MASTER_KEY = 'tk_live_sunshade_master_key';
  const MASTER_HASH = createHash('sha256').update(MASTER_KEY).digest('hex');

  beforeEach(() => {
    vi.clearAllMocks();
    const mocks = (supabaseAdmin as any)._mocks;
    mocks.setRows([]);
  });

  it('should reject request when Authorization header and x-api-key are missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/items');
    const result = await authenticateApiKey(req);

    expect(result.context).toBeNull();
    expect(result.errorResponse).not.toBeNull();
    expect(result.errorResponse?.status).toBe(401);
  });

  it('should reject API keys with PostgREST filter injection characters', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/items', {
      headers: { Authorization: 'Bearer tk_live_test,id.neq.00000000-0000-0000-0000-000000000000' },
    });

    const result = await authenticateApiKey(req);

    expect(result.context).toBeNull();
    expect(result.errorResponse?.status).toBe(401);
    const mocks = (supabaseAdmin as any)._mocks;
    expect(mocks.fromMock).not.toHaveBeenCalled();
  });

  it('should authenticate with SHA-256 hashed API key when plaintext is null', async () => {
    const mockTenant = {
      id: '00000000-0000-0000-0000-000000000000',
      slug: 'sunshade',
      name: 'SunShade Digital Canopy',
      api_key: null,
      api_key_hash: MASTER_HASH,
      api_key_preview: 'tk_live_sunshade_mas...',
      deleted_at: null,
    };

    const mocks = (supabaseAdmin as any)._mocks;
    mocks.setRows([mockTenant]);

    const req = new NextRequest('http://localhost:3000/api/v1/items', {
      headers: { Authorization: `Bearer ${MASTER_KEY}` },
    });

    const result = await authenticateApiKey(req);

    expect(result.errorResponse).toBeNull();
    expect(result.context?.tenant.slug).toBe('sunshade');
    expect(result.context?.tenant.id).toBe(mockTenant.id);
    expect(mocks.eqMock).toHaveBeenCalledWith('api_key_hash', MASTER_HASH);
  });

  it('should fail authentication if database hash does not match computed hash', async () => {
    const mockTenant = {
      id: '00000000-0000-0000-0000-000000000000',
      slug: 'sunshade',
      name: 'SunShade Digital Canopy',
      api_key: null,
      api_key_hash: 'different_hash_that_does_not_match',
      api_key_preview: 'tk_live_sunshade_mas...',
      deleted_at: null,
    };

    const mocks = (supabaseAdmin as any)._mocks;
    mocks.setRows([mockTenant]);

    const req = new NextRequest('http://localhost:3000/api/v1/items', {
      headers: { Authorization: `Bearer ${MASTER_KEY}` },
    });

    const result = await authenticateApiKey(req);

    expect(result.context).toBeNull();
    expect(result.errorResponse?.status).toBe(401);
  });

  it('should authenticate with valid x-api-key header using SHA-256 hash', async () => {
    const mockTenant = {
      id: '00000000-0000-0000-0000-000000000000',
      slug: 'sunshade',
      name: 'SunShade Digital Canopy',
      api_key: null,
      api_key_hash: MASTER_HASH,
      api_key_preview: 'tk_live_sunshade_mas...',
      deleted_at: null,
    };

    const mocks = (supabaseAdmin as any)._mocks;
    mocks.setRows([mockTenant]);

    const req = new NextRequest('http://localhost:3000/api/v1/items', {
      headers: { 'x-api-key': MASTER_KEY },
    });

    const result = await authenticateApiKey(req);

    expect(result.errorResponse).toBeNull();
    expect(result.context?.tenant.slug).toBe('sunshade');
    expect(result.context?.tenant.id).toBe(mockTenant.id);
  });

  it('should fall back to legacy plaintext api_key lookup when api_key_hash is not present', async () => {
    const legacyTenant = {
      id: '11111111-1111-1111-1111-111111111111',
      slug: 'legacy-org',
      name: 'Legacy Org',
      api_key: 'tk_live_legacy_key_12345',
      api_key_hash: null,
      deleted_at: null,
    };

    const mocks = (supabaseAdmin as any)._mocks;
    mocks.setRows([legacyTenant]);

    const req = new NextRequest('http://localhost:3000/api/v1/items', {
      headers: { Authorization: 'Bearer tk_live_legacy_key_12345' },
    });

    const result = await authenticateApiKey(req);

    expect(result.errorResponse).toBeNull();
    expect(result.context?.tenant.slug).toBe('legacy-org');
    expect(mocks.eqMock).toHaveBeenCalledWith('api_key', 'tk_live_legacy_key_12345');
  });

  it('should return 401 when API Key is not found in database', async () => {
    const mocks = (supabaseAdmin as any)._mocks;
    mocks.setRows([]);

    const req = new NextRequest('http://localhost:3000/api/v1/items', {
      headers: { Authorization: 'Bearer tk_live_invalid_key' },
    });

    const result = await authenticateApiKey(req);

    expect(result.context).toBeNull();
    expect(result.errorResponse?.status).toBe(401);
  });
});
