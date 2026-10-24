import { SITE_URL } from '@/lib/site';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon, CheckIcon } from '@heroicons/react/24/outline';
import { services } from '@/content/services';
import { ButtonLink } from '@/components/ui/Button';
import { CallToAction } from '@/components/site/CallToAction';
import { PageHero, Section, SectionHeading } from '@/components/site/Section';
import { Reveal } from '@/components/site/Reveal';
import { ServiceSketch } from '@/components/site/ServiceSketch';

type Props = { params: Promise<{ service: string }> };

// Only the four services exist; anything else is a 404 rather than an empty page.
export const dynamicParams = false;

export function generateStaticParams() {
  return services.map((service) => ({ service: service.path }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { service: path } = await params;
  const service = services.find((s) => s.path === path);
  if (!service) return { title: 'Not found' };
  return {
    title: service.page.title,
    description: service.page.description,
    alternates: { canonical: `/services/${service.path}` },
    openGraph: { title: service.page.title, description: service.page.description, url: `/services/${service.path}` },
  };
}

export default async function ServicePage({ params }: Props) {
  const { service: path } = await params;
  const service = services.find((s) => s.path === path);
  if (!service) notFound();
  const { page } = service;
  const url = `${SITE_URL}/services/${service.path}`;
  const others = services.filter((s) => s.slug !== service.slug);

  // What search engines read: the service, where it sits in the site, and its common questions.
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        name: service.name,
        serviceType: page.title,
        description: page.description,
        url,
        provider: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Services', item: `${SITE_URL}/services` },
          { '@type': 'ListItem', position: 2, name: service.name, item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: page.faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: { '@type': 'Answer', text: faq.answer },
        })),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />

      <PageHero
        tag={`${service.code} · ${service.name}`}
        title={page.heading}
        intro={page.intro}
      >
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <ButtonLink href="/contact" size="lg">
            Start a project
          </ButtonLink>
          <ButtonLink href="/book" size="lg" variant="secondary">
            Book a free call
          </ButtonLink>
        </div>
        <Link
          href="/services"
          className="mt-8 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-label text-muted hover:text-ink"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" aria-hidden /> All services
        </Link>
      </PageHero>

      <Section tone="white">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal>
            <SectionHeading tag="Is this for you?" title="This is for you if…" />
            <dl className="mt-8 grid gap-3 font-mono text-xs">
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 uppercase tracking-label text-muted">Best for</dt>
                <dd className="font-sans text-sm text-ink">{service.bestFor}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-20 shrink-0 uppercase tracking-label text-muted">Timeline</dt>
                <dd className="font-sans text-sm text-ink">{service.timeline}</dd>
              </div>
            </dl>
          </Reveal>
          <Reveal delay={120}>
            <ul className="grid gap-4">
              {page.signs.map((sign) => (
                <li key={sign} className="card flex gap-4 p-5">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sun">
                    <CheckIcon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span className="leading-relaxed">{sign}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </Section>

      <Section>
        <SectionHeading tag="What changes" title="Once it is built." />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {page.outcomes.map((outcome, index) => (
            <Reveal key={outcome.heading} delay={index * 90}>
              <div className="card card-lift h-full p-7">
                <span className="font-mono text-[11px] text-cobalt">{String(index + 1).padStart(2, '0')}</span>
                <h3 className="mt-4 font-display text-2xl font-extrabold tracking-tight">{outcome.heading}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{outcome.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section tone="white">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <Reveal>
            <SectionHeading tag="Included" title="What you get." intro={service.summary} />
          </Reveal>
          <Reveal delay={120} className="card relative p-7 shadow-block">
            <ul className="grid gap-4">
              {service.includes.map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sun">
                    <CheckIcon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  {item}
                </li>
              ))}
              <li className="flex gap-3 text-cobalt">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cobalt text-white">
                  <CheckIcon className="h-3.5 w-3.5" aria-hidden />
                </span>
                Your own project dashboard, start to handover
              </li>
            </ul>
          </Reveal>
        </div>
      </Section>

      <Section>
        <SectionHeading tag="Questions" title="Asked often." />
        <div className="mt-10 grid max-w-3xl gap-3">
          {page.faqs.map((faq) => (
            <details key={faq.question} className="card group p-5 open:shadow-block">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-bold">
                {faq.question}
                <span className="font-mono text-cobalt transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-3 leading-relaxed text-muted">{faq.answer}</p>
            </details>
          ))}
        </div>
      </Section>

      <Section tone="white">
        <SectionHeading tag="Also" title="Other things we build." />
        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {others.map((other) => (
            <Link key={other.slug} href={`/services/${other.path}`} className="card card-lift group flex flex-col p-5 no-underline">
              <ServiceSketch slug={other.slug} />
              <span className="mt-5 font-mono text-[11px] text-cobalt">{other.code}</span>
              <h3 className="mt-2 font-display text-2xl font-extrabold tracking-tight">{other.name}</h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{other.summary}</p>
            </Link>
          ))}
        </div>
      </Section>

      <CallToAction />
    </>
  );
}
