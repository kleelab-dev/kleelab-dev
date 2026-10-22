/**
 * Single source of truth for studio facts and navigation.
 *
 * The header, footer, chat and every page read from here so a contact detail or
 * nav label can never drift between them. KleeLab works remotely with clients
 * anywhere, so there is deliberately no address or phone number here.
 */

export const studio = {
  name: 'KleeLab',
  tagline: 'Websites and systems, built where you can see them.',
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
      { href: '/book', label: 'Book a free call' },
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

/**
 * Budget bands in naira. Taken from 2026 Nigerian price guides: a business
 * website usually lands under ₦500k, an online shop ₦500k to ₦1.5m, and a web
 * app or internal system ₦1.5m to ₦5m and up. Mirrors BUDGET_BANDS in
 * kleelab-backend/src/kleelab/schemas/agency.py.
 */
export const budgets = [
  { value: 'under_500k', label: 'Under ₦500k' },
  { value: '500k_1_5m', label: '₦500k to ₦1.5m' },
  { value: '1_5m_5m', label: '₦1.5m to ₦5m' },
  { value: 'over_5m', label: 'Over ₦5m' },
  { value: 'unsure', label: 'Not sure yet' },
] as const;

/**
 * The six stages every project moves through. Mirrors DEFAULT_STAGES in
 * kleelab-backend/src/kleelab/services/projects.py, which is what a new
 * project's dashboard actually starts with.
 */
export const processStages = [
  {
    name: 'Planning',
    short: 'We listen, ask questions and write down exactly what we will build.',
    detail:
      'A call or two with the people who will use the thing. We map what you have now, what has to change and what success looks like, then send you a written plan with dates and a fixed price for you to approve.',
    youDo: 'Tell us how things work today. Approve the plan.',
  },
  {
    name: 'Design',
    short: 'Screens you can click through and try before we build anything.',
    detail:
      'We design the main screens for computers and phones and share a version you can click through. Changes are easy at this point, so this is where we get the details right.',
    youDo: 'Click around, leave comments, approve the design.',
  },
  {
    name: 'Build',
    short: 'We build it bit by bit and show you something working every week.',
    detail:
      'You can try it on a private preview link that updates as we go. Weekly updates land in your dashboard with what moved, what is next and anything we need from you.',
    youDo: 'Answer questions, send content, try the preview.',
  },
  {
    name: 'Testing',
    short: 'Your team tries to break it. We fix what they find.',
    detail:
      'We test it on real phones and computers, check that it is fast and easy for everyone to use, then your team tries it out. We fix every problem they find.',
    youDo: 'Use it like you will on a busy day. Report anything odd.',
  },
  {
    name: 'Going live',
    short: 'We set up your web address, hosting and email properly, then put it online.',
    detail:
      'We put it on your hosting or ours, connect your web address, set up backups and checks, and go live at a quiet time with someone watching.',
    youDo: 'Give the final go-ahead.',
  },
  {
    name: 'Hand-over',
    short: 'All the logins, the code, a written guide and a walkthrough. Then it is yours.',
    detail:
      'Every account, the code and all the logins are passed to you, with a written guide and a recorded walkthrough for your team. Pay us monthly to look after it, or run it yourselves.',
    youDo: 'Take over the logins. Decide if you want monthly care.',
  },
] as const;
