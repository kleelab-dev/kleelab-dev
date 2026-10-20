import type { Metadata } from 'next';
import { CallToAction } from '@/components/site/CallToAction';
import { PageHero, Section } from '@/components/site/Section';

export const metadata: Metadata = {
  title: 'Work',
  description: 'The kinds of websites and systems KleeLab designs and builds.',
};

/**
 * Example project shapes, not case studies.
 *
 * Deliberately labelled as examples: publishing results for client work that
 * did not happen is a legal and reputational problem. Replace with real case
 * studies, with each client's permission, as projects are handed over.
 */
const EXAMPLES = [
  {
    code: 'EX-01',
    sector: 'Healthcare',
    title: 'Online booking for a clinic',
    body: 'Patients pick a practitioner and a time, pay a deposit and get reminders. Reception sees the day at a glance.',
    stack: ['Web app', 'Payments', 'SMS reminders'],
  },
  {
    code: 'EX-02',
    sector: 'Charity',
    title: 'A member portal for a community group',
    body: 'Members renew, sign up to events and update their details themselves, so volunteers stop chasing spreadsheets.',
    stack: ['Portal', 'Accounts', 'Email'],
  },
  {
    code: 'EX-03',
    sector: 'Retail',
    title: 'An online shop for a maker',
    body: 'Products, stock and delivery that match how the shop really works, with orders that land in one place.',
    stack: ['Shop', 'Payments', 'Hosting'],
  },
  {
    code: 'EX-04',
    sector: 'Operations',
    title: 'An internal job tracker',
    body: 'The shared spreadsheet that ran the business, rebuilt as a tool with roles, history and reports.',
    stack: ['Internal system', 'Reports', 'Maintenance'],
  },
];

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
          {EXAMPLES.map((example) => (
            <article key={example.code} className="card relative flex flex-col p-7 transition-shadow hover:shadow-block">
              <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-label">
                <span className="text-cobalt">{example.code}</span>
                <span className="rounded-full border border-line px-2 py-0.5 text-muted">Example · {example.sector}</span>
              </div>
              <div className="bg-graph mt-5 grid aspect-[16/7] place-items-center rounded-xl border-[1.5px] border-ink">
                <span className="font-display text-5xl font-extrabold tracking-tightest text-cobalt/80">{example.code.replace('EX-', '')}</span>
              </div>
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
          ))}
        </div>
      </Section>
      <CallToAction title="Yours could be next." />
    </>
  );
}
