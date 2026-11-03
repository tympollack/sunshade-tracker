'use client';

import React, { use } from 'react';
import { ProjectWorkspaceView } from '@/components/views/ProjectWorkspaceView';

interface AllProjectsPageProps {
  params: Promise<{
    tenantSlug: string;
  }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default function AllProjectsLiveDashboardPage(props: AllProjectsPageProps) {
  const { tenantSlug } = use(props.params);
  const searchParams = props.searchParams ? use(props.searchParams) : {};

  return (
    <ProjectWorkspaceView
      tenantSlug={tenantSlug}
      projectSlug="all"
      searchParams={searchParams}
    />
  );
}
