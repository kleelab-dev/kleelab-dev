/**
 * Example project shapes, not case studies.
 *
 * Deliberately labelled as examples: publishing results for client work that
 * did not happen is a legal and reputational problem. Replace with real case
 * studies, with each client's permission, as projects are handed over.
 */
export type WorkExample = {
  code: string;
  sector: string;
  title: string;
  body: string;
  stack: string[];
  /** Which drawing ExampleShot shows. */
  shot: 'booking' | 'portal' | 'shop' | 'tracker';
};

export const workExamples: WorkExample[] = [
  {
    code: 'EX-01',
    sector: 'Healthcare',
    title: 'Online booking for a clinic',
    body: 'Patients pick a practitioner and a time, pay a deposit and get reminders. Reception sees the day at a glance.',
    stack: ['Web app', 'Payments', 'SMS reminders'],
    shot: 'booking',
  },
  {
    code: 'EX-02',
    sector: 'Charity',
    title: 'A member portal for a community group',
    body: 'Members renew, sign up to events and update their details themselves, so volunteers stop chasing spreadsheets.',
    stack: ['Portal', 'Accounts', 'Email'],
    shot: 'portal',
  },
  {
    code: 'EX-03',
    sector: 'Retail',
    title: 'An online shop for a maker',
    body: 'Products, stock and delivery that match how the shop really works, with orders that land in one place.',
    stack: ['Shop', 'Payments', 'Hosting'],
    shot: 'shop',
  },
  {
    code: 'EX-04',
    sector: 'Operations',
    title: 'An internal job tracker',
    body: 'The shared spreadsheet that ran the business, rebuilt as a tool with roles, history and reports.',
    stack: ['Internal system', 'Reports', 'Maintenance'],
    shot: 'tracker',
  },
];
