import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRightIcon } from '@heroicons/react/24/outline';
import { addOns, services } from '@/content/services';
import { workExamples } from '@/content/work';
import { ButtonLink } from '@/components/ui/Button';
import { AskButton } from '@/components/site/AskButton';
import { AudienceTicker } from '@/components/site/AudienceTicker';
import { CallToAction } from '@/components/site/CallToAction';
import { DashboardShowcase } from '@/components/site/DashboardShowcase';
import { ExampleShot } from '@/components/site/ExampleShot';
import { ProcessTimeline } from '@/components/site/ProcessTimeline';
import { PortfolioSlider } from '@/components/site/PortfolioSlider';
import { ProjectPreview } from '@/components/site/ProjectPreview';
import { Reveal } from '@/components/site/Reveal';
import { Section, SectionHeading } from '@/components/site/Section';
import { ServiceSketch } from '@/components/site/ServiceSketch';
import { getPortfolio } from '@/lib/portfolio';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

/** Facts already promised elsewhere on the site, pulled out as big numbers. */
const PROMISES = [
  { figure: '1 day', label: 'to hear back from us after you get in touch' },
  { figure: 'Fixed', label: 'price, in writing, before any work starts' },
  { figure: '3–6 wks', label: 'for a typical website, with dates agreed up front' },
  { figure: '100%', label: 'yours at hand-over: code, accounts and domain' },
];

const FAQS = [
  {
    q: 'How do I start a project?',
    a: 'Click Start a project and tell us in a few lines what you need. We reply within one working day to set up a free 30-minute call. After the call we send you a written plan with dates and a fixed price. Once you approve it, the work starts and your dashboard opens the same day.',
  },
  {
    q: 'How do I sign up for the dashboard?',
    a: 'You do not need to sign up. When your project starts, we create your account and email you a link to choose a password. After that, sign in any time with Client login at the top of this page. If the link has run out or you forget your password, use Forgot it? on the sign-in page, or just ask us.',
  },
  {
    q: 'How much does a project cost?',
    a: 'It depends on what you need, so we give you a price after a short, free first call. You get a fixed price in writing before any work starts.',
  },
  {
    q: 'How long does it take?',
    a: 'A website is usually three to six weeks. Apps and systems take longer. We agree dates up front and you can watch progress on your dashboard.',
  },
  {
    q: 'Do we own it at the end?',
    a: 'Yes. Code, accounts, domain and documentation are handed over to you. You can pay us monthly to look after it, or run it yourselves.',
  },
  {
    q: 'We are not technical. Is that a problem?',
    a: 'Not at all. Most of our clients are not. We explain things in plain words. We only ask you to make decisions, never to understand the technical side.',
  },
];

