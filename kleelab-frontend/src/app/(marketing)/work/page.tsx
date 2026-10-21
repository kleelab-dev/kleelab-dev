import type { Metadata } from 'next';
import { CallToAction } from '@/components/site/CallToAction';
import { ExampleShot } from '@/components/site/ExampleShot';
import { PageHero, Section } from '@/components/site/Section';
import { Reveal } from '@/components/site/Reveal';
import { workExamples } from '@/content/work';

export const metadata: Metadata = {
  title: 'Work',
  description: 'The kinds of websites and systems KleeLab designs and builds.',
};

export default function WorkPage() {
  return (
    <>
      <PageHero
        tag="Work"
        title={
          <>
            The kind of thing <span className="mark">we build.</span>
          </>
        }
        intro="Case studies are on their way as current projects are handed over. Until then, here are the shapes of project we take on most often."
      />
      <Section tone="white">
        <div className="grid gap-6 md:grid-cols-2">
          {workExamples.map((example, index) => (
            <Reveal key={example.code} delay={(index % 2) * 90}>
              <article className="card card-lift relative flex h-full flex-col p-7">
                <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-label">
                  <span className="text-cobalt">{example.code}</span>
                  <span className="rounded-full border border-line px-2 py-0.5 text-muted">Example · {example.sector}</span>
                </div>
                <ExampleShot shot={example.shot} className="mt-5" />
                <h2 className="mt-6 font-display text-2xl font-extrabold tracking-tight">{example.title}</h2>
                <p className="mt-2 flex-1 leading-relaxed text-muted">{example.body}</p>
                <ul className="mt-5 flex flex-wrap gap-2">
                  {example.stack.map((item) => (
                    <li key={item} className="rounded-full bg-paper px-3 py-1 font-mono text-[11px] text-ink">
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>
      <CallToAction title="Yours could be next." />
    </>
  );
}
