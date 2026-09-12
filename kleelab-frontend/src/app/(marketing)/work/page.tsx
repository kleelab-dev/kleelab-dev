import type { Metadata } from 'next';
import { WorkCard } from '@/components/marketing/Cards';
import { CallToAction } from '@/components/marketing/CallToAction';
import { PageHeader, Section } from '@/components/marketing/Section';
import { caseStudies } from '@/content/work';

export const metadata: Metadata = {
  title: 'Work',
  description:
    'Case studies from KleeLab: what was wrong, what we changed, and what happened next.',
};

export default function WorkPage() {
  return (
    <>
      <PageHeader
        eyebrow="Work"
        title="What we changed, and what it did."
        lead="Each of these explains the problem first. The interesting part of a project is almost never the design."
      />

      <Section>
        <div className="grid gap-x-10 gap-y-14 md:grid-cols-2">
          {caseStudies.map((study) => (
            <WorkCard key={study.slug} study={study} />
          ))}
        </div>
      </Section>

      <Section tone="canvas">
        <CallToAction
          eyebrow="Next"
          title="Yours could be on this page."
          body="Tell us what is not working at the moment. If we have solved something close to it before, we will say so."
          primary={{ href: '/contact', label: 'Talk to the studio' }}
          secondary={{ href: '/services', label: 'What we do' }}
        />
      </Section>
    </>
  );
}
