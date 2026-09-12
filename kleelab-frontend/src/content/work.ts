/**
 * Studio case studies.
 *
 * PLACEHOLDER COPY: these describe plausible projects for a studio at this
 * stage, but no real client has been engaged. Replace every entry before the
 * site goes live - published results for work that never happened are a legal
 * and reputational problem, not just a copy problem.
 */

export type CaseStudy = {
  slug: string;
  client: string;
  title: string;
  summary: string;
  year: number;
  sector: string;
  services: string[];
  /** Only include figures the studio can actually evidence. */
  results: { value: string; label: string }[];
  body: { heading: string; paragraphs: string[] }[];
};

export const caseStudies: CaseStudy[] = [
  {
    slug: 'fern-and-field',
    client: 'Fern & Field',
    title: 'A florist that finally sold online',
    summary:
      'A Saturday market stall with a waiting list and no way to take orders. We built a shop that fits how the owners actually work.',
    year: 2025,
    sector: 'Retail',
    services: ['Website', 'Shop setup', 'Photography direction'],
    results: [
      { value: '4 days', label: 'from kickoff to live' },
      { value: '2', label: 'people running it, unchanged' },
    ],
    body: [
      {
        heading: 'The problem',
        paragraphs: [
          'Orders arrived by direct message, which meant the stall had to stop selling to answer them. Nothing was written down twice, so a busy Saturday could quietly lose two or three orders and nobody would know until someone complained.',
          'They had already paid for a website once. It had a contact form and a photograph of a shopfront, and it had never processed a single order.',
        ],
      },
      {
        heading: 'What we did',
        paragraphs: [
          'We started with the thing they were avoiding: writing down what they actually sell, in the quantities they can actually fulfil. That list became the shop.',
          'Because they already photograph everything for social media, we set the shop up to use those photographs as they are rather than commissioning a shoot. The site looks like their feed, which is what customers already recognise.',
        ],
      },
      {
        heading: 'What changed',
        paragraphs: [
          'Order confirmation happens without anyone touching it. The stall keeps selling.',
          'We did not add a loyalty scheme, a blog, or a newsletter. Those were offered and declined, and we think that was the right call.',
        ],
      },
    ],
  },
  {
    slug: 'waypoint',
    client: 'Waypoint CC',
    title: 'Route planning for a cycling club',
    summary:
      'Ninety members, four ride captains, and a spreadsheet that had been copied so many times nobody trusted it.',
    year: 2025,
    sector: 'Membership',
    services: ['Web app', 'Design system', 'Data migration'],
    results: [
      { value: '90', label: 'members migrated' },
      { value: '1', label: 'place to look for a route' },
    ],
    body: [
      {
        heading: 'The problem',
        paragraphs: [
          'Every ride captain kept their own copy of the route list. By the time anyone compared them, three different versions of the Sunday route were circulating and the slow group had twice been sent up a hill it had not agreed to.',
          'Membership renewals lived in the same spreadsheet, which meant the person who owned it could not take a holiday.',
        ],
      },
      {
        heading: 'What we did',
        paragraphs: [
          'One list, one owner per ride, and changes visible to everyone the moment they are made. Push notifications were ruled out early: captains wanted people to check before they set off, not to be pinged on the way.',
          'We moved renewals across first and the routes second, so the club was never halfway between two systems.',
        ],
      },
      {
        heading: 'What changed',
        paragraphs: [
          'Captains publish a route once. Members see the current version, with the date it changed.',
          'The spreadsheet owner took a holiday in August for the first time in four years.',
        ],
      },
    ],
  },
  {
    slug: 'bellweather',
    client: 'Bellweather Bakehouse',
    title: 'Subscriptions without the spreadsheet',
    summary:
      'A bakery wanted recurring orders it could actually plan a week of baking around.',
    year: 2024,
    sector: 'Food & drink',
    services: ['Website', 'Subscriptions', 'Payments'],
    results: [
      { value: '31%', label: 'of revenue recurring' },
      { value: '0', label: 'orders taken by hand' },
    ],
    body: [
      {
        heading: 'The problem',
        paragraphs: [
          'Customers asked for weekly bread, so the bakery took the orders by hand and wrote them on a whiteboard. It worked at eight customers and stopped working at about twenty.',
          'The harder problem was forecasting. Without knowing what had been ordered, the baker could not know how much flour to buy.',
        ],
      },
      {
        heading: 'What we did',
        paragraphs: [
          'Subscriptions with a cut-off time, so the bakery knows on Thursday what it is baking on Friday. Pausing a delivery takes two taps, because we watched three people try to cancel instead.',
          'Payments run on Stripe, and the bakery sees one number each morning rather than reconciling a list.',
        ],
      },
      {
        heading: 'What changed',
        paragraphs: [
          'Nearly a third of revenue now arrives before a single loaf is baked.',
          'The whiteboard is still on the wall. It has the staff rota on it now.',
        ],
      },
    ],
  },
  {
    slug: 'north-ledger',
    client: 'North Ledger',
    title: 'An accountancy that stopped looking like every other accountancy',
    summary:
      'Good at the work, invisible online. We rebuilt the site around the one thing they do differently.',
    year: 2024,
    sector: 'Professional services',
    services: ['Website', 'Copywriting', 'Design system'],
    results: [
      { value: '3×', label: 'enquiries per month' },
      { value: '11', label: 'pages, down from 46' },
    ],
    body: [
      {
        heading: 'The problem',
        paragraphs: [
          'The old site had forty-six pages, most of them describing services with the same three paragraphs rearranged. Prospective clients could not tell what the firm was for.',
          'What the firm is actually for is clear once you meet them: they take on the messy, overdue, badly-organised end of the market that other practices turn away.',
        ],
      },
      {
        heading: 'What we did',
        paragraphs: [
          'We put that on the front page, in the words the partners already used when explaining it over coffee. It took three drafts to get them to agree to it.',
          'The remaining pages each answer one question a client actually asks. Everything else was cut rather than rewritten.',
        ],
      },
      {
        heading: 'What changed',
        paragraphs: [
          'Enquiries roughly tripled, and the ones arriving are the kind of work the firm wants, which matters more than the number.',
          'Three times more enquiries from a site two-thirds smaller is the whole argument for cutting pages.',
        ],
      },
    ],
  },
];

export function getCaseStudy(slug: string): CaseStudy | undefined {
  return caseStudies.find((study) => study.slug === slug);
}
