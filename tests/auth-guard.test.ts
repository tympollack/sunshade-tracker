import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { authenticateApiKey } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/db';

vi.mock('@/lib/db', () => {
  const singleMock = vi.fn();
  const isMock = vi.fn(() => ({ single: singleMock }));
  const orMock = vi.fn(() => ({ is: isMock, single: singleMock }));
  const eqMock = vi.fn(() => ({ is: isMock, single: singleMock }));
  const selectMock = vi.fn(() => ({ or: orMock, eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));

  return {
    supabaseAdmin: {
      from: fromMock,
      _mocks: { singleMock, isMock, orMock, eqMock, selectMock, fromMock },
    },
  };
});

describe('Tenant API Key Auth Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject request when Authorization header and x-api-key are missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/items');
    const result = await authenticateApiKey(req);

    expect(result.context).toBeNull();
    expect(result.errorResponse).not.toBeNull();
    expect(result.errorResponse?.status).toBe(401);
  });

  it('should authenticate with valid Bearer token', async () => {
    const mockTenant = {
      id: '00000000-0000-0000-0000-000000000000',
      slug: 'sunshade',
      name: 'SunShade Digital Canopy',
      api_key: 'tk_live_sunshade_master_key',
    };

    const mocks = (supabaseAdmin as any)._mocks;
    mocks.singleMock.mockResolvedValueOnce({ data: mockTenant, error: null });

    const req = new NextRequest('http://localhost:3000/api/v1/items', {
      headers: { Authorization: 'Bearer tk_live_sunshade_master_key' },
    });

    const result = await authenticateApiKey(req);

    expect(result.errorResponse).toBeNull();
    expect(result.context?.tenant.slug).toBe('sunshade');
    expect(result.context?.tenant.id).toBe(mockTenant.id);
  });

  it('should authenticate with valid x-api-key header', async () => {
    const mockTenant = {
      id: '00000000-0000-0000-0000-000000000000',
      slug: 'sunshade',
      name: 'SunShade Digital Canopy',
      api_key: 'tk_live_sunshade_master_key',
    };

    const mocks = (supabaseAdmin as any)._mocks;
    mocks.singleMock.mockResolvedValueOnce({ data: mockTenant, error: null });

    const req = new NextRequest('http://localhost:3000/api/v1/items', {
      headers: { 'x-api-key': 'tk_live_sunshade_master_key' },
    });

    const result = await authenticateApiKey(req);

    expect(result.errorResponse).toBeNull();
    expect(result.context?.tenant.slug).toBe('sunshade');
  });

  it('should authenticate with SHA-256 hashed API key when plaintext is null', async () => {
    const mockTenant = {
      id: '00000000-0000-0000-0000-000000000000',
      slug: 'sunshade',
      name: 'SunShade Digital Canopy',
      api_key: null,
      api_key_hash: '965f37bb34d0fa3b8c34f80879574d538e1f0e2a97ec59b66f564758d4624ff3',
      api_key_preview: 'tk_live_sunshade_mas...',
    };

    const mocks = (supabaseAdmin as any)._mocks;
    mocks.singleMock.mockResolvedValueOnce({ data: mockTenant, error: null });

    const req = new NextRequest('http://localhost:3000/api/v1/items', {
      headers: { Authorization: 'Bearer tk_live_sunshade_master_key' },
    });

    const result = await authenticateApiKey(req);

    expect(result.errorResponse).toBeNull();
    expect(result.context?.tenant.slug).toBe('sunshade');
    expect(result.context?.tenant.id).toBe(mockTenant.id);
    expect(mocks.orMock).toHaveBeenCalled();
  });

  it('should return 401 when API Key is not found in database', async () => {
    const mocks = (supabaseAdmin as any)._mocks;
    mocks.singleMock.mockResolvedValueOnce({ data: null, error: { message: 'Row not found' } });

    const req = new NextRequest('http://localhost:3000/api/v1/items', {
      headers: { Authorization: 'Bearer tk_live_invalid_key' },
    });

    const result = await authenticateApiKey(req);

    expect(result.context).toBeNull();
    expect(result.errorResponse?.status).toBe(401);
  });
});
