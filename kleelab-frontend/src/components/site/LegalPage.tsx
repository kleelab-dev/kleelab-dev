import type { LegalDocument } from '@/content/legal';
import { PageHero, Section } from '@/components/site/Section';

/**
 * Renders text with any [[placeholder]] picked out in yellow, so a missing
 * company name or an undecided clause is impossible to miss before launch.
 */
function Text({ children }: { children: string }) {
  return children.split(/(\[\[.+?\]\])/).map((part, index) =>
    part.startsWith('[[') && part.endsWith(']]') ? (
      <mark key={index} className="rounded bg-sun px-1 font-mono text-[0.85em] text-ink">
        {part.slice(2, -2)}
      </mark>
    ) : (
      part
    ),
  );
}

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
                  <Text>{paragraph}</Text>
                </p>
              ))}
              {section.list && (
                <ul className="mt-4 grid gap-2.5">
                  {section.list.map((item) => (
                    <li key={item} className="flex gap-3 leading-relaxed text-ink-soft">
                      <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cobalt" aria-hidden />
                      <span>
                        <Text>{item}</Text>
                      </span>
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
