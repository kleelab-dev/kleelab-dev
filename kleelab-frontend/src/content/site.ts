/**
 * Single source of truth for studio facts and navigation.
 *
 * The header, footer, chat and every page read from here so a contact detail or
 * nav label can never drift between them. KleeLab works remotely with clients
 * anywhere, so there is deliberately no address or phone number here.
 */

export const studio = {
  name: 'KleeLab',
  tagline: 'Websites and systems, built in the open.',
  /** TODO: confirm the real inbox before launch. */
  email: 'hello@kleelab.com',
  founded: 2024,
};

export const primaryNav = [
  { href: '/services', label: 'Services' },
  { href: '/how-we-build', label: 'How we build' },
  { href: '/care', label: 'Care plans' },
  { href: '/work', label: 'Work' },
  { href: '/about', label: 'About' },
] as const;

export const footerNav = [
  {
    heading: 'Studio',
    links: [
      { href: '/services', label: 'Services' },
      { href: '/how-we-build', label: 'How we build' },
      { href: '/care', label: 'Care plans' },
      { href: '/work', label: 'Work' },
      { href: '/about', label: 'About' },
    ],
  },
  {
    heading: 'Clients',
    links: [
      { href: '/contact', label: 'Start a project' },
      { href: '/login', label: 'Client login' },
      { href: '/dashboard', label: 'Your dashboard' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
      { href: '/cookies', label: 'Cookies' },
    ],
  },
] as const;

/** Options for the contact form. */
export const projectTypes = [
  'A new website',
  'A website redesign',
  'An online shop',
  'A web app or portal',
  'An internal system or tool',
  'Hosting or maintenance for an existing site',
  'Something else',
] as const;

export const budgets = [
  { value: 'under_5k', label: 'Under 5k' },
  { value: '5k_15k', label: '5k to 15k' },
  { value: '15k_50k', label: '15k to 50k' },
  { value: 'over_50k', label: 'Over 50k' },
  { value: 'unsure', label: 'Not sure yet' },
] as const;

/**
 * The six stages every project moves through. Mirrors DEFAULT_STAGES in
 * kleelab-backend/src/kleelab/services/projects.py, which is what a new
 * project's dashboard actually starts with.
 */
export const processStages = [
  {
    name: 'Discovery & scope',
    short: 'We listen, ask awkward questions and write down exactly what we will build.',
    detail:
      'A call or two with the people who will use the thing. We map what you have now, what has to change and what success looks like, then send a written scope with a timeline and a fixed quote for you to sign off.',
    youDo: 'Tell us how things work today. Sign off the scope.',
  },
  {
    name: 'Design',
    short: 'Layouts and flows you can click through before a line of code is written.',
    detail:
      'We design the key screens for desktop and mobile and share a clickable prototype. Changes are cheap here, so this is where we argue about the details.',
    youDo: 'Click around, leave comments, approve the design.',
  },
  {
    name: 'Build',
    short: 'We build in small pieces and show you working software every week.',
    detail:
      'Real code on a private preview link that updates as we go. Weekly updates land in your dashboard with what moved, what is next and anything we need from you.',
    youDo: 'Answer questions, send content, try the preview.',
  },
  {
    name: 'Testing',
    short: 'Your team tries to break it. We fix what they find.',
    detail:
      'We test on real devices, check accessibility and performance, then hand the preview to your team for a round of real-world use. Every issue is tracked to done.',
    youDo: 'Use it like you will on a busy day. Report anything odd.',
  },
  {
    name: 'Launch & deploy',
    short: 'Domain, hosting, email and analytics set up properly, then we go live.',
    detail:
      'We deploy to your hosting or ours, connect the domain, set up backups and monitoring, and launch at a quiet time with someone watching.',
    youDo: 'Give the final go-ahead.',
  },
  {
    name: 'Handover',
    short: 'The keys, the code, the docs and a walkthrough. It is yours.',
    detail:
      'Every account, repository and password is transferred to you, with written documentation and a recorded walkthrough for your team. Keep us on a care plan, or run it yourselves.',
    youDo: 'Collect the keys. Decide on a care plan, or not.',
  },
] as const;
