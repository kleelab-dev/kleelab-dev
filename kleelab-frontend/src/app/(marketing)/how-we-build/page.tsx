import type { Metadata } from 'next';
import { processStages } from '@/content/site';
import { CallToAction } from '@/components/site/CallToAction';
import { PageHero, Section, SectionHeading } from '@/components/site/Section';

export const metadata: Metadata = {
  title: 'How we build',
  description: 'Six steps from the first call to hand-over, each one visible and approved on your client dashboard.',
};

const PRINCIPLES = [
  { title: 'Show, do not tell', body: 'You see working software early and often, on a private preview link, not a slide deck at the end.' },
  { title: 'Decisions in writing', body: 'Every approval lives on your dashboard with a date and a name, so scope never drifts quietly.' },
  { title: 'Plain words', body: 'We explain trade-offs without jargon and only ask you for the decisions that are yours to make.' },
  { title: 'Built to hand over', body: 'Clean code, real documentation and accounts in your name, so you are never locked in to us.' },
];

export default function HowWeBuildPage() {
  return (
    <>
      <PageHero
        tag="How we build"
        title={
          <>
            Built in the open, <span className="mark">step by step.</span>
          </>
        }
        intro="Six steps, the same every time. Your dashboard shows exactly where we are, what we need from you and what is coming next."
      />

      <Section tone="white">
        <ol className="relative grid gap-10 before:absolute before:bottom-6 before:left-[19px] before:top-6 before:w-[1.5px] before:bg-ink sm:before:left-[23px]">
          {processStages.map((stage, index) => (
            <li key={stage.name} className="relative grid gap-6 pl-14 sm:pl-20 lg:grid-cols-[1.1fr_0.9fr]">
              <span className="absolute left-0 top-0 grid h-10 w-10 place-items-center rounded-full border-[1.5px] border-ink bg-sun font-mono text-sm font-semibold sm:h-12 sm:w-12">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{stage.name}</h2>
                <p className="mt-3 text-lg font-medium">{stage.short}</p>
                <p className="mt-3 max-w-measure leading-relaxed text-muted">{stage.detail}</p>
              </div>
              <div className="self-start rounded-2xl border-[1.5px] border-dashed border-cobalt bg-cobalt-soft p-5">
                <p className="font-mono text-[11px] uppercase tracking-label text-cobalt">Your part</p>
                <p className="mt-2 text-sm leading-relaxed">{stage.youDo}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section>
        <SectionHeading tag="Principles" title="How we behave along the way." />
        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {PRINCIPLES.map((principle, index) => (
            <div key={principle.title} className="card p-7">
              <span className="font-mono text-xs text-cobalt">P-{String(index + 1).padStart(2, '0')}</span>
              <h3 className="mt-3 font-display text-2xl font-extrabold tracking-tight">{principle.title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{principle.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <CallToAction title="Want to see it from the inside?" body="Start a project and your dashboard is ready the same day. The first call is free, so it costs nothing to find out." />
    </>
  );
}
