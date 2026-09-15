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
          imageIntent: z.string().default('A photograph supporting this point'),
        }),
      )
      .max(4)
      .default([
        { title: 'First point', body: 'Describe it in a sentence or two.', imageSrc: '', imageAlt: '', imageIntent: 'A photograph supporting this point' },
        { title: 'Second point', body: 'Describe it in a sentence or two.', imageSrc: '', imageAlt: '', imageIntent: 'A photograph supporting this point' },
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
            children: [image(item.imageSrc, item.imageAlt, item.imageIntent)],
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
  description: 'Three or four headline figures with a label each, on a tinted band.',
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
              // The figure carries the theme's accent: a page of entirely
              // greyscale text has no focal points, and this is the one place a
              // number is meant to be the loudest thing on the band.
              children: [heading(item.value, 2, { color: 'accent' }), paragraph(item.label)],
            }),
          ),
        ),
      ]),
    ]),
});

/**
 * A bold, single-colour band.
 *
 * The one section in the kit that commits to a full accent background. Used
 * between two plain sections it gives a page a spine; used twice it becomes
 * shouty, which is why the prompt is told to place it at most once.
 */
const statsBanner = defineRecipe({
  id: 'stats.banner',
  name: 'Numbers on colour',
  category: 'proof',
  tags: ['stats', 'numbers', 'banner', 'bold', 'accent', 'colour'],
  description:
    'Big figures on a full accent-coloured band. A deliberate jolt of colour between two plainer sections.',
  contentSchema: z.object({
    items: z
      .array(z.object({ value: z.string().default('00'), label: z.string().default('') }))
      .max(3)
      .default([
        { value: '00', label: 'A figure worth leading with' },
        { value: '00', label: 'And what it measures' },
      ]),
  }),
  build: ({ items }) =>
    band({ paddingY: 'lg', background: 'accent', color: 'paper' }, [
      stack([
        columns(
          items.length >= 3 ? 3 : 2,
          items.map((item) =>
            createNode('section', {}, {
              style: { padding: 'none', align: 'center' },
              children: [
                // Both the figure and its label are inverted: the paragraph
                // renderer's default is the muted colour, which on an accent
                // band is close to invisible.
                heading(item.value, 2, { color: 'paper' }),
                paragraph(item.label, { color: 'paper' }),
              ],
            }),
          ),
        ),
      ]),
    ]),
});

const featureSingle = defineRecipe({
  id: 'feature.single',
  name: 'Feature — one big point',
  category: 'content',
  tags: ['feature', 'single', 'image', 'explain', 'detail', 'photograph'],
  description:
    'One thing, explained properly, beside a photograph. For the single most important claim a business makes.',
  contentSchema: z.object({
    heading: z.string().default('The one thing worth knowing'),
    body: z.string().default('Two or three sentences. This is the section that does the persuading.'),
    points: z.array(z.string()).max(5).default(['A supporting detail']),
    imageSrc: z.string().default(''),
    imageAlt: z.string().default(''),
    imageIntent: z.string().default('A photograph of the work, the product or the place'),
  }),
  build: ({ heading: title, body, points, imageSrc, imageAlt, imageIntent }) =>
    band({ paddingY: 'lg' }, [
      stack([
        columns(2, [
          createNode('section', {}, {
            style: { padding: 'none' },
            children: [image(imageSrc, imageAlt, imageIntent)],
          }),
          createNode('section', {}, {
            style: { padding: 'none' },
            children: [heading(title, 2), paragraph(body), ...(points.length ? [bulletList(points)] : [])],
          }),
        ]),
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
  featureSingle,
  aboutStory,
  statsRow,
  statsBanner,
  faqList,
];
