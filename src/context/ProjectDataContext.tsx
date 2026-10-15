'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { WorkItem } from '@/types/tracker';
import { useProjectItems, UseProjectItemsOptions, UseProjectItemsResult } from '@/hooks/useProjectItems';

const ProjectDataContext = createContext<UseProjectItemsResult | null>(null);

export interface ProjectDataProviderProps extends UseProjectItemsOptions {
  children: ReactNode;
}

export function ProjectDataProvider(props: ProjectDataProviderProps) {
  const { children, ...options } = props;
  const projectData = useProjectItems(options);

  return (
    <ProjectDataContext.Provider value={projectData}>
      {children}
    </ProjectDataContext.Provider>
  );
}

export function useProjectData(): UseProjectItemsResult {
  const ctx = useContext(ProjectDataContext);
  if (!ctx) {
    throw new Error('useProjectData must be used within a ProjectDataProvider');
  }
  return ctx;
}

export { ProjectDataContext };
