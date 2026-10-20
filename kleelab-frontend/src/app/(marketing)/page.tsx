import Link from 'next/link';
import {
  ArrowRightIcon,
  ChatBubbleLeftEllipsisIcon,
  CheckBadgeIcon,
  DocumentTextIcon,
  MapIcon,
  PlusCircleIcon,
} from '@heroicons/react/24/outline';
import { processStages } from '@/content/site';
import { addOns, services } from '@/content/services';
import { ButtonLink } from '@/components/ui/Button';
import { AskButton } from '@/components/site/AskButton';
import { CallToAction } from '@/components/site/CallToAction';
import { ProjectPreview } from '@/components/site/ProjectPreview';
import { Section, SectionHeading } from '@/components/site/Section';

const AUDIENCES = ['Start-ups', 'Charities', 'Clinics', 'Schools', 'Shops', 'Agencies', 'Councils', 'Co-ops', 'Studios', 'Trades'];

const DASHBOARD_FEATURES = [
  { icon: MapIcon, title: 'The whole map', body: 'Every step from the first call to hand-over, with where we are right now and what comes next.' },
  { icon: ChatBubbleLeftEllipsisIcon, title: 'Updates and messages', body: 'Progress notes from the team and a thread for your questions, all in one place instead of your inbox.' },
  { icon: CheckBadgeIcon, title: 'Approvals in writing', body: 'Approve a design or ask for changes with one click. Every decision is recorded, so nobody has to remember.' },
  { icon: DocumentTextIcon, title: 'Links and files', body: 'Preview links, prototypes and documents attached to the update they belong to.' },
  { icon: PlusCircleIcon, title: 'Add services any time', body: 'Ask us to deploy, host or look after it with a click, whenever you are ready.' },
];

const FAQS = [
  {
    q: 'How much does a project cost?',
    a: 'It depends on what you need, so we quote after a short, free discovery call. You get a fixed price in writing before any work starts.',
  },
  {
    q: 'How long does it take?',
    a: 'A website is usually three to six weeks. Apps and systems take longer. We agree dates up front and you can watch progress on your dashboard.',
  },
  {
    q: 'Do we own it at the end?',
    a: 'Yes. Code, accounts, domain and documentation are handed over to you. You can keep us on a care plan, or run it yourselves.',
  },
  {
    q: 'We are not technical. Is that a problem?',
    a: 'Not at all. Most of our clients are not. We explain things in plain words and only ask you for decisions, never for jargon.',
  },
];

