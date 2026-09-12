/** What the studio sells. Placeholder positioning - confirm the real offer. */

export type Service = {
  slug: string;
  name: string;
  summary: string;
  includes: string[];
  bestFor: string;
  /** Rough shape of the engagement, so people can self-qualify before writing in. */
  timeline: string;
};

export const services: Service[] = [
  {
    slug: 'websites',
    name: 'Websites',
    summary:
      'A site that says what you do, loads quickly, and can be updated without calling anyone.',
    includes: [
      'Structure and page planning',
      'Design for desktop and mobile',
      'Copy editing on the pages that matter',
      'Search and social previews set up properly',
      'A walkthrough so you can edit it yourself',
    ],
    bestFor: 'Small businesses, practices and studios who need to be findable and credible.',
    timeline: 'Usually two to four weeks.',
  },
  {
    slug: 'shops',
    name: 'Online shops',
    summary:
      'Selling online without adopting an inventory system you will never use.',
    includes: [
      'Product setup and photography direction',
      'Payments and delivery options',
      'Order notifications that reach a human',
      'Returns and refunds handled sensibly',
    ],
    bestFor: 'Makers and small retailers taking orders by message or over a counter.',
    timeline: 'Usually three to six weeks.',
  },
  {
    slug: 'apps',
    name: 'Web apps and tools',
    summary:
      'Internal tools and small products, built to do one job properly rather than everything badly.',
    includes: [
      'Scoping the one workflow that matters',
      'Design and build',
      'Sign-in, permissions and data handling',
      'Handover documentation',
    ],
    bestFor: 'Teams running a process out of a spreadsheet that has outgrown itself.',
    timeline: 'Six weeks and up, depending on scope.',
  },
  {
    slug: 'care',
    name: 'Ongoing care',
    summary: 'Someone to call when something breaks, or when you need a change made.',
    includes: [
      'Updates and security patching',
      'Backups you have actually tested restoring',
      'Small changes, usually within a day',
      'A named person, not a ticket queue',
    ],
    bestFor: 'Anyone who owns a site and would rather not be its maintainer.',
    timeline: 'Monthly, cancellable with a month of notice.',
  },
];

/**
 * How engagements are priced.
 *
 * Deliberately no figures: rates are a business decision only the studio can
 * make, and an invented number on a live site is worse than none.
 */
export const pricingModel = [
  {
    heading: 'A first call, no charge',
    body: 'Thirty minutes to work out whether this is a good fit. If it is not, we will say so and point you somewhere better.',
  },
  {
    heading: 'A fixed quote before work starts',
    body: 'You get a written scope and a price. If the scope changes, the price changes with your agreement - never quietly, never afterwards.',
  },
  {
    heading: 'Half up front, half at handover',
    body: 'Ongoing care is billed monthly and you can stop it with a month of notice. We do not do lock-in.',
  },
];