export default async function HomePage() {
  // The API sends featured items first, so the first eight are the ones to show.
  const portfolio = (await getPortfolio()).slice(0, 8);

  return (
    <>
      <section className="px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-20">
        <div className="mx-auto grid max-w-content items-center gap-14 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <p className="tag">Websites · shops · apps · systems</p>
            <h1 className="mt-6 font-display text-[clamp(2.75rem,7vw,5.25rem)] font-extrabold leading-[0.95] tracking-tightest">
              We build it. <span className="mark">You see</span> every step.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
              Tell us what you need. We design it, build it and put it online. You follow along on your own
              dashboard, and when it is finished, it is all yours.
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
              </AskButton>{' '}
              or{' '}
              <Link href="/book" className="font-semibold text-cobalt underline underline-offset-4">
                book a free call
              </Link>
              .
            </p>
          </div>
          <ProjectPreview className="lg:ml-6" />
        </div>
      </section>

      <AudienceTicker />

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
          {services.map((service, index) => (
            <Reveal key={service.slug} delay={index * 90} className="flex">
              <Link href={`/services#${service.slug}`} className="card card-lift group flex flex-1 flex-col p-5 no-underline">
                <ServiceSketch slug={service.slug} />
                <span className="mt-5 font-mono text-[11px] text-cobalt">{service.code}</span>
                <h3 className="mt-2 font-display text-2xl font-extrabold tracking-tight">{service.name}</h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{service.summary}</p>
                <span className="mt-6 font-mono text-[11px] uppercase tracking-label text-ink group-hover:text-cobalt">
                  {service.timeline} →
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      {portfolio.length > 0 && (
        <Section className="overflow-hidden">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <SectionHeading
              tag="From our portfolio"
              title={
                <>
                  Real sites. <span className="mark">Some are ready</span> for you.
                </>
              }
            />
            <ButtonLink href="/portfolio" variant="secondary">
              See the whole portfolio
            </ButtonLink>
          </div>
          <PortfolioSlider items={portfolio} />
        </Section>
      )}

      <Section tone="white">
        <SectionHeading
          tag="How we build"
          title="Six steps. You always know where we are."
          intro="Every project follows the same route, and each step ends with something you can see and approve."
        />
        <ProcessTimeline />
        <div className="mt-12">
          <ButtonLink href="/how-we-build" variant="secondary">
            See each step in detail <ArrowRightIcon className="h-4 w-4" />
          </ButtonLink>
        </div>
      </Section>

      <section className="border-b-[1.5px] border-ink bg-sun px-5 py-12 sm:px-8">
        <dl className="mx-auto grid max-w-content gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {PROMISES.map((promise, index) => (
            <Reveal key={promise.figure} delay={index * 80} className="border-l-[1.5px] border-ink pl-5">
              <dt className="font-display text-5xl font-extrabold tracking-tightest">{promise.figure}</dt>
              <dd className="mt-2 max-w-[22ch] text-sm leading-snug text-ink/80">{promise.label}</dd>
            </Reveal>
          ))}
        </dl>
      </section>

      <Section tone="ink">
        <SectionHeading
          inverted
          tag="Your client dashboard"
          title={
            <>
              No more <span className="mark text-ink">“any update?”</span> emails.
            </>
          }
          intro="The moment your project starts you get a private dashboard. It is the one place where we tell you how things are going, ask you questions and get your approval."
        />
        <DashboardShowcase />
      </Section>

      <Section>
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <SectionHeading
            tag="The kind of thing we build"
            title={
              <>
                Real problems, <span className="mark">tidy</span> tools.
              </>
            }
            intro="Case studies are on their way as projects are handed over. These are the shapes of project we take on most often."
          />
          <ButtonLink href="/work" variant="secondary">
            See more examples
          </ButtonLink>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {workExamples.slice(0, 3).map((example, index) => (
            <Reveal key={example.code} delay={index * 90} className="flex">
              <Link href="/work" className="card card-lift flex flex-1 flex-col p-5 no-underline">
                <ExampleShot shot={example.shot} />
                <span className="mt-5 font-mono text-[11px] uppercase tracking-label text-muted">Example · {example.sector}</span>
                <h3 className="mt-2 font-display text-xl font-extrabold tracking-tight">{example.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{example.body}</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section tone="white">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <SectionHeading
            tag="Optional extras"
            title="Going live is not the end."
            intro="Look after it yourselves, or let us put it online, host it and keep it running well. Add any of these during the project or later."
          />
          <ButtonLink href="/care" variant="secondary">
            Monthly care
          </ButtonLink>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {addOns.map((addOn, index) => (
            <Reveal key={addOn.slug} delay={index * 90} className="flex">
              <div className={index === 1 ? 'card card-lift flex-1 bg-sun p-7 shadow-block' : 'card card-lift flex-1 p-7'}>
                <span className="font-mono text-[11px] text-cobalt">{addOn.code}</span>
                <h3 className="mt-4 font-display text-2xl font-extrabold tracking-tight">{addOn.name}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink/75">{addOn.summary}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <SectionHeading tag="Questions" title="Common questions" />
            <p className="mt-5 max-w-sm leading-relaxed text-muted">
              Something else on your mind? Our assistant knows how we work and can answer most questions straight away.
            </p>
            <AskButton className="mt-6" variant="sun">
              Ask the assistant
            </AskButton>
          </div>
          <div className="divide-y-[1.5px] divide-ink border-y-[1.5px] border-ink">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-xl font-bold transition-colors hover:text-cobalt">
                  {faq.q}
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-[1.5px] border-ink font-mono text-sm transition-[transform,background-color] duration-300 group-open:rotate-45 group-open:bg-sun">
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
