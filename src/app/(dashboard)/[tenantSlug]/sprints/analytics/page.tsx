'use client';

import React, { use, Suspense } from 'react';
import {
  SprintAnalyticsContent,
  SprintAnalyticsSkeleton,
} from '@/components/sprints/SprintAnalyticsDashboard';

interface PageProps {
  params: Promise<{
    tenantSlug: string;
  }>;
}

export default function SprintAnalyticsPage(props: PageProps) {
  const resolvedParams = typeof (props.params as any)?.then === 'function' ? use(props.params) : (props.params as any);
  const tenantSlug = resolvedParams?.tenantSlug || 'default';

  return (
    <Suspense fallback={<SprintAnalyticsSkeleton tenantSlug={tenantSlug} />}>
      <SprintAnalyticsContent tenantSlug={tenantSlug} />
    </Suspense>
  );
}