export default function HomePage() {
  return (
    <>
      <section className="px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-20">
        <div className="mx-auto grid max-w-content items-center gap-14 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <p className="tag">Websites · systems · handover</p>
            <h1 className="mt-6 font-display text-[clamp(2.75rem,7vw,5.25rem)] font-extrabold leading-[0.95] tracking-tightest">
              Your system, <span className="mark">drawn up</span> and built in the open.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
              Tell us what you need. We design it, build it and ship it, and you follow every step from your own
              dashboard until the keys are yours.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/contact" size="lg">
                Start a project <ArrowRightIcon className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/how-we-build" variant="secondary" size="lg">
                See how we build
              </ButtonLink>
            </div>
            <p className="mt-6 text-sm text-muted">
              Just curious?{' '}
              <AskButton variant="ghost" size="sm" className="!px-1 text-cobalt underline underline-offset-4">
                Ask the assistant
              </AskButton>
            </p>
          </div>
          <ProjectPreview className="lg:ml-6" />
        </div>
      </section>

      <div className="overflow-hidden border-y-[1.5px] border-ink bg-ink py-4 text-paper">
        <ul className="mx-auto flex max-w-content flex-wrap justify-center gap-x-8 gap-y-2 px-5 font-mono text-xs uppercase tracking-label">
          <li className="text-sun">Built for</li>
          {AUDIENCES.map((audience) => (
            <li key={audience} className="text-paper/80">
              {audience}
            </li>
          ))}
        </ul>
      </div>

      <Section>
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <SectionHeading
            tag="What we build"
            title={
              <>
                From a five-page site to the <span className="mark">system</span> that runs your week.
              </>
            }
          />
          <ButtonLink href="/services" variant="secondary">
            All services
          </ButtonLink>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service) => (
            <Link
              key={service.slug}
              href={`/services#${service.slug}`}
              className="card group flex flex-col p-6 no-underline transition-[transform,box-shadow] hover:-translate-y-1 hover:shadow-block"
            >
              <span className="font-mono text-[11px] text-cobalt">{service.code}</span>
              <h3 className="mt-4 font-display text-2xl font-extrabold tracking-tight">{service.name}</h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{service.summary}</p>
              <span className="mt-6 font-mono text-[11px] uppercase tracking-label text-ink group-hover:text-cobalt">
                {service.timeline} →
              </span>
            </Link>
          ))}
        </div>
      </Section>

      <Section tone="white">
        <SectionHeading
          tag="How we build"
          title="Six steps. No mystery in between."
          intro="Every project follows the same route, and each step ends with something you can see and approve."
        />
        <ol className="mt-14 grid gap-px overflow-hidden rounded-2xl border-[1.5px] border-ink bg-ink sm:grid-cols-2 lg:grid-cols-3">
          {processStages.map((stage, index) => (
            <li key={stage.name} className="bg-white p-6 sm:p-7">
              <div className="flex items-center justify-between">
                <span className="grid h-9 w-9 place-items-center rounded-full border-[1.5px] border-ink font-mono text-xs">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {index === 0 && <span className="font-mono text-[10px] uppercase tracking-label text-cobalt">free call first</span>}
                {index === processStages.length - 1 && <span className="font-mono text-[10px] uppercase tracking-label text-cobalt">keys handed over</span>}
              </div>
              <h3 className="mt-5 font-display text-xl font-extrabold tracking-tight">{stage.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{stage.short}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10">
          <ButtonLink href="/how-we-build" variant="secondary">
            The process in detail <ArrowRightIcon className="h-4 w-4" />
          </ButtonLink>
        </div>
      </Section>

      <Section tone="ink">
        <div className="grid gap-14 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <SectionHeading
            inverted
            tag="Your client dashboard"
            title={
              <>
                No more <span className="mark text-ink">“any update?”</span> emails.
              </>
            }
            intro="The moment your project starts you get a private dashboard. It is the single place where we report progress, ask questions and get your approval."
          />
          <ul className="grid gap-4 sm:grid-cols-2">
            {DASHBOARD_FEATURES.map((feature) => (
              <li key={feature.title} className="rounded-2xl border-[1.5px] border-paper/20 p-5">
                <feature.icon className="h-6 w-6 text-sun" aria-hidden />
                <h3 className="mt-4 font-display text-lg font-bold">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-paper/70">{feature.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section>
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <SectionHeading
            tag="Optional extras"
            title="Launched is not finished."
            intro="Take it from here yourselves, or let us deploy it, host it and keep it healthy. Add any of these during the project or long after."
          />
          <ButtonLink href="/care" variant="secondary">
            Care plans
          </ButtonLink>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {addOns.map((addOn, index) => (
            <div key={addOn.slug} className={index === 1 ? 'card bg-sun p-7 shadow-block' : 'card p-7'}>
              <span className="font-mono text-[11px] text-cobalt">{addOn.code}</span>
              <h3 className="mt-4 font-display text-2xl font-extrabold tracking-tight">{addOn.name}</h3>
              <p className="mt-3 text-sm leading-relaxed text-ink/75">{addOn.summary}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="white">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <SectionHeading tag="Questions" title="Asked a lot." />
            <p className="mt-5 max-w-sm leading-relaxed text-muted">
              Something else on your mind? The assistant knows how we work and can answer most things straight away.
            </p>
            <AskButton className="mt-6" variant="sun">
              Ask the assistant
            </AskButton>
          </div>
          <div className="divide-y-[1.5px] divide-ink border-y-[1.5px] border-ink">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-xl font-bold">
                  {faq.q}
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-[1.5px] border-ink font-mono text-sm transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-measure leading-relaxed text-muted">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </Section>

      <CallToAction />
    </>
  );
}
