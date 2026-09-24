'use client';

import React, { use } from 'react';
import { ProjectWorkspaceView } from '@/components/views/ProjectWorkspaceView';


interface PageProps {
  params: Promise<{
    tenantSlug: string;
    projectSlug: string;
  }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default function ProjectTrackerDashboard(props: PageProps) {
  const { tenantSlug, projectSlug } = use(props.params);
  const searchParams = props.searchParams ? use(props.searchParams) : {};

  return (
    <ProjectWorkspaceView
      tenantSlug={tenantSlug}
      projectSlug={projectSlug}
      searchParams={searchParams}
    />
  );
}
