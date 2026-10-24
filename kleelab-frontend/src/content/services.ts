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
  /** Its own page at /services/<path>, written around what people type into a search box. */
  path: string;
  page: ServicePage;
};

export type ServicePage = {
  /** The search-result title; the layout adds " · KleeLab". */
  title: string;
  /** Under ~155 characters, or search results cut it short. */
  description: string;
  heading: string;
  intro: string;
  /** "This is for you if..." */
  signs: string[];
  /** What changes once it is built. */
  outcomes: { heading: string; body: string }[];
  /** Named kinds of thing we build under this service, so a visitor can spot theirs. */
  examples?: { name: string; body: string }[];
  faqs: { question: string; answer: string }[];
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
      'Set up so people can find you on Google and share your pages',
    ],
    bestFor: 'Businesses, charities, schools, clinics and anyone who needs to be found and trusted.',
    timeline: 'Usually three to six weeks.',
    path: 'website-design',
    page: {
      title: 'Website design and development',
      description:
        'A fast, clear website your team can update themselves, designed for phones first and set up to be found on Google. Follow every step on your dashboard.',
      heading: 'A website that does its job.',
      intro:
        'Most small sites fail quietly: slow on a phone, hard to update, and vague about what the organisation actually does. We plan the pages with you, write and design them, and hand over a site you can change yourself.',
      signs: [
        'You do not have a site yet, or you are embarrassed to send people to the one you have',
        'Changing a phone number or a price means waiting on someone else',
        'People ask questions the site should already answer',
        'You cannot find yourself on Google when you search for what you do',
      ],
      outcomes: [
        { heading: 'Clear in five seconds', body: 'Visitors see what you do, who it is for and how to get in touch, without hunting for it.' },
        { heading: 'Yours to update', body: 'Text, photos, prices and opening hours are changed from a simple editor. No developer needed for the everyday.' },
        { heading: 'Ready to be found', body: 'Page titles, descriptions, a sitemap and share images are set up properly from the first day.' },
      ],
      faqs: [
        { question: 'How long does a website take?', answer: 'Usually three to six weeks from the first call to going live. Most of that depends on how quickly words and photos come together, and we help with both.' },
        { question: 'Do you write the words?', answer: 'We help. We plan every page with you, draft the copy from a short conversation, and you correct anything that does not sound like you.' },
        { question: 'Can I update the site myself afterwards?', answer: 'Yes. You get an editor for the parts that change, and a short handover so your team knows how to use it.' },
        { question: 'Who hosts it?', answer: 'Either we do, on a monthly care plan, or we hand everything to you or your own provider. Your site and its address stay yours either way.' },
      ],
    },
  },
  {
    slug: 'shops',
    code: 'SVC-02',
    name: 'Online shops',
    summary: 'Take orders and payments online, without paying for complicated software you will never fully use.',
    includes: [
      'Products, stock and delivery options',
      'Payments and receipts',
      'Order alerts that reach a real person',
      'Refunds and returns handled sensibly',
    ],
    bestFor: 'Makers and retailers who sell by message, phone or over a counter today.',
    timeline: 'Usually four to eight weeks.',
    path: 'online-shops',
    page: {
      title: 'Online shop design and development',
      description:
        'An online shop that takes orders and payments, tracks stock and tells a real person when something sells. Built for people who sell by message today.',
      heading: 'Sell online without the mess.',
      intro:
        'If orders arrive by message, phone call and notes on paper, you are already running a shop, just without the tools. We build one that takes payment, keeps stock right and shows you every order in one place.',
      signs: [
        'Orders come in by WhatsApp, Instagram or phone and are easy to lose',
        'You chase payments or confirm transfers by hand',
        'Stock counts live in your head or a notebook',
        'An off-the-shelf shop felt too complicated or too expensive for what you sell',
      ],
      outcomes: [
        { heading: 'Paid before you pack', body: 'Customers pay at checkout and get a receipt. You get an alert with everything you need to send the order.' },
        { heading: 'Stock that adds up', body: 'Quantities go down as things sell, and products hide themselves when they run out.' },
        { heading: 'One list of orders', body: 'Every order, its payment and its delivery status in one place, instead of across five chats.' },
      ],
      faqs: [
        { question: 'Which payment methods can customers use?', answer: 'Cards and bank payments through a payment provider suited to where you and your customers are. We set it up and test it with you before launch.' },
        { question: 'How long does a shop take?', answer: 'Usually four to eight weeks, depending on how many products you have and how delivery works.' },
        { question: 'Can I add products myself?', answer: 'Yes. Adding a product, changing a price or marking something sold out takes a minute from your admin screen.' },
        { question: 'What about delivery?', answer: 'We set up the delivery options you actually use: flat rates, zones, collection, or prices worked out at checkout.' },
      ],
    },
  },
  {
    slug: 'apps',
    code: 'SVC-03',
    name: 'Web apps and portals',
    summary: 'Booking systems, member portals and customer dashboards, built around how you work.',
    includes: [
      'Logins for staff and customers, each seeing only what they should',
      'Bookings, payments and notifications',
      'Works with the tools you already use',
      'Admin screens for your team',
    ],
    bestFor: 'Organisations whose customers or members need to do something, not just read something.',
    timeline: 'Eight weeks and up, depending on what you need.',
    path: 'web-apps',
    page: {
      title: 'Web app and portal development',
      description:
        'Booking systems, member portals and customer dashboards built around how you work, with logins, payments and notifications. Watch it built step by step.',
      heading: 'Let customers do it themselves.',
      intro:
        'When people need to book, pay, apply or check on something, a website that only shows information is not enough. We build web apps that give your customers and staff their own logins and do the work that phone calls and emails do today.',
      signs: [
        'Bookings, applications or sign-ups are handled by email and phone',
        'Customers keep asking for updates you could show them on a screen',
        'Members or clients need their own account to see their information',
        'Your team copies the same details between three different tools',
      ],
      outcomes: [
        { heading: 'Open all hours', body: 'Customers book, pay and check progress whenever suits them, without waiting for someone to reply.' },
        { heading: 'The right view for each person', body: 'Staff, customers and managers each log in and see only what is theirs.' },
        { heading: 'Fewer messages to answer', body: 'Confirmations, reminders and updates go out by themselves at the right moment.' },
      ],
      faqs: [
        { question: 'What is the difference between a website and a web app?', answer: 'A website mainly gives information. A web app lets people do something, such as log in, book, pay or track progress, and keeps their data safe while they do.' },
        { question: 'How long does a web app take?', answer: 'Eight weeks and up. We agree a first version that is useful on its own, launch it, and add to it from there.' },
        { question: 'Will it work on phones?', answer: 'Yes. Everything we build is designed to work well in a phone browser, with nothing to install.' },
        { question: 'Can it connect to tools we already use?', answer: 'Usually. Payments, email, calendars, accounting and spreadsheets are the common ones. We check what is possible on the first call.' },
      ],
    },
  },
  {
    slug: 'systems',
    code: 'SVC-04',
    name: 'Internal systems',
    summary: 'Custom systems that run the work behind the scenes for businesses and organisations: stock, staff, clients, members, jobs and reports.',
    includes: [
      'Mapping how the work really gets done',
      'Your data moved over from what you use now',
      'Connections to the tools you already pay for',
      'Reports, dashboards and exports',
      'Training and handover documentation',
    ],
    bestFor: 'Businesses, charities, schools and other organisations juggling several tools, paperwork or workarounds.',
    timeline: 'Six weeks and up, depending on what you need.',
    path: 'internal-systems',
    page: {
      title: 'Custom internal systems for businesses and organisations',
      description:
        'Custom systems for businesses and organisations: stock, staff, clients, members, donors and approvals, built around how your team works.',
      heading: 'The tools your team runs on.',
      intro:
        'Off-the-shelf software fits most businesses and organisations about seventy per cent. The rest gets patched with paperwork, copy and paste and workarounds. We build the system your work actually needs, connect it to what you already use and train your team to run it.',
      signs: [
        'Your team switches between several apps, files and chats to finish one task',
        'Approvals, requests or job updates get lost in email and messages',
        'Reports take hours of copying numbers from one place to another',
        'You pay for software that only half fits, and work around the rest',
      ],
      outcomes: [
        { heading: 'One place for the work', body: 'Stock, clients, members, jobs or staff live in one system, with the latest information and a record of who changed what.' },
        { heading: 'Less done by hand', body: 'Reminders, approvals, invoices and reports happen by themselves instead of someone remembering to do them.' },
        { heading: 'Easy to hand on', body: 'The process lives in the system, not in one person\'s head, with written guides from handover.' },
      ],
      examples: [
        { name: 'Inventory and stock control', body: 'Know what you have, where it is and when to reorder, across one shop or several sites.' },
        { name: 'Client, case and member management', body: 'Every client, member or beneficiary, with their history and follow-ups, in one place.' },
        { name: 'Staff, volunteers and rotas', body: 'Shifts, leave, timesheets and records for staff and volunteers, without the group chat.' },
        { name: 'Jobs and field teams', body: 'Assign jobs, track them from a phone, and capture photos and signatures on site.' },
        { name: 'Requests and approvals', body: 'Purchases, expenses and sign-offs go to the right person, with a record of every decision.' },
        { name: 'Quotes, invoices and payments', body: 'From quote to invoice to paid, with reminders that go out by themselves.' },
        { name: 'Donors, grants and programmes', body: 'Donations, grant deadlines and programme results tracked, with funder reports ready when they are due.' },
        { name: 'Contracts and compliance', body: 'Certificates, contracts and renewals tracked, with a warning before anything expires.' },
        { name: 'Management dashboards', body: 'The numbers that matter, live, instead of a report someone builds by hand each month.' },
      ],
      faqs: [
        { question: 'Do we lose our existing data?', answer: 'No. Moving your data across from your current software, files or spreadsheets is part of the project, and we check it with you before you switch over.' },
        { question: 'What kind of systems do you build?', answer: 'Inventory and stock control, client and member records, staff and volunteer rotas, job tracking for field teams, approval workflows, invoicing, donor and grant tracking, and management dashboards. If your team does it every day, it can usually be built.' },
        { question: 'How long does an internal system take?', answer: 'Six weeks and up. We start with the part of the work that costs you the most time and build out from there.' },
        { question: 'Will my team actually use it?', answer: 'We design it with the people who will use it every day, and finish with training and short written guides.' },
        { question: 'Is our data kept private?', answer: 'Yes. Everyone logs in, each person sees only what their role allows, and the data is backed up every day.' },
      ],
    },
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
    name: 'Going live',
    summary: 'We connect your web address, set up security and email, and put it online properly.',
    includes: [
      'Your web address set up or moved',
      'The padlock (security certificate), email settings and old links redirected',
      'Checks that tell us if it breaks or goes offline',
      'A launch checklist, done with you',
    ],
  },
  {
    slug: 'hosting',
    code: 'ADD-02',
    name: 'Hosting',
    summary: 'We keep it online, fast and safe, and back it up, so you never have to think about it.',
    includes: [
      'Hosting big enough for your visitors',
      'Daily backups, and we check they work',
      'Security updates',
      'If it goes offline, we get the alert, not you',
    ],
  },
  {
    slug: 'maintenance',
    code: 'ADD-03',
    name: 'Monthly care',
    summary: 'One person you know for changes, fixes and updates, with a short monthly report on what we did.',
    includes: [
      'Software updates',
      'Small changes, usually within a day or two',
      'A monthly report on how it is running',
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
