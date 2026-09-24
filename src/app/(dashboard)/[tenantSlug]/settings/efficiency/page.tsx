'use client';

import { use, Suspense } from 'react';
import {
  EfficiencyStatementView,
  EfficiencyStatementSkeleton,
} from '@/components/efficiency/EfficiencyStatementView';

interface PageProps {
  params: Promise<{
    tenantSlug: string;
  }>;
}

export default function EfficiencyStatementPage(props: PageProps) {
  const { tenantSlug } = use(props.params);

  return (
    <Suspense fallback={<EfficiencyStatementSkeleton tenantSlug={tenantSlug} />}>
      <EfficiencyStatementView tenantSlug={tenantSlug} />
    </Suspense>
  );
}
