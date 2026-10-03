import React from 'react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] w-full flex flex-col bg-[#090d16] text-slate-100">
      {children}
    </div>
  );
}
