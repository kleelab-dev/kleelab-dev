/**
 * Single source of truth for studio facts and navigation.
 *
 * The header, footer and every page read from here so a phone number or nav
 * label can never drift between them.
 */

export const studio = {
  name: 'KleeLab',
  tagline: 'We build cute, secure digital products.',
  /** TODO: confirm the real inbox before launch. */
  email: 'hello@kleelab.com',
  /** TODO: confirm before launch. */
  phone: '+44 20 7946 0958',
  location: 'London, United Kingdom',
  founded: 2024,
};

export const primaryNav = [
  { href: '/services', label: 'Services' },
  { href: '/work', label: 'Work' },
  { href: '/about', label: 'Studio' },
  { href: '/blog', label: 'Notes' },
] as const;

export const footerNav = [
  {
    heading: 'Studio',
    links: [
      { href: '/services', label: 'Services' },
      { href: '/work', label: 'Work' },
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    heading: 'Product',
    links: [
      { href: '/builder/new', label: 'Build a site' },
      { href: '/builder/dashboard', label: 'Your sites' },
      { href: '/blog', label: 'Notes' },
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

/** Options for the contact form. Kept here so the studio can edit one list. */
export const projectTypes = [
  'A new website',
  'A website redesign',
  'An online shop',
  'A web app or internal tool',
  'Brand and identity',
  'Something else',
] as const;
