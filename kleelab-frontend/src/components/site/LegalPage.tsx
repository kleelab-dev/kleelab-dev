import type { LegalDocument } from '@/content/legal';
import { PageHero, Section } from '@/components/site/Section';

export function LegalPage({ doc }: { doc: LegalDocument }) {
  return (
    <>
      <PageHero tag={`Legal · updated ${doc.updated}`} title={doc.title} intro={doc.summary} />
      <Section tone="white" className="!py-16">
        <div className="mx-auto max-w-measure space-y-12">
          {doc.sections.map((section, index) => (
            <section key={section.heading}>
              <p className="font-mono text-xs text-cobalt">§ {String(index + 1).padStart(2, '0')}</p>
              <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-4 leading-relaxed text-ink-soft">
                  {paragraph}
                </p>
              ))}
              {section.list && (
                <ul className="mt-4 grid gap-2.5">
                  {section.list.map((item) => (
                    <li key={item} className="flex gap-3 leading-relaxed text-ink-soft">
                      <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cobalt" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </Section>
    </>
  );
}
