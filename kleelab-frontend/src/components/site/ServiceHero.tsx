import type { Service } from '@/content/services';
import type { WorkExample } from '@/content/work';
import { ExampleShot } from '@/components/site/ExampleShot';

/** Which example window stands for each service. */
const SHOT_FOR: Record<string, WorkExample['shot']> = {
  websites: 'site',
  shops: 'shop',
  apps: 'portal',
  systems: 'tracker',
};

/** The right-hand hero column on a service page: an example project, its usual timeline and the fixed-price stamp. */
export function ServiceHero({ service }: { service: Service }) {
  const shot = SHOT_FOR[service.slug] ?? 'site';
  return (
    <figure aria-label={`Example project for ${service.name.toLowerCase()}`} className="bg-graph relative rounded-2xl border-[1.5px] border-ink p-5 shadow-block sm:p-8">
      <div aria-hidden>
        <ExampleShot shot={shot} size="lg" url="example.com" />
        <div className="dim static mt-6">{service.timeline.replace(/\.$/, '')}</div>
        <span className="stamp kl-stamp-in absolute -top-3 right-4 bg-white sm:right-6">Fixed price</span>
        <span className="absolute -top-3 left-4 rounded-full border-[1.5px] border-ink bg-white px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-muted sm:left-6">
          Example
        </span>
      </div>
    </figure>
  );
}
