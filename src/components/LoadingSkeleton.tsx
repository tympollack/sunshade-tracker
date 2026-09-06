/**
 * Animated loading skeleton for the Kanban board view.
 * Shows pulse-animated placeholder cards while data is being fetched.
 */
export function BoardSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, colIdx) => (
        <div
          key={colIdx}
          className="bg-slate-900/40 border border-slate-800/80 rounded-xl overflow-hidden"
        >
          {/* Column header */}
          <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-700 animate-pulse" />
              <div className="h-3 w-20 rounded bg-slate-700 animate-pulse" />
            </div>
            <div className="h-4 w-5 rounded-full bg-slate-800 animate-pulse" />
          </div>

          {/* Card skeletons */}
          <div className="p-3 space-y-3">
            {Array.from({ length: colIdx === 0 ? 3 : colIdx === 1 ? 2 : 1 }).map((_, cardIdx) => (
              <div
                key={cardIdx}
                className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/90 space-y-2.5"
                style={{ animationDelay: `${(colIdx * 3 + cardIdx) * 80}ms` }}
              >
                {/* Type badge + ref */}
                <div className="flex items-center justify-between">
                  <div className="h-4 w-12 rounded bg-slate-800 animate-pulse" />
                  <div className="h-3 w-16 rounded bg-slate-800/60 animate-pulse" />
                </div>
                {/* Title */}
                <div className="space-y-1.5">
                  <div className="h-3.5 w-full rounded bg-slate-800 animate-pulse" />
                  <div className="h-3.5 w-3/4 rounded bg-slate-800/70 animate-pulse" />
                </div>
                {/* Metadata badges */}
                <div className="flex space-x-1.5 pt-0.5">
                  <div className="h-4 w-14 rounded bg-slate-800/60 animate-pulse" />
                  <div className="h-4 w-10 rounded bg-slate-800/60 animate-pulse" />
                </div>
                {/* Footer */}
                <div className="pt-2 border-t border-slate-900 flex items-center justify-between">
                  <div className="h-3 w-20 rounded bg-slate-800/50 animate-pulse" />
                  <div className="h-5 w-24 rounded bg-slate-800/40 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Simple single-line skeleton for inline loading states */
export function InlineSkeleton({ className = 'h-4 w-32' }: { className?: string }) {
  return <div className={`rounded bg-slate-800 animate-pulse ${className}`} />;
}
