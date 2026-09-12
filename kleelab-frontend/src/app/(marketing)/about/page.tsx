import type { Metadata } from 'next';
import { CallToAction } from '@/components/marketing/CallToAction';
import { PageHeader, Section, SectionHeading } from '@/components/marketing/Section';
import { Statement } from '@/components/marketing/Statement';
import { studio } from '@/content/site';

export const metadata: Metadata = {
  title: 'Studio',
  description:
    'KleeLab is a small London studio building websites and digital products. How we work, and what we turn down.',
};

const PRINCIPLES = [
  {
    heading: 'Small on purpose',
    body: 'Two or three people, working on a handful of projects at a time. Nobody you speak to is handing your work to someone you have not met.',
  },
  {
    heading: 'Boring where it counts',
    body: 'Passwords, payments and data handling are not places to be interesting. We use well-understood tools there, and save the invention for the parts people see.',
  },
  {
    heading: 'You keep the keys',
    body: 'Domains, hosting and accounts are registered in your name. If you ever want to leave, you take everything with you, and we will help you move it.',
  },
  {
    heading: 'Finished means finished',
    body: 'We would rather hand over a smaller site that is completely done than a larger one with three pages that nearly work.',
  },
];

const DECLINES = [
  'Projects where the brief is a competitor’s website.',
  'Work where the person who decides will not be in the room.',
  'Anything that needs an answer faster than it can be done properly.',
];

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="Studio"
        title={`A small studio, founded in ${studio.founded}.`}
        lead="We build websites and digital products for people who have a clear idea of what they need and no interest in becoming web developers to get it."
      />

      <Section>
        <Statement>
          We would rather ship one thing that works than five that nearly do.
        </Statement>
      </Section>

      <Section tone="canvas">
        <SectionHeading
          eyebrow="How we work"
          title="Four rules we do not bend."
        />
        <div className="mt-12 grid gap-10 md:grid-cols-2 md:gap-x-14">
          {PRINCIPLES.map((principle) => (
            <div key={principle.heading} className="border-t border-line pt-6">
              <h3 className="font-serif text-xl leading-snug">{principle.heading}</h3>
              <p className="mt-3 max-w-measure text-sm leading-6 text-muted">{principle.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <SectionHeading
            eyebrow="What we say no to"
            title="Turning work down is part of the job."
            lead="Every project we accept costs another one a place. These are the ones we have learned to decline, even when the budget is good."
          />
          <ul className="space-y-5 lg:pt-2">
            {DECLINES.map((item) => (
              <li key={item} className="flex gap-3 border-b border-line pb-5 text-base leading-7">
                <span aria-hidden="true" className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section tone="canvas">
        <CallToAction
          title="Come and talk to us."
          body="If your project is a fit we will tell you how we would approach it. If it is not, we will point you somewhere better."
          primary={{ href: '/contact', label: 'Talk to the studio' }}
          secondary={{ href: '/services', label: 'What we do' }}
        />
      </Section>
    </>
  );
}
