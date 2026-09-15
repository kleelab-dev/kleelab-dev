import Link from 'next/link';
import { ButtonLink } from '@/components/marketing/Button';
import { WorkCard, PostCard } from '@/components/marketing/Cards';
import { CallToAction } from '@/components/marketing/CallToAction';
import { Hero } from '@/components/marketing/Hero';
import { Eyebrow, Section, SectionHeading } from '@/components/marketing/Section';
import { Statement } from '@/components/marketing/Statement';
import { posts } from '@/content/posts';
import { services } from '@/content/services';
import { caseStudies } from '@/content/work';

const PATHS = [
  {
    eyebrow: 'Do it yourself',
    title: 'Describe it, and we build it',
    body: 'Tell us what the business is in a sentence or two. We choose the sections each page needs and write the words, then open it in an editor where you can change anything by hand or just say what to fix next.',
    points: ['No template to choose', 'Change anything afterwards', 'Publish when it feels right'],
    href: '/builder/new',
    action: 'Describe your site',
  },
  {
    eyebrow: 'Hand it over',
    title: 'Have us build it',
    body: 'We take the brief, design it, write and build it, and hand back something you can maintain. Most studio projects take two to six weeks.',
    points: ['Design and build', 'Copy and structure', 'Fixed quote before we start'],
    href: '/contact',
    action: 'Talk to the studio',
  },
];

export default function HomePage() {
  const featured = caseStudies.slice(0, 2);
  const latest = posts.slice(0, 2);

  return (
    <>
      <Hero />

      <Section tone="canvas">
        <SectionHeading
          eyebrow="Two ways to work with us"
          title="Same studio, two levels of help."
          lead="Most people arrive knowing what they want the site to do and not how to get there. Either path gets you to the same place — the difference is how much of the work is yours."
        />

        <div className="mt-12 grid gap-10 md:grid-cols-2 md:gap-14">
          {PATHS.map((path) => (
            <div key={path.href} className="border-t border-line pt-7">
              <Eyebrow>{path.eyebrow}</Eyebrow>
              <h3 className="mt-3 font-serif text-2xl leading-tight">{path.title}</h3>
              <p className="mt-3 max-w-measure text-sm leading-6 text-muted">{path.body}</p>
              <ul className="mt-5 space-y-2">
                {path.points.map((point) => (
                  <li key={point} className="flex gap-2.5 text-sm text-ink">
                    <span
                      aria-hidden="true"
                      className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-accent"
                    />
                    {point}
                  </li>
                ))}
              </ul>
              <ButtonLink href={path.href} className="mt-6">
                {path.action}
              </ButtonLink>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeading
          eyebrow="What we do"
          title="Four things, done properly."
          lead="We would rather be excellent at a short list than passable at everything."
        />

        <dl className="mt-12 border-t border-line">
          {services.map((service, index) => (
            <div
              key={service.slug}
              className="grid gap-3 border-b border-line py-7 md:grid-cols-[3rem_minmax(0,1fr)_minmax(0,2fr)] md:gap-6"
            >
              <dt className="font-mono text-xs text-muted">
                {String(index + 1).padStart(2, '0')}
              </dt>
              <dd className="font-serif text-xl leading-snug">
                {/* Was `hover:text-accent`, which is the same hex as the ink it
                    already was, so the link gave no sign it was a link. */}
                <Link
                  href={`/services#${service.slug}`}
                  className="underline-offset-4 hover:underline"
                >
                  {service.name}
                </Link>
              </dd>
              <dd className="text-sm leading-6 text-muted">{service.summary}</dd>
            </div>
          ))}
        </dl>

        <Link
          href="/services"
          className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-accent"
        >
          How we work and what it costs <span aria-hidden="true">→</span>
        </Link>
      </Section>

      <Section tone="canvas">
        <SectionHeading
          eyebrow="Selected work"
          title="A few things we have built."
          lead="Short write-ups of what was wrong, what we changed, and what happened next."
        />
        <div className="mt-12 grid gap-12 md:grid-cols-2 md:gap-10">
          {featured.map((study) => (
            <WorkCard key={study.slug} study={study} />
          ))}
        </div>
        <Link
          href="/work"
          className="mt-10 inline-flex items-center gap-1.5 text-sm font-medium text-accent"
        >
          All work <span aria-hidden="true">→</span>
        </Link>
      </Section>

      <Section>
        <Statement>
          We would rather ship one thing that works than five that nearly do.
        </Statement>
      </Section>

      <Section tone="canvas">
        <SectionHeading
          eyebrow="Notes"
          title="What we have learned so far."
          lead="Mostly about building things carefully, and about the parts nobody puts in a case study."
        />
        <div className="mt-12 grid gap-10 md:grid-cols-2 md:gap-10">
          {latest.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
        <Link
          href="/blog"
          className="mt-10 inline-flex items-center gap-1.5 text-sm font-medium text-accent"
        >
          Read more notes <span aria-hidden="true">→</span>
        </Link>
      </Section>

      <Section>
        <CallToAction
          title="Tell us what you are building."
          body="A sentence or two is enough to start. If we are not the right studio for it, we will say so and point you at one that is."
          primary={{ href: '/contact', label: 'Talk to the studio' }}
          secondary={{ href: '/builder/new', label: 'Try the builder' }}
        />
      </Section>
    </>
  );
}
