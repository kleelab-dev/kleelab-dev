import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CallToAction } from '@/components/marketing/CallToAction';
import { Prose } from '@/components/marketing/Prose';
import { Eyebrow, Section } from '@/components/marketing/Section';
import { caseStudies, getCaseStudy } from '@/content/work';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return caseStudies.map((study) => ({ slug: study.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const study = getCaseStudy(slug);
  if (!study) return { title: 'Not found' };
  return {
    title: `${study.client} — ${study.title}`,
    description: study.summary,
  };
}

export default async function CaseStudyPage({ params }: Props) {
  const { slug } = await params;
  const study = getCaseStudy(slug);
  if (!study) notFound();

  const index = caseStudies.findIndex((item) => item.slug === study.slug);
  const next = caseStudies[(index + 1) % caseStudies.length];

  return (
    <>
      <div className="mx-auto max-w-content px-6 pt-14 sm:pt-20">
        <Link href="/work" className="font-mono text-xs text-muted hover:text-ink">
          ← All work
        </Link>

        <p className="mt-10 font-mono text-xs uppercase tracking-label text-muted">
          {study.client} · {study.sector} · {study.year}
        </p>

        <h1 className="mt-4 max-w-3xl font-serif text-4xl leading-[1.08] tracking-tight sm:text-5xl">
          {study.title}
        </h1>

        <p className="mt-6 max-w-measure text-lg leading-8 text-muted">{study.summary}</p>
      </div>

      <Section>
        <dl className="grid gap-8 border-y border-line py-8 sm:grid-cols-2">
          {study.results.map((result) => (
            <div key={result.label}>
              <dd className="font-serif text-4xl leading-none tracking-tight">{result.value}</dd>
              <dt className="mt-3 font-mono text-xs uppercase tracking-label text-muted">
                {result.label}
              </dt>
            </div>
          ))}
        </dl>

        <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-16">
          <Prose>
            {study.body.map((section) => (
              <section key={section.heading}>
                <h2>{section.heading}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </section>
            ))}
          </Prose>

          <aside className="lg:pt-1">
            <Eyebrow>Services</Eyebrow>
            <ul className="mt-4 space-y-2">
              {study.services.map((service) => (
                <li key={service} className="text-sm text-ink">
                  {service}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </Section>

      <Section tone="canvas">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Eyebrow>Next case study</Eyebrow>
            <Link href={`/work/${next.slug}`} className="group mt-3 block">
              <span className="font-serif text-3xl leading-tight group-hover:text-accent">
                {next.title}
              </span>
            </Link>
          </div>
          <span className="font-mono text-xs text-muted">{next.client}</span>
        </div>
      </Section>

      <Section>
        <CallToAction
          title="Got something like this?"
          body="If your situation is close to any of these, the fastest way to find out whether we can help is a short call."
          primary={{ href: '/contact', label: 'Talk to the studio' }}
          secondary={{ href: '/work', label: 'See all work' }}
        />
      </Section>
    </>
  );
}
