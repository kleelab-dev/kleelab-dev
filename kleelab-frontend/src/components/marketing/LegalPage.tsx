import { Prose } from '@/components/marketing/Prose';
import { PageHeader, Section } from '@/components/marketing/Section';
import { formatDate } from '@/content/posts';
import type { LegalDocument } from '@/content/legal';

/**
 * One renderer for all three legal pages.
 *
 * The draft notice is intentionally visible on the page rather than a code
 * comment: unreviewed legal text that looks finished is the kind of thing that
 * quietly ships.
 */
export function LegalPage({ doc }: { doc: LegalDocument }) {
  return (
    <>
      <PageHeader
        eyebrow="Legal"
        title={doc.title}
        lead={doc.summary}
      />

      <Section>
        <p className="mb-8 rounded-lg border border-danger-line bg-danger-surface px-4 py-3 text-sm text-danger">
          Draft pending legal review. Last drafted {formatDate(doc.updated)}.
        </p>

        <Prose>
          {doc.sections.map((section, index) => (
            <section key={section.heading} className={index === 0 ? '[&>h2]:mt-0' : ''}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.list && (
                <ul>
                  {section.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </Prose>

        <p className="mt-12 border-t border-line pt-6 font-mono text-xs text-muted">
          Last updated {formatDate(doc.updated)}
        </p>
      </Section>
    </>
  );
}
