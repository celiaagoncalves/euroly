// Skeleton primitives — shimmer placeholders used while data is loading.
//
// The shimmer effect lives in index.css (`.skeleton-shimmer`) and an
// `animate-shimmer` keyframe defined in tailwind.config.js. Use the
// composed variants below in pages; only fall back to the base
// <Skeleton/> for irregular shapes.

export function Skeleton({ className = '', ...rest }) {
  return (
    <div
      className={`skeleton-shimmer animate-shimmer rounded ${className}`}
      {...rest}
    />
  );
}

// A row of N skeleton lines stacked vertically. Useful for replacing
// table rows while data is loading.
export function SkeletonLines({ rows = 5, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

// Card-shaped placeholder for KPI tiles (Dashboard, Accounts top bar).
export function SkeletonCard() {
  return (
    <div className="bg-surface-0 border border-surface-200 rounded-xl p-5 shadow-sm">
      <Skeleton className="h-4 w-1/3 mb-3" />
      <Skeleton className="h-7 w-1/2" />
    </div>
  );
}

// Tabular placeholder. Renders N grey rows with M column-width segments,
// matching the visual rhythm of the real <table> beneath.
export function SkeletonTable({ rows = 6, cols = 5 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={`h-5 ${c === 0 ? 'w-20' : c === cols - 1 ? 'w-16' : 'flex-1'}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
