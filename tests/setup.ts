import '@testing-library/jest-dom';
import { vi } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-supabase-tracker.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-12345';
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

