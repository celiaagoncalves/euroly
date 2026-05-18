// Two shared presentational primitives reused across every page:
//   <Card>    — a KPI tile (label + big value + optional hint).
//   <Section> — a titled white panel with optional right-side action.
// Both are dumb components: no data fetching, no state.

export function Card({ title, value, hint, accent = 'slate' }) {
  const accents = {
    green: 'text-emerald-600',
    red: 'text-rose-600',
    blue: 'text-brand-700',
    slate: 'text-surface-900',
    amber: 'text-accent-600',
  };
  return (
    <div className="bg-surface-0 border border-surface-200 rounded-xl p-5 shadow-sm">
      <div className="text-xs font-medium text-surface-500 uppercase tracking-wide">{title}</div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${accents[accent]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-surface-400">{hint}</div>}
    </div>
  );
}

export function Section({ title, children, action }) {
  return (
    <section className="bg-surface-0 border border-surface-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-surface-800">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
