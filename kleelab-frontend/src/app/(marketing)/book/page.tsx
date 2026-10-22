import type { Metadata } from 'next';
import Link from 'next/link';
import { BookCall } from '@/components/call/BookCall';
import { PageHero } from '@/components/site/Section';

export const metadata: Metadata = {
  title: 'Book a free call',
  description: 'Pick a time for a free 30-minute call about what you want to build. No obligation.',
};

const ON_THE_CALL = [
  'What you want to build, and who it is for.',
  'What it needs to do on day one, and what can wait.',
  'Rough timing and budget, so we can suggest what fits.',
  'Afterwards we send a written plan with dates and a fixed price.',
];

export default function BookPage() {
  return (
    <>
      <PageHero
        tag="Free first call"
        title={
          <>
            Let’s <span className="mark">talk it through.</span>
          </>
        }
        intro="Thirty minutes with the people who would build it. Pick a time that suits you; we send the details by email."
      />
      <section className="px-5 pb-24 sm:px-8">
        <div className="mx-auto grid max-w-content gap-12 lg:grid-cols-[1.4fr_1fr]">
          <BookCall />
          <aside className="grid content-start gap-8">
            <div>
              <p className="tag">What we cover</p>
              <ol className="mt-5 grid gap-4">
                {ON_THE_CALL.map((step, index) => (
                  <li key={step} className="flex gap-4">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-[1.5px] border-ink bg-white font-mono text-xs">
                      {index + 1}
                    </span>
                    <span className="pt-1 leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-2xl border-[1.5px] border-dashed border-ink p-6">
              <p className="tag">Rather write it down?</p>
              <p className="mt-3 leading-relaxed text-muted">
                Send us a few lines instead and we will reply within one working day.
              </p>
              <Link href="/contact" className="mt-4 inline-block font-semibold text-cobalt underline-offset-4 hover:underline">
                Send an enquiry
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
