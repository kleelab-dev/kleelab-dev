import { clsx } from 'clsx';

const INK = '#0e1530';
const COBALT = '#2340e8';
const SUN = '#ffd23f';

/** Shared stroke settings so every drawing has the same pen. */
const pen = { fill: 'none', stroke: COBALT, strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function Website() {
  return (
    <>
      <rect x="20" y="12" width="160" height="88" rx="6" {...pen} />
      <line x1="20" y1="24" x2="180" y2="24" {...pen} />
      <circle cx="28" cy="18" r="1.6" fill={COBALT} />
      <circle cx="34" cy="18" r="1.6" fill={COBALT} />
      <line x1="32" y1="38" x2="92" y2="38" {...pen} strokeWidth={3} />
      <line x1="32" y1="47" x2="80" y2="47" {...pen} />
      <line x1="32" y1="53" x2="86" y2="53" {...pen} />
      <rect x="104" y="32" width="64" height="34" rx="3" {...pen} />
      <polyline points="108,62 124,46 136,56 146,48 164,62" {...pen} />
      <g className="sketch-accent">
        <rect x="32" y="60" width="30" height="9" rx="4.5" fill={SUN} stroke={INK} strokeWidth={1.2} />
      </g>
      <rect x="32" y="78" width="40" height="14" rx="2" {...pen} />
      <rect x="80" y="78" width="40" height="14" rx="2" {...pen} />
      <rect x="128" y="78" width="40" height="14" rx="2" {...pen} />
    </>
  );
}

function Shop() {
  return (
    <>
      {[24, 80, 136].map((x) => (
        <g key={x}>
          <rect x={x} y="16" width="44" height="78" rx="4" {...pen} />
          <rect x={x + 6} y="22" width="32" height="30" rx="2" {...pen} />
          <line x1={x + 6} y1="60" x2={x + 34} y2="60" {...pen} />
          <line x1={x + 6} y1="67" x2={x + 24} y2="67" {...pen} />
          <rect x={x + 6} y="76" width="20" height="10" rx="5" {...pen} />
        </g>
      ))}
      <g className="sketch-accent">
        <circle cx="172" cy="18" r="11" fill={SUN} stroke={INK} strokeWidth={1.2} />
        <path d="M166 15h2l2 7h6l1.5-5H169" fill="none" stroke={INK} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </>
  );
}

function App() {
  const cols = [0, 1, 2, 3, 4];
  const rows = [0, 1, 2];
  return (
    <>
      <rect x="20" y="12" width="160" height="88" rx="6" {...pen} />
      <line x1="32" y1="24" x2="80" y2="24" {...pen} strokeWidth={3} />
      {cols.map((c) => (
        <line key={c} x1={34 + c * 28} y1="36" x2={46 + c * 28} y2="36" {...pen} />
      ))}
      {rows.map((r) =>
        cols.map((c) => <rect key={`${r}-${c}`} x={30 + c * 28} y={44 + r * 18} width="24" height="13" rx="2" {...pen} />),
      )}
      <g className="sketch-accent">
        <rect x={30 + 2 * 28} y={44 + 18} width="24" height="13" rx="2" fill={SUN} stroke={INK} strokeWidth={1.2} />
        <path d="M92 69l3 3 6-6" fill="none" stroke={INK} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </>
  );
}

function System() {
  return (
    <>
      <rect x="20" y="12" width="100" height="88" rx="6" {...pen} />
      <line x1="20" y1="28" x2="120" y2="28" {...pen} />
      {[40, 52, 64, 76, 88].map((y) => (
        <g key={y}>
          <line x1="30" y1={y} x2="58" y2={y} {...pen} />
          <line x1="70" y1={y} x2="88" y2={y} {...pen} />
          <circle cx="104" cy={y} r="2.5" {...pen} />
        </g>
      ))}
      <line x1="30" y1="20" x2="70" y2="20" {...pen} strokeWidth={3} />
      <rect x="130" y="12" width="50" height="88" rx="6" {...pen} />
      <line x1="138" y1="88" x2="172" y2="88" {...pen} />
      <g className="sketch-accent">
        <rect x="140" y="62" width="7" height="26" fill={SUN} stroke={INK} strokeWidth={1.2} />
        <rect x="151" y="46" width="7" height="42" fill={SUN} stroke={INK} strokeWidth={1.2} />
        <rect x="162" y="30" width="7" height="58" fill={SUN} stroke={INK} strokeWidth={1.2} />
      </g>
    </>
  );
}

const DRAWINGS: Record<string, () => React.ReactElement> = {
  websites: Website,
  shops: Shop,
  apps: App,
  systems: System,
};

/** A small line drawing of each service, drawn on graph paper. */
export function ServiceSketch({ slug, className }: { slug: string; className?: string }) {
  const Drawing = DRAWINGS[slug];
  if (!Drawing) return null;
  return (
    <div className={clsx('bg-graph overflow-hidden rounded-xl border-[1.5px] border-ink', className)}>
      <svg viewBox="0 0 200 112" className="sketch block h-auto w-full" aria-hidden>
        <Drawing />
      </svg>
    </div>
  );
}
