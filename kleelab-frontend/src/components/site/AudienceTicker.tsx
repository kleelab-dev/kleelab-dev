const AUDIENCES = ['Start-ups', 'Charities', 'Clinics', 'Schools', 'Shops', 'Agencies', 'Councils', 'Co-ops', 'Studios', 'Trades'];

function Copy({ n }: { n: 1 | 2 }) {
  return (
    <ul data-copy={n} aria-hidden={n === 2 || undefined} className="flex shrink-0 items-center gap-x-8 pr-8">
      {AUDIENCES.map((audience) => (
        <li key={audience} className="flex items-center gap-8 whitespace-nowrap text-paper/85">
          {audience}
          <span aria-hidden className="text-sun">
            ✦
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The "Built for" strip under the hero: a slow ticker that pauses on hover. */
export function AudienceTicker() {
  return (
    <div className="flex items-center overflow-hidden border-y-[1.5px] border-ink bg-ink py-4 font-mono text-xs uppercase tracking-label text-paper">
      <span className="relative z-10 shrink-0 bg-ink pl-5 pr-6 text-sun sm:pl-8">Built for</span>
      <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]">
        <div className="marquee flex w-max">
          <Copy n={1} />
          <Copy n={2} />
        </div>
      </div>
    </div>
  );
}
