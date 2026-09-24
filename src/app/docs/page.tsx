import React from 'react';
import { DocsHeader } from '@/components/docs/DocsHeader';
import { DocsSidebar } from '@/components/docs/DocsSidebar';
import { DocsContent } from '@/components/docs/DocsContent';
import { DocsFooter } from '@/components/docs/DocsFooter';

export const metadata = {
  title: 'Documentation | SunShade Tracker',
  description: 'Learn how to organize initiatives, navigate boards, track sprints, and ingest tasks with SunShade Tracker.',
};

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-orange-500/30 selection:text-orange-200">
      <DocsHeader />
      <div className="max-w-7xl mx-auto px-6 py-12 w-full flex-1 grid grid-cols-1 lg:grid-cols-12 gap-10">
        <DocsSidebar />
        <DocsContent />
      </div>
      <DocsFooter />
    </div>
  );
}
