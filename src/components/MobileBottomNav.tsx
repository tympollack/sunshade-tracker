'use client';

import React from 'react';
import { Kanban, GitFork, Calendar } from 'lucide-react';
import { DashboardTab } from '@/components/rev_trk_02';

export interface MobileBottomNavProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
}

export function MobileBottomNav({ activeTab, onTabChange }: MobileBottomNavProps) {
  const tabs = [
    { id: 'board' as const, label: 'Board', icon: Kanban },
    { id: 'tree' as const, label: 'Hierarchy', icon: GitFork },
    { id: 'sprint' as const, label: 'Sprint', icon: Calendar },
  ];

  return (
    <nav
      data-testid="mobile-bottom-nav"
      aria-label="Mobile Navigation"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        minHeight: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))',
      }}
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800/90 flex items-center justify-around px-2 touch-manipulation select-none safe-area-bottom"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            data-testid={`mobile-nav-${tab.id}`}
            className={`relative flex flex-col items-center justify-center flex-1 h-14 py-1 transition-colors cursor-pointer min-h-[44px] ${
              isActive
                ? 'text-emerald-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {isActive && (
              <span
                data-testid={`mobile-nav-active-pill-${tab.id}`}
                className="absolute top-0 w-8 h-0.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
              />
            )}
            <Icon className={`w-4 h-4 mb-0.5 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
            <span className="text-[10px] tracking-tight">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
