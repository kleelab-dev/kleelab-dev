import type { Metadata } from 'next';
import { CheckIcon } from '@heroicons/react/24/outline';
import { addOns, pricingModel, services } from '@/content/services';
import { ButtonLink } from '@/components/ui/Button';
import { CallToAction } from '@/components/site/CallToAction';
import { PageHero, Section, SectionHeading } from '@/components/site/Section';
import { Reveal } from '@/components/site/Reveal';
import { ServiceSketch } from '@/components/site/ServiceSketch';

export const metadata: Metadata = {
  title: 'Website design and development services',
  description: 'Websites, online shops, web apps and internal systems, plus optional deployment, hosting and maintenance.',
  alternates: { canonical: '/services' },
};

export default function ServicesPage() {
  return (
    <>
      <PageHero
        tag="Services"
        title={
          <>
            We build it. <span className="mark">You</span> run the show.
          </>
        }
        intro="Four kinds of thing we build, and three ways we can look after them afterwards. Every project comes with a client dashboard as standard."
      />

      <Section tone="white">
        {/* Open rows split by a rule, not a stack of boxed cards: the page read as four cages. */}
        <div className="grid">
          {services.map((service) => (
            <article
              id={service.slug}
              key={service.slug}
              className="grid scroll-mt-24 gap-10 border-t-[1.5px] border-line py-14 first:border-t-0 first:pt-0 last:pb-0 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16"
            >
              <Reveal>
                <span className="font-mono text-xs text-cobalt">
                  {service.code} / {String(services.length).padStart(2, '0')}
                </span>
                <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tightest sm:text-5xl">{service.name}</h2>
                <p className="mt-4 max-w-md text-lg leading-relaxed text-muted">{service.summary}</p>
                <dl className="mt-6 grid gap-3 font-mono text-xs">
                  <div className="flex gap-3">
                    <dt className="w-20 shrink-0 uppercase tracking-label text-muted">Best for</dt>
                    <dd className="font-sans text-sm text-ink">{service.bestFor}</dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="w-20 shrink-0 uppercase tracking-label text-muted">Timeline</dt>
                    <dd className="font-sans text-sm text-ink">{service.timeline}</dd>
                  </div>
                </dl>
                <ButtonLink href={`/services/${service.path}`} variant="secondary" className="mt-8">
                  More about {service.name.toLowerCase()}
                </ButtonLink>
              </Reveal>
              <Reveal delay={120}>
                <ServiceSketch slug={service.slug} className="max-w-md" />
                <p className="mt-8 font-mono text-[11px] uppercase tracking-label text-muted">What is included</p>
                <ul className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                  {service.includes.map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-relaxed">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sun">
                        <CheckIcon className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      {item}
                    </li>
                  ))}
                  <li className="flex gap-3 text-sm leading-relaxed text-cobalt">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cobalt text-white">
                      <CheckIcon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    Your own project dashboard, start to handover
                  </li>
                </ul>
              </Reveal>
            </article>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeading
          tag="Optional extras"
          title="Deploy, host, maintain."
          intro="Add any of these to a project, or ask for them on their own for a site you already have."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {addOns.map((addOn, index) => (
            <Reveal key={addOn.slug} delay={index * 90}>
              <div className="card card-lift h-full p-7">
                <span className="font-mono text-[11px] text-cobalt">{addOn.code}</span>
                <h3 className="mt-4 font-display text-2xl font-extrabold tracking-tight">{addOn.name}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{addOn.summary}</p>
                <ul className="mt-5 grid gap-2 border-t border-line pt-5 text-sm">
                  {addOn.includes.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="text-cobalt" aria-hidden>→</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
        <ButtonLink href="/care" variant="secondary" className="mt-10">
          More about care plans
        </ButtonLink>
      </Section>

      <Section tone="white">
        <SectionHeading tag="Pricing" title="Clear numbers, agreed up front." />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {pricingModel.map((item, index) => (
            <Reveal key={item.heading} delay={index * 90}>
              <div className="card-lift h-full rounded-2xl border-[1.5px] border-dashed border-ink bg-paper p-6">
                <span className="font-mono text-xs text-cobalt">{String(index + 1).padStart(2, '0')}</span>
                <h3 className="mt-3 font-display text-xl font-bold">{item.heading}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <CallToAction />
    </>
  );
}
