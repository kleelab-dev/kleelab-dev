import type { Metadata } from 'next';
import { CallToAction } from '@/components/site/CallToAction';
import { PageHero, Section, SectionHeading } from '@/components/site/Section';
import { Reveal } from '@/components/site/Reveal';

export const metadata: Metadata = {
  title: 'About',
  description: 'KleeLab is a small, remote team that designs and builds websites and systems for organisations of every size.',
  alternates: { canonical: '/about' },
};

const BELIEFS = [
  {
    title: 'The people you meet do the work',
    body: 'A small team working on a handful of projects at a time. Nobody you speak to is handing your project to someone you have never met.',
  },
  {
    title: 'Boring where it matters',
    body: 'Passwords, payments and data handling are not places to be clever. We use well-understood tools there and save the invention for the parts people see.',
  },
  {
    title: 'Everything in your name',
    body: 'Domains, hosting and accounts are registered to you. If you ever want to leave, you take everything with you and we help you move it.',
  },
  {
    title: 'Done beats nearly done',
    body: 'We would rather hand over a smaller system that is completely finished than a bigger one with three parts that nearly work.',
  },
];

const TURN_DOWN = [
  'Projects where the brief is a copy of a competitor’s website.',
  'Work where the person who decides will never be in the room.',
  'Anything that needs an answer faster than it can be done properly.',
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        tag="About KleeLab"
        title={
          <>
            A small team that builds <span className="mark">properly.</span>
          </>
        }
        intro="We design and build websites, web apps and internal systems for start-ups, charities, clinics, schools, shops and everyone in between. We work remotely with clients wherever they are, and we show our work as we go."
      />

      <Section tone="white">
        <SectionHeading tag="What we believe" title="Four rules we do not bend." />
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border-[1.5px] border-ink bg-ink sm:grid-cols-2">
          {BELIEFS.map((belief, index) => (
            <Reveal key={belief.title} delay={(index % 2) * 90} className="bg-white">
              <div className="h-full p-7 transition-colors duration-300 hover:bg-sun-soft sm:p-9">
                <span className="font-mono text-xs text-cobalt">R-{String(index + 1).padStart(2, '0')}</span>
                <h3 className="mt-3 font-display text-2xl font-extrabold tracking-tight">{belief.title}</h3>
                <p className="mt-3 leading-relaxed text-muted">{belief.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section>
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <SectionHeading
            tag="Why the dashboard"
            title="Because waiting in the dark is the worst part."
            intro="Most people who have had a website built remember the silence: weeks between emails, then a big reveal that was not quite right. Our client dashboard exists so that never happens. You see the work while it can still change."
          />
          <Reveal className="card relative p-7 shadow-block">
            <div className="dim">what we turn down</div>
            <ul className="grid gap-4">
              {TURN_DOWN.map((item, index) => (
                <Reveal as="li" key={item} delay={150 + index * 110} className="flex gap-3 leading-relaxed">
                  <span className="mt-1 font-mono text-sm text-danger" aria-hidden>✕</span>
                  {item}
                </Reveal>
              ))}
            </ul>
          </Reveal>
        </div>
      </Section>

      <CallToAction />
    </>
  );
}
