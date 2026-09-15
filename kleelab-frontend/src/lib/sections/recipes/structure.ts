import { z } from 'zod';
import { createNode } from '@/lib/document';
import { band, button, card, columns, heading, image, paragraph, stack } from '../_shared';
import { defineRecipe, type AnySectionRecipe } from '../types';

/**
 * Navigation, headers and footers — the sections that frame a page.
 *
 * A header is the first thing a visitor sees and the cheapest place to look
 * careless, so these recipes are the most prescriptive in the kit.
 */

const navBar = defineRecipe({
  id: 'nav.bar',
  name: 'Navigation bar',
  category: 'navigation',
  tags: ['nav', 'menu', 'header', 'links'],
  description: 'Brand on the left, up to five links on the right, with a hairline rule beneath.',
  contentSchema: z.object({
    brand: z.string().default('Your business'),
    links: z
      .array(z.object({ label: z.string().default('Link'), href: z.string().default('#') }))
      .max(5)
      .default([
        { label: 'Work', href: '#work' },
        { label: 'About', href: '#about' },
        { label: 'Contact', href: '#contact' },
      ]),
  }),
  build: ({ brand, links }) => createNode('nav', { brand, links }),
});

const heroSplit = defineRecipe({
  id: 'hero.split',
  name: 'Header — text and image',
  category: 'hero',
  tags: ['hero', 'header', 'intro', 'landing', 'split', 'two column'],
  description:
    'The opening statement beside an image. The most broadly useful header for a business that has a photograph to show.',
  contentSchema: z.object({
    heading: z.string().default('Say what you do, plainly'),
    body: z
      .string()
      .default('One or two sentences on who this is for and what changes for them.'),
    ctaLabel: z.string().default('Get in touch'),
    ctaHref: z.string().default('#contact'),
    imageSrc: z.string().default(''),
    imageAlt: z.string().default(''),
  }),
  build: ({ heading: title, body, ctaLabel, ctaHref, imageSrc, imageAlt }) =>
    band({ paddingY: 'xl', background: 'mint' }, [
      stack([
        columns(2, [
          createNode('section', {}, {
            style: { padding: 'none' },
            children: [heading(title, 1), paragraph(body), button(ctaLabel, ctaHref)],
          }),
          createNode('section', {}, {
            style: { padding: 'none' },
            children: [image(imageSrc, imageAlt)],
          }),
        ]),
      ]),
    ]),
});

const heroCentered = defineRecipe({
  id: 'hero.centered',
  name: 'Header — centred',
  category: 'hero',
  tags: ['hero', 'header', 'intro', 'centred', 'centered', 'simple', 'text only'],
  description: 'A centred statement with one call to action. For services and portfolios.',
  contentSchema: z.object({
    heading: z.string().default('A clear, confident opening line'),
    body: z.string().default('Two sentences at most. Say who it is for and why it is good.'),
    ctaLabel: z.string().default('See the work'),
    ctaHref: z.string().default('#work'),
  }),
  build: ({ heading: title, body, ctaLabel, ctaHref }) =>
    band({ paddingY: 'xl', align: 'center' }, [
      stack([heading(title, 1), paragraph(body), button(ctaLabel, ctaHref)]),
    ]),
});

const heroImageBelow = defineRecipe({
  id: 'hero.image-below',
  name: 'Header — image below',
  category: 'hero',
  tags: ['hero', 'header', 'banner', 'wide image', 'restaurant', 'venue'],
  description:
    'Centred copy over a full-width image. Suits restaurants, venues and anything selling an atmosphere.',
  contentSchema: z.object({
    heading: z.string().default('An opening line with presence'),
    body: z.string().default('A sentence or two of context.'),
    imageSrc: z.string().default(''),
    imageAlt: z.string().default(''),
  }),
  build: ({ heading: title, body, imageSrc, imageAlt }) =>
    band({ paddingY: 'xl', align: 'center' }, [
      stack([heading(title, 1), paragraph(body)]),
      image(imageSrc, imageAlt),
    ]),
});

const footerColumns = defineRecipe({
  id: 'footer.columns',
  name: 'Footer',
  category: 'footer',
  tags: ['footer', 'closing', 'contact details', 'legal'],
  description: 'Contact details and a short closing line, on a hairline rule.',
  contentSchema: z.object({
    columns: z
      .array(z.object({ title: z.string().default(''), body: z.string().default('') }))
      .max(4)
      .default([
        { title: 'Visit', body: 'Add your address' },
        { title: 'Contact', body: 'hello@example.com' },
        { title: 'Hours', body: 'Add your opening hours' },
      ]),
    copyright: z.string().default('© Your business'),
  }),
  build: ({ columns: cols, copyright }) =>
    createNode(
      'footer',
      { text: copyright },
      {
        children: [
          stack([
            columns(
              Math.min(Math.max(cols.length, 1), 4),
              cols.map((column) =>
                createNode('section', {}, {
                  style: { padding: 'none' },
                  children: [heading(column.title, 3), paragraph(column.body)],
                }),
              ),
            ),
          ]),
        ],
      },
    ),
});

const galleryGrid = defineRecipe({
  id: 'gallery.grid',
  name: 'Image gallery',
  category: 'content',
  tags: ['gallery', 'images', 'photos', 'portfolio', 'grid'],
  description: 'A grid of photographs. Suits portfolios, venues and product ranges.',
  contentSchema: z.object({
    heading: z.string().default('A look around'),
    items: z
      .array(z.object({ src: z.string().default(''), alt: z.string().default('') }))
      .max(9)
      .default([{ src: '', alt: '' }, { src: '', alt: '' }, { src: '', alt: '' }]),
  }),
  build: ({ heading: title, items }) =>
    band({ paddingY: 'lg' }, [
      stack([
        heading(title, 2),
        columns(
          items.length >= 3 ? 3 : 2,
          items.map((item) => image(item.src, item.alt)),
        ),
      ]),
    ]),
});

const menuList = defineRecipe({
  id: 'menu.list',
  name: 'Menu or price list',
  category: 'content',
  tags: ['menu', 'price list', 'services', 'restaurant', 'rates'],
  description: 'Named items with an optional description and price, one row each.',
  contentSchema: z.object({
    heading: z.string().default('Menu'),
    intro: z.string().default(''),
    items: z
      .array(
        z.object({
          name: z.string().default('Item'),
          detail: z.string().default(''),
          price: z.string().default(''),
        }),
      )
      .max(10)
      .default([
        { name: 'First item', detail: 'A short description', price: '' },
        { name: 'Second item', detail: 'A short description', price: '' },
      ]),
  }),
  build: ({ heading: title, intro, items }) =>
    band({ paddingY: 'lg' }, [
      stack([
        heading(title, 2),
        ...(intro ? [paragraph(intro)] : []),
        ...items.map((item) =>
          card([
            columns(2, [
              createNode('section', {}, {
                style: { padding: 'none' },
                children: [heading(item.name, 3), paragraph(item.detail)],
              }),
              createNode('section', {}, {
                style: { padding: 'none', align: 'right' },
                children: [paragraph(item.price)],
              }),
            ]),
          ]),
        ),
      ]),
    ]),
});

export const STRUCTURE_RECIPES: AnySectionRecipe[] = [
  navBar,
  heroSplit,
  heroCentered,
  heroImageBelow,
  galleryGrid,
  menuList,
  footerColumns,
];
