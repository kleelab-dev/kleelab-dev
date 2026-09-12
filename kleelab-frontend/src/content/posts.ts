/**
 * Studio notes.
 *
 * PLACEHOLDER COPY: written to demonstrate the shape of a post list and detail
 * page. Replace with real writing before launch.
 */

export type Post = {
  slug: string;
  title: string;
  summary: string;
  date: string;
  /** Rough reading time, in minutes. */
  readingMinutes: number;
  topic: string;
  body: { heading?: string; paragraphs: string[] }[];
};

export const posts: Post[] = [
  {
    slug: 'drag-and-drop-is-a-contract',
    title: 'Drag and drop is a contract, not a feature',
    summary:
      'A builder is only convincing when the canvas and the published page agree. Everything else is decoration.',
    date: '2025-11-04',
    readingMinutes: 4,
    topic: 'Product',
    body: [
      {
        paragraphs: [
          'Every site builder makes the same promise: what you see is what you get. Almost none of them keep it, and the reason is rarely the drag-and-drop library.',
          'The promise breaks when the editor and the published page are two different renderers. One draws with editor styling, the other with production styling, and the gap between them widens with every feature until nobody can predict what publishing will do.',
        ],
      },
      {
        heading: 'Build one renderer, use it twice',
        paragraphs: [
          'We settled this by refusing to write a second renderer. The editor canvas and the published site both walk the same document and hand each node to the same component.',
          'This constrains the design. Anything the editor cannot render, the published site cannot either - which is exactly the constraint you want. It removes an entire category of bug by making it unrepresentable.',
        ],
      },
      {
        heading: 'What it costs',
        paragraphs: [
          'You give up the freedom to have editor-only affordances in the markup, so selection outlines and drag handles live outside the rendered tree rather than inside it.',
          'You also cannot ship a block type the production site does not support, even temporarily. In practice that discipline is a feature: it stops half-finished blocks from reaching anyone.',
        ],
      },
    ],
  },
  {
    slug: 'the-cheapest-security-work',
    title: 'The cheapest security work is the work you delete',
    summary:
      'Most of the risk we have removed from client projects came from code nobody was using.',
    date: '2025-09-18',
    readingMinutes: 5,
    topic: 'Security',
    body: [
      {
        paragraphs: [
          'The single most effective change we make to an inherited codebase is deletion. Unused routes, superseded renderers, endpoints nobody calls - each one is attack surface with no upside.',
          'Publishing is a good example. A system that generates files, writes them to a temporary directory and uploads them has three places to get wrong. Rendering on request has one.',
        ],
      },
      {
        heading: 'Fewer moving parts, fewer surprises',
        paragraphs: [
          'We audited one project and found two renderers, one of which was dead. The dead one still imported the whole template engine, so it was still being reviewed, still being patched, and still shipping in the image.',
          'Deleting it removed a dependency, a service and about four hundred lines. Nothing broke, because nothing used it.',
        ],
      },
      {
        heading: 'How to find the dead weight',
        paragraphs: [
          'Search for the symbol, not the file name. A module imported nowhere is easy; a module imported once, by another dead module, is the one that survives indefinitely.',
          'Then check the deployment: if the image no longer contains it, you have finished.',
        ],
      },
    ],
  },
  {
    slug: 'we-do-not-do-everything',
    title: 'We do not do everything, and we have started saying so',
    summary:
      'Turning down work that is wrong for us has been better for clients than any pitch we have written.',
    date: '2025-07-02',
    readingMinutes: 3,
    topic: 'Studio',
    body: [
      {
        paragraphs: [
          'For the first year we said yes to everything, which meant learning six industries badly at the same time. The work was competent and none of it was good.',
          'Saying no earlier costs us revenue in the short term and has not cost us a single client we wanted.',
        ],
      },
      {
        heading: 'What we say no to',
        paragraphs: [
          'Projects where the brief is a competitor\'s website. Those cannot succeed, because the goal is someone else\'s position rather than your own.',
          'Anything where the decision-maker will not be in the room. The brief changes twice, then the budget does.',
        ],
      },
      {
        heading: 'What we do instead',
        paragraphs: [
          'If we are not the right studio, we recommend one that is. It costs us nothing and it is the fastest way to be trusted.',
        ],
      },
    ],
  },
];

export function getPost(slug: string): Post | undefined {
  return posts.find((post) => post.slug === slug);
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
