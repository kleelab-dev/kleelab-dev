import {
  DOCUMENT_SCHEMA_VERSION,
  createNode,
  parseDocument,
  type KleeLabDocument,
  type Node,
  type Style,
} from '@/lib/document';
import type { Template } from '@/types/api';

/**
 * Starter documents for the template catalogue.
 *
 * Templates are full canonical documents (not section-name lists), so choosing
 * one genuinely changes the design. If a template record carries its own
 * `config.document` that wins — this library is the fallback used until the
 * backend seeds documents with each template.
 */

function page(title: string, children: Node[]): KleeLabDocument {
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    root: createNode('page', { title }, { children }),
  };
}

function section(style: Style, children: Node[]): Node {
  return createNode('section', {}, { style, children });
}

function hero(opts: { title: string; body: string; cta?: string; background?: Style['background'] }) {
  return section({ background: opts.background ?? 'mint', paddingY: 'lg' }, [
    createNode('heading', { text: opts.title, level: 1 }),
    createNode('text', { text: opts.body }),
    ...(opts.cta ? [createNode('button', { label: opts.cta, href: '#' })] : []),
  ]);
}

function headingSection(title: string, body: string) {
  return section({ paddingY: 'md' }, [
    createNode('heading', { text: title, level: 2 }),
    createNode('text', { text: body }),
  ]);
}

function contactSection(title = 'Get in touch', body = 'Tell us about your project.') {
  return section({ background: 'ink', color: 'paper', paddingY: 'lg' }, [
    createNode('heading', { text: title, level: 2 }),
    createNode('text', { text: body }),
    createNode('form', {
      fields: [
        { name: 'name', label: 'Name', type: 'text' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'message', label: 'Message', type: 'textarea' },
      ],
    }),
  ]);
}

const CATEGORY_DOCUMENTS: Record<string, () => KleeLabDocument> = {
  portfolio: () =>
    page('Portfolio', [
      hero({ title: 'Your name', body: 'Designer, developer, or maker — show your best work.', cta: 'See my work' }),
      section({ paddingY: 'md' }, [
        createNode('heading', { text: 'Selected work', level: 2 }),
        createNode(
          'grid',
          { columns: 3 },
          {
            style: { gap: 'md' },
            children: [
              createNode('text', { text: 'Project one' }),
              createNode('text', { text: 'Project two' }),
              createNode('text', { text: 'Project three' }),
            ],
          },
        ),
      ]),
      contactSection(),
    ]),

  business: () =>
    page('Business', [
      hero({ title: 'Grow your business', body: 'A clear, confident home for what you offer.', cta: 'Book a call' }),
      section({ paddingY: 'md' }, [
        createNode('heading', { text: 'What we do', level: 2 }),
        createNode(
          'grid',
          { columns: 3 },
          {
            style: { gap: 'md' },
            children: [
              createNode('text', { text: 'Strategy' }),
              createNode('text', { text: 'Delivery' }),
              createNode('text', { text: 'Support' }),
            ],
          },
        ),
      ]),
      headingSection('Why us', 'Replace this with the reasons your customers choose you.'),
      contactSection('Start a conversation', 'We reply within one business day.'),
    ]),

  restaurant: () =>
    page('Restaurant', [
      hero({ title: 'Our kitchen', body: 'Seasonal plates, made fresh every day.', cta: 'View the menu', background: 'canvas' }),
      section({ paddingY: 'md' }, [
        createNode('heading', { text: 'On the menu', level: 2 }),
        createNode('list', { items: ['Starter — seasonal greens', 'Main — house special', 'Dessert — daily bake'] }),
      ]),
      headingSection('Opening hours', 'Tuesday to Sunday, 12:00 until late.'),
      contactSection('Book a table', 'Reservations recommended at weekends.'),
    ]),

  coming_soon: () =>
    page('Coming soon', [
      hero({ title: 'Something good is coming', body: 'Leave your email and we will tell you first.', cta: 'Notify me' }),
      section({ paddingY: 'md' }, [
        createNode('text', { text: 'Replace this line with the story behind your launch.' }),
      ]),
    ]),

  link_in_bio: () =>
    page('Links', [
      createNode('nav', { brand: 'Your name', links: [{ label: 'Home', href: '#' }] }),
      section({ paddingY: 'lg' }, [
        createNode('heading', { text: 'Everything in one place', level: 2 }),
        createNode('list', { items: ['Latest project', 'Newsletter', 'Shop', 'Contact'] }),
      ]),
      createNode('footer', { text: '© Your name' }),
    ]),

  resume: () =>
    page('Resume', [
      hero({ title: 'Your name', body: 'Role — a one-line summary of what you do.', cta: 'Download CV', background: 'canvas' }),
      headingSection('Experience', 'Company, role, and the outcomes you delivered.'),
      section({ paddingY: 'md' }, [
        createNode('heading', { text: 'Skills', level: 2 }),
        createNode('list', { items: ['Skill one', 'Skill two', 'Skill three'] }),
      ]),
      contactSection('Contact', 'The best way to reach me.'),
    ]),

  event: () =>
    page('Event', [
      hero({ title: 'You are invited', body: 'Date, place, and what to expect.', cta: 'RSVP' }),
      section({ paddingY: 'md' }, [
        createNode('heading', { text: 'Agenda', level: 2 }),
        createNode('list', { items: ['Welcome and introductions', 'Main session', 'Q&A and close'] }),
      ]),
      contactSection('Reserve your place', 'Places are limited.'),
    ]),
};

export const TEMPLATE_CATEGORIES = Object.keys(CATEGORY_DOCUMENTS);

/** Build the starting document for a template. */
export function documentFromTemplate(template: Template): KleeLabDocument {
  const config = (template.config ?? {}) as Record<string, unknown>;

  // A template that ships its own document is authoritative.
  if (config.document) {
    return parseDocument({ document: config.document }, template.title);
  }

  const build = CATEGORY_DOCUMENTS[template.category] ?? CATEGORY_DOCUMENTS.business;
  const base = build();

  return {
    ...base,
    root: { ...base.root, props: { ...base.root.props, title: template.title } },
  };
}
