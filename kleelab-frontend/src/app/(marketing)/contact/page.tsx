import type { Metadata } from 'next';
import { ButtonLink } from '@/components/marketing/Button';
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
                  <a
                    href={`tel:${studio.phone.replace(/\s/g, '')}`}
                    className="text-ink underline-offset-2 hover:underline"
                  >
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
              {/* This is a real sequence, so it gets real markers. Tailwind's
                  preflight strips `list-style`, which left an `<ol>` that
                  announced itself as ordered and then showed no numbers. */}
              <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6 text-muted marker:font-mono marker:text-xs marker:text-muted">
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
              <ButtonLink href="/builder/new" className="mt-4">
                Open the builder
              </ButtonLink>
            </div>
          </aside>
        </div>
      </Section>

      {/* TODO: replace with the real registered address and company number before launch. */}
    </>
  );
}
