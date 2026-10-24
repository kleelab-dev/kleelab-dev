import type { Metadata } from 'next';
import { CheckIcon } from '@heroicons/react/24/outline';
import { addOns } from '@/content/services';
import { AskButton } from '@/components/site/AskButton';
import { CallToAction } from '@/components/site/CallToAction';
import { PageHero, Section, SectionHeading } from '@/components/site/Section';
import { Reveal } from '@/components/site/Reveal';

export const metadata: Metadata = {
  title: 'Care plans: website hosting and maintenance',
  description: 'Deployment, managed hosting and maintenance for the sites and systems we build, or ones you already have.',
  alternates: { canonical: '/care' },
};

const STEPS = [
  { title: 'Ask', body: 'Request a care plan from your dashboard, or get in touch if we did not build your site.' },
  { title: 'Health check', body: 'We review what you have, fix anything urgent and agree what the plan covers.' },
  { title: 'We look after it', body: 'Updates, backups and monitoring run quietly. Changes go through your dashboard.' },
  { title: 'Monthly report', body: 'What we did, what we found and anything worth planning for.' },
];

export default function CarePage() {
  return (
    <>
      <PageHero
        tag="Care plans"
        title={
          <>
            We keep it <span className="mark">running.</span> You keep it yours.
          </>
        }
        intro="Optional services for after launch. Pick one, two or all three, add them to any project, or bring us a site somebody else built."
      >
        <div className="mt-8">
          <AskButton question="What would a care plan include for us?" variant="sun" size="lg">
            Ask what a plan would cover
          </AskButton>
        </div>
      </PageHero>

      <Section tone="white">
        <div className="grid gap-6 lg:grid-cols-3">
          {addOns.map((addOn, index) => (
            <Reveal key={addOn.slug} delay={index * 90}>
              <article className={index === 1 ? 'card card-lift relative h-full bg-sun p-8 shadow-block' : 'card card-lift relative h-full p-8'}>
                {index === 1 && <span className="stamp kl-stamp-in absolute -top-3 right-5 bg-white">Most asked for</span>}
                <span className="font-mono text-[11px] text-cobalt">{addOn.code}</span>
                <h2 className="mt-4 font-display text-3xl font-extrabold tracking-tight">{addOn.name}</h2>
                <p className="mt-3 leading-relaxed text-ink/75">{addOn.summary}</p>
                <ul className="mt-6 grid gap-3 border-t-[1.5px] border-ink pt-6">
                  {addOn.includes.map((item) => (
                    <li key={item} className="flex gap-3 text-sm">
                      <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-cobalt" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            </Reveal>
          ))}
        </div>
        <p className="mt-8 font-mono text-xs uppercase tracking-label text-muted">
          Billed monthly · cancel with a month of notice · we help you move if you leave
        </p>
      </Section>

      <Section>
        <SectionHeading tag="How it works" title="Four steps, then nothing to think about." />
        <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <Reveal as="li" key={step.title} delay={index * 90}>
              <div className="card card-lift h-full p-6">
                <span className="grid h-9 w-9 place-items-center rounded-full border-[1.5px] border-ink bg-sun font-mono text-xs">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-display text-xl font-bold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </Section>

      <CallToAction title="Need a hand with a site you already have?" body="Tell us what it runs on and what is bothering you. We will take a look and suggest the smallest plan that fixes it." />
    </>
  );
}
