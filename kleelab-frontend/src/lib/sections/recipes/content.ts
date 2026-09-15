import { z } from 'zod';
import { band, bulletList, card, columns, heading, image, paragraph, stack } from '../_shared';
import { createNode } from '@/lib/document';
import { defineRecipe, type AnySectionRecipe } from '../types';

/**
 * The body of a page: what you offer, who you are, and the details a visitor
 * came for.
 */

const featuresThreeUp = defineRecipe({
  id: 'features.three-up',
  name: 'Features — three across',
  category: 'content',
  tags: ['features', 'services', 'benefits', 'three column', 'offer'],
  description: 'Three visible cards, each with a title and one short paragraph.',
  contentSchema: z.object({
    heading: z.string().default('What we do'),
    intro: z.string().default(''),
    items: z
      .array(z.object({ title: z.string().default('Something'), body: z.string().default('') }))
      .max(6)
      .default([
        { title: 'First', body: 'Say what it is and why it helps.' },
        { title: 'Second', body: 'One idea per card. Resist a second.' },
        { title: 'Third', body: 'Keep all three about the same length.' },
      ]),
  }),
  build: ({ heading: title, intro, items }) =>
    band({ paddingY: 'lg' }, [
      stack([
        heading(title, 2),
        ...(intro ? [paragraph(intro)] : []),
        columns(
          items.length >= 3 ? 3 : 2,
          items.map((item) => card([heading(item.title, 3), paragraph(item.body)])),
        ),
      ]),
    ]),
});

const featuresAlternating = defineRecipe({
  id: 'features.alternating',
  name: 'Features — image and text rows',
  category: 'content',
  tags: ['features', 'alternating', 'image and text', 'showcase', 'product'],
  description:
    'Image beside text, alternating sides. For a handful of things that each need explaining.',
  contentSchema: z.object({
    items: z
      .array(
        z.object({
          title: z.string().default('Something worth explaining'),
          body: z.string().default(''),
          imageSrc: z.string().default(''),
          imageAlt: z.string().default(''),
        }),
      )
      .max(4)
      .default([
        { title: 'First point', body: 'Describe it in a sentence or two.', imageSrc: '', imageAlt: '' },
        { title: 'Second point', body: 'Describe it in a sentence or two.', imageSrc: '', imageAlt: '' },
      ]),
  }),
  build: ({ items }) =>
    band({ paddingY: 'lg' }, [
      stack(
        items.map((item, index) => {
          const body = createNode('section', {}, {
            style: { padding: 'none', align: 'left' },
            children: [heading(item.title, 2), paragraph(item.body)],
          });
          const picture = createNode('section', {}, {
            style: { padding: 'none' },
            children: [image(item.imageSrc, item.imageAlt)],
          });
          // Alternating sides keep a sequence of these from reading as a list.
          return columns(2, index % 2 === 0 ? [body, picture] : [picture, body]);
        }),
      ),
    ]),
});

const aboutStory = defineRecipe({
  id: 'about.story',
  name: 'About — the story',
  category: 'content',
  tags: ['about', 'story', 'who we are', 'team', 'background'],
  description: 'A few paragraphs of narrative with a short list of facts or credentials.',
  contentSchema: z.object({
    heading: z.string().default('About us'),
    paragraphs: z
      .array(z.string())
      .max(4)
      .default([
        'Who you are, and what you were doing before this.',
        'What you believe about the work, and why it matters.',
      ]),
    facts: z.array(z.string()).max(6).default(['Founded in —', 'Based in —']),
  }),
  build: ({ heading: title, paragraphs, facts }) =>
    band({ paddingY: 'lg' }, [
      stack([
        heading(title, 2),
        ...paragraphs.map((text) => paragraph(text)),
        ...(facts.length ? [bulletList(facts)] : []),
      ]),
    ]),
});

const statsRow = defineRecipe({
  id: 'stats.row',
  name: 'Key numbers',
  category: 'proof',
  tags: ['stats', 'numbers', 'proof', 'results', 'metrics'],
  description: 'Three or four headline figures with a label each.',
  contentSchema: z.object({
    items: z
      .array(z.object({ value: z.string().default('0'), label: z.string().default('') }))
      .max(4)
      .default([
        { value: '00', label: 'Add a figure you can stand behind' },
        { value: '00', label: 'And what it measures' },
        { value: '00', label: 'And what it measures' },
      ]),
  }),
  build: ({ items }) =>
    band({ paddingY: 'lg', background: 'mint' }, [
      stack([
        columns(
          items.length >= 3 ? 3 : 2,
          items.map((item) =>
            createNode('section', {}, {
              style: { padding: 'none', align: 'center' },
              children: [heading(item.value, 2), paragraph(item.label)],
            }),
          ),
        ),
      ]),
    ]),
});

const faqList = defineRecipe({
  id: 'faq.list',
  name: 'Questions and answers',
  category: 'content',
  tags: ['faq', 'questions', 'answers', 'help', 'details'],
  description:
    'Questions with their answers shown in full. Deliberately not a collapsible accordion: the published page has no interaction layer, and shipping one that looks clickable but is not would be worse than showing the answers.',
  contentSchema: z.object({
    heading: z.string().default('Common questions'),
    items: z
      .array(z.object({ question: z.string().default('A question?'), answer: z.string().default('') }))
      .max(8)
      .default([
        { question: 'A question a customer actually asks', answer: 'Answer it directly.' },
        { question: 'Another one', answer: 'And its answer.' },
      ]),
  }),
  build: ({ heading: title, items }) =>
    band({ paddingY: 'lg' }, [
      stack([
        heading(title, 2),
        ...items.map((item) => card([heading(item.question, 3), paragraph(item.answer)])),
      ]),
    ]),
});

export const CONTENT_RECIPES: AnySectionRecipe[] = [
  featuresThreeUp,
  featuresAlternating,
  aboutStory,
  statsRow,
  faqList,
];
