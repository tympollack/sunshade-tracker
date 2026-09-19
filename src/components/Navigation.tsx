'use client';

import React from 'react';
import { Kanban, GitFork, Calendar } from 'lucide-react';

export type DashboardTab = 'board' | 'tree' | 'sprint' | 'spark' | 'schema';

export interface NavTabItem {
  id: 'board' | 'tree' | 'sprint';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const DASHBOARD_NAV_TABS: NavTabItem[] = [
  { id: 'board', label: 'Kanban', icon: Kanban },
  { id: 'tree', label: 'Hierarchy Tree', icon: GitFork },
  { id: 'sprint', label: 'Sprint Planning', icon: Calendar },
];
