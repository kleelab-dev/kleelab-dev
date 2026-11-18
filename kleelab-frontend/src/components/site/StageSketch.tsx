import { clsx } from 'clsx';
import { COBALT, INK, SUN, pen } from '@/components/site/ServiceSketch';

const accent = { fill: SUN, stroke: INK, strokeWidth: 1.2, strokeLinejoin: 'round' } as const;
const inkPen = { fill: 'none', stroke: INK, strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** Sticky notes on the wall, and an arrow to the written plan. */
function Planning() {
  return (
    <>
      {[
        [22, 18, -4],
        [58, 22, 3],
        [30, 56, 2],
        [66, 60, -3],
      ].map(([x, y, r], i) => (
        <g key={i} transform={`rotate(${r} ${x + 15} ${y + 15})`}>
          <rect x={x} y={y} width="30" height="30" rx="2" {...(i === 1 ? accent : pen)} />
          <line x1={x + 6} y1={y + 11} x2={x + 22} y2={y + 11} {...(i === 1 ? inkPen : pen)} />
          <line x1={x + 6} y1={y + 18} x2={x + 18} y2={y + 18} {...(i === 1 ? inkPen : pen)} />
        </g>
      ))}
      <path d="M106 56 C 116 48, 124 48, 134 56" {...pen} />
      <path d="M128 50 L 134 56 L 127 60" {...pen} />
      <rect x="142" y="18" width="40" height="76" rx="3" {...pen} />
      {[32, 42, 52, 62, 72].map((y) => (
        <line key={y} x1="150" y1={y} x2={y % 20 ? 174 : 166} y2={y} {...pen} />
      ))}
    </>
  );
}

/** A wireframe with a colour swatch beside it. */
function Design() {
  return (
    <>
      <rect x="18" y="14" width="112" height="84" rx="4" {...pen} strokeDasharray="4 3" />
      <rect x="28" y="24" width="92" height="26" rx="2" {...pen} />
      <line x1="28" y1="24" x2="120" y2="50" {...pen} />
      <line x1="120" y1="24" x2="28" y2="50" {...pen} />
      {[28, 60, 92].map((x) => (
        <rect key={x} x={x} y="60" width="28" height="28" rx="2" {...pen} />
      ))}
      <rect x="146" y="20" width="36" height="72" rx="4" {...pen} />
      <rect x="152" y="26" width="24" height="18" rx="2" fill={COBALT} stroke={INK} strokeWidth={1.2} />
      <rect x="152" y="48" width="24" height="18" rx="2" {...accent} />
      <rect x="152" y="70" width="24" height="16" rx="2" {...pen} />
    </>
  );
}

/** Code brackets, and the component tree they make. */
function Build() {
  return (
    <>
      <path d="M38 30 L 20 56 L 38 82" {...pen} strokeWidth={2.4} />
      <path d="M70 30 L 88 56 L 70 82" {...pen} strokeWidth={2.4} />
      <line x1="60" y1="28" x2="48" y2="84" {...pen} strokeWidth={2.4} />
      <rect x="128" y="14" width="34" height="16" rx="3" {...accent} />
      <path d="M145 30 V 42 M 118 42 H 172 M 118 42 V 54 M 172 42 V 54 M 145 42 V 54" {...pen} />
      {[104, 132, 160].map((x) => (
        <rect key={x} x={x} y="54" width="26" height="14" rx="3" {...pen} />
      ))}
      <path d="M117 68 V 80 M 106 80 H 128 M 106 80 V 86 M 128 80 V 86" {...pen} />
      <rect x="98" y="86" width="16" height="10" rx="2" {...pen} />
      <rect x="120" y="86" width="16" height="10" rx="2" {...pen} />
    </>
  );
}

/** A phone and a laptop showing the same screen, with a tick. */
function Testing() {
  return (
    <>
      <rect x="20" y="20" width="96" height="60" rx="4" {...pen} />
      <path d="M10 88 H 126 L 120 80 H 16 Z" {...pen} />
      <line x1="30" y1="32" x2="70" y2="32" {...pen} strokeWidth={3} />
      <rect x="30" y="42" width="34" height="28" rx="2" {...pen} />
      <rect x="72" y="42" width="34" height="28" rx="2" {...pen} />
      <rect x="138" y="28" width="34" height="64" rx="6" {...pen} />
      <line x1="150" y1="34" x2="160" y2="34" {...pen} />
      <rect x="144" y="42" width="22" height="18" rx="2" {...pen} />
      <rect x="144" y="64" width="22" height="18" rx="2" {...pen} />
      <g className="sketch-accent">
        <circle cx="172" cy="24" r="11" {...accent} />
        <path d="M167 24l3.5 3.5 6-7" {...inkPen} />
      </g>
    </>
  );
}

/** A switch flipped to LIVE. */
function GoingLive() {
  return (
    <>
      <rect x="40" y="38" width="88" height="36" rx="18" fill={COBALT} stroke={INK} strokeWidth={1.4} />
      <circle cx="110" cy="56" r="14" {...accent} />
      <text x="54" y="60" fontFamily="var(--font-mono), monospace" fontSize="11" fontWeight="700" fill="white" letterSpacing="1">
        LIVE
      </text>
      <path d="M140 40 l 10 -8 M 144 56 h 14 M 140 72 l 10 8" {...pen} />
      <path d="M30 40 l -10 -8 M 26 56 h -12 M 30 72 l -10 8" {...pen} />
      <line x1="20" y1="96" x2="180" y2="96" {...pen} strokeDasharray="4 5" />
      <text x="58" y="26" fontFamily="var(--font-mono), monospace" fontSize="8" fill={COBALT} letterSpacing="1">
        OFF · ON
      </text>
    </>
  );
}

/** A key resting on a folder. */
function HandOver() {
  return (
    <>
      <path d="M24 32 H 66 L 74 40 H 150 V 96 H 24 Z" {...pen} />
      <line x1="24" y1="48" x2="150" y2="48" {...pen} />
      {[62, 72, 82].map((y) => (
        <line key={y} x1="36" y1={y} x2={y === 82 ? 70 : 90} y2={y} {...pen} />
      ))}
      <g className="sketch-accent">
        <g transform="rotate(-20 150 62)">
          <circle cx="128" cy="62" r="12" {...accent} />
          <circle cx="128" cy="62" r="4" fill="white" stroke={INK} strokeWidth={1.2} />
          <path d="M140 62 H 184 M 172 62 V 72 M 180 62 V 70" {...inkPen} strokeWidth={2.2} />
        </g>
      </g>
    </>
  );
}

const DRAWINGS: Record<string, () => React.ReactElement> = {
  Planning,
  Design,
  Build,
  Testing,
  'Going live': GoingLive,
  'Hand-over': HandOver,
};

/** A small line drawing for one stage of the build, keyed by the stage name in `processStages`. */
export function StageSketch({ stage, className }: { stage: string; className?: string }) {
  const Drawing = DRAWINGS[stage];
  if (!Drawing) return null;
  return (
    <div className={clsx('bg-graph overflow-hidden rounded-xl border-[1.5px] border-ink', className)}>
      <svg viewBox="0 0 200 112" className="sketch block h-auto w-full" aria-hidden>
        <Drawing />
      </svg>
    </div>
  );
}
