/**
 * What KleeLab sells: things we build, and optional services around them.
 *
 * Deliberately no prices. Rates are a business decision only the studio can
 * make, and an invented number on a live site is worse than none.
 */

export type Service = {
  slug: string;
  code: string;
  name: string;
  summary: string;
  includes: string[];
  bestFor: string;
  timeline: string;
};

/** The things we build for you. */
export const services: Service[] = [
  {
    slug: 'websites',
    code: 'SVC-01',
    name: 'Websites',
    summary: 'A site that says what you do, loads fast and can be updated without calling anyone.',
    includes: [
      'Page planning and copy help',
      'Design for desktop and mobile',
      'An editor your team can actually use',
      'Search, social previews and analytics set up properly',
    ],
    bestFor: 'Businesses, charities, schools, clinics and anyone who needs to be found and trusted.',
    timeline: 'Usually three to six weeks.',
  },
  {
    slug: 'shops',
    code: 'SVC-02',
    name: 'Online shops',
    summary: 'Take orders and payments online without adopting software you will never fully use.',
    includes: [
      'Products, stock and delivery options',
      'Payments and receipts',
      'Order notifications that reach a person',
      'Refunds and returns handled sensibly',
    ],
    bestFor: 'Makers and retailers who sell by message, phone or over a counter today.',
    timeline: 'Usually four to eight weeks.',
  },
  {
    slug: 'apps',
    code: 'SVC-03',
    name: 'Web apps and portals',
    summary: 'Booking systems, member portals and customer dashboards, built around how you work.',
    includes: [
      'Accounts, roles and permissions',
      'Bookings, payments and notifications',
      'Integrations with the tools you already use',
      'Admin screens for your team',
    ],
    bestFor: 'Organisations whose customers or members need to do something, not just read something.',
    timeline: 'Eight weeks and up, depending on scope.',
  },
  {
    slug: 'systems',
    code: 'SVC-04',
    name: 'Internal systems',
    summary: 'The spreadsheet that runs the business, turned into a proper tool your team will like.',
    includes: [
      'Mapping the workflow that matters',
      'Data moved over from what you use now',
      'Reports and exports',
      'Training and handover documentation',
    ],
    bestFor: 'Teams running a process on spreadsheets, email threads and good intentions.',
    timeline: 'Six weeks and up, depending on scope.',
  },
];

export type AddOn = {
  slug: 'deployment' | 'hosting' | 'maintenance';
  code: string;
  name: string;
  summary: string;
  includes: string[];
};

/** Optional services, added to any project or offered on their own. */
export const addOns: AddOn[] = [
  {
    slug: 'deployment',
    code: 'ADD-01',
    name: 'Deployment',
    summary: 'We put it live properly: domain, SSL, email records, analytics and monitoring.',
    includes: [
      'Domain and DNS set up or moved',
      'SSL, email records and redirects',
      'Error and uptime monitoring',
      'A launch checklist, done with you',
    ],
  },
  {
    slug: 'hosting',
    code: 'ADD-02',
    name: 'Managed hosting',
    summary: 'Fast, secure hosting that we run, watch and back up, so you never think about servers.',
    includes: [
      'Hosting sized for your traffic',
      'Daily backups, restore-tested',
      'Security updates and certificates',
      'Uptime alerts that come to us, not you',
    ],
  },
  {
    slug: 'maintenance',
    code: 'ADD-03',
    name: 'Maintenance and care',
    summary: 'A named person for changes, fixes and updates, with a monthly report on what we did.',
    includes: [
      'Software and dependency updates',
      'Small changes, usually within a day or two',
      'A monthly health and performance report',
      'Priority help when something breaks',
    ],
  },
];

/** How engagements are priced. TODO: confirm terms before launch. */
export const pricingModel = [
  {
    heading: 'A first call, no charge',
    body: 'Thirty minutes to see whether we are a good fit. If we are not, we will say so and point you somewhere better.',
  },
  {
    heading: 'A fixed quote before work starts',
    body: 'You get a written scope and a price. If the scope changes, the price changes only with your agreement.',
  },
  {
    heading: 'Care plans are monthly',
    body: 'Hosting and maintenance are billed monthly and you can stop with a month of notice. No lock-in.',
  },
];
