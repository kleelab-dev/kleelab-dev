import type { Metadata } from 'next';
import { studio } from '@/content/site';
import { AskButton } from '@/components/site/AskButton';
import { ContactForm } from '@/components/site/ContactForm';
import { PageHero } from '@/components/site/Section';
import { ButtonLink } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Start a website project',
  description: 'Tell us what you need. We reply within one working day to set up a free first call.',
  alternates: { canonical: '/contact' },
};

const NEXT_STEPS = [
  'We reply within one working day.',
  'A free 30-minute call to understand what you need. You can book it yourself right now if you prefer.',
  'A written plan with dates and a fixed price.',
  'You approve it and the work starts.',
  'We email you a link to choose a password, and your project dashboard is ready the same day. There is nothing to sign up for.',
];

export default function ContactPage() {
  return (
    <>
      <PageHero
        tag="Start a project"
        title={
          <>
            Let’s get <span className="mark">started.</span>
          </>
        }
        intro="A few lines is plenty. Tell us what you are hoping to build and we will take it from there."
      />
      <section className="px-5 pb-24 sm:px-8">
        <div className="mx-auto grid max-w-content gap-12 lg:grid-cols-[1.4fr_1fr]">
          <ContactForm />
          <aside className="grid content-start gap-8">
            <div>
              <p className="tag">What happens next</p>
              <ol className="mt-5 grid gap-4">
                {NEXT_STEPS.map((step, index) => (
                  <li key={step} className="flex gap-4">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-[1.5px] border-ink bg-white font-mono text-xs">
                      {index + 1}
                    </span>
                    <span className="pt-1 leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-2xl border-[1.5px] border-ink bg-sun-soft p-6">
              <p className="tag">Rather talk first?</p>
              <p className="mt-3 leading-relaxed text-muted">
                Skip the form and pick a time for a free 30-minute call with the team.
              </p>
              <ButtonLink href="/book" variant="sun" className="mt-4">
                Book a free call
              </ButtonLink>
            </div>
            <div className="rounded-2xl border-[1.5px] border-dashed border-ink p-6">
              <p className="tag">Rather just ask?</p>
              <p className="mt-3 leading-relaxed text-muted">
                The assistant can answer questions about how we work right now, and pass you to the team when you are
                ready.
              </p>
              <AskButton className="mt-4" variant="sun">
                Open the chat
              </AskButton>
            </div>
            <div>
              <p className="tag">Email</p>
              <a href={`mailto:${studio.email}`} className="mt-3 block w-fit break-all font-display text-lg font-bold text-cobalt underline-offset-4 hover:underline sm:text-xl">
                {studio.email}
              </a>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
