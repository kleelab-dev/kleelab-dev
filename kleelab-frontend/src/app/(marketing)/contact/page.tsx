import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactForm } from '@/components/marketing/ContactForm';
import { Eyebrow, PageHeader, Section } from '@/components/marketing/Section';
import { studio } from '@/content/site';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Tell KleeLab about your project. We reply within two working days, and the first call is at no charge.',
};

export default function ContactPage() {
  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="Tell us what you are building."
        lead="A sentence or two is enough to start. We read everything ourselves and reply within two working days."
      />

      <Section>
        <div className="grid gap-14 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:gap-16">
          <ContactForm />

          <aside className="space-y-8 lg:border-l lg:border-line lg:pl-12">
            <div>
              <Eyebrow>Direct</Eyebrow>
              <ul className="mt-4 space-y-2 text-sm">
                <li>
                  <a href={`mailto:${studio.email}`} className="text-accent underline underline-offset-2">
                    {studio.email}
                  </a>
                </li>
                <li>
                  <a href={`tel:${studio.phone.replace(/\s/g, '')}`} className="text-ink hover:text-accent">
                    {studio.phone}
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <Eyebrow>Studio</Eyebrow>
              <p className="mt-4 text-sm leading-6 text-muted">{studio.location}</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                We work remotely with clients elsewhere, and meet in person when it is useful.
              </p>
            </div>

            <div>
              <Eyebrow>What happens next</Eyebrow>
              <ol className="mt-4 space-y-3 text-sm leading-6 text-muted">
                <li>We read your message and reply within two working days.</li>
                <li>If it looks like a fit, we book thirty minutes to talk it through.</li>
                <li>You get a written scope and a fixed price before anything starts.</li>
              </ol>
            </div>

            <div className="rounded-xl border border-line bg-canvas p-5">
              <p className="text-sm leading-6 text-ink">
                Just want to try it yourself?
              </p>
              <p className="mt-2 text-sm leading-6 text-muted">
                The builder is free and needs no account to start.
              </p>
              <Link
                href="/builder/new"
                className="mt-4 inline-block rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink-soft"
              >
                Open the builder
              </Link>
            </div>
          </aside>
        </div>
      </Section>

      {/* TODO: replace with the real registered address and company number before launch. */}
    </>
  );
}
