import { z } from 'zod';
import { createNode } from '@/lib/document';
import { band, button, bulletList, card, columns, heading, paragraph, stack } from '../_shared';
import { defineRecipe, type AnySectionRecipe } from '../types';

/**
 * Sections whose job is to make something happen: a price chosen, a message
 * sent, an order placed.
 */

const pricingTiers = defineRecipe({
  id: 'pricing.tiers',
  name: 'Pricing',
  category: 'conversion',
  tags: ['pricing', 'plans', 'tiers', 'packages', 'cost', 'rates'],
  description: 'Two to four price cards, each with a short list of what is included.',
  contentSchema: z.object({
    heading: z.string().default('Pricing'),
    intro: z.string().default(''),
    tiers: z
      .array(
        z.object({
          name: z.string().default('Plan'),
          price: z.string().default('£0'),
          cadence: z.string().default(''),
          features: z.array(z.string()).max(8).default(['What is included']),
          ctaLabel: z.string().default('Choose this'),
          ctaHref: z.string().default('#contact'),
        }),
      )
      .max(4)
      .default([
        { name: 'One', price: '£00', cadence: 'per month', features: ['What is included', 'And what is not'], ctaLabel: 'Enquire', ctaHref: '#contact' },
        { name: 'Two', price: '£00', cadence: 'per month', features: ['Everything in One', 'Plus more'], ctaLabel: 'Enquire', ctaHref: '#contact' },
        { name: 'Three', price: 'Bespoke', cadence: '', features: ['Everything in Two', 'And a conversation'], ctaLabel: 'Talk to us', ctaHref: '#contact' },
      ]),
  }),
  build: ({ heading: title, intro, tiers }) =>
    band({ paddingY: 'lg' }, [
      stack([
        heading(title, 2),
        ...(intro ? [paragraph(intro)] : []),
        columns(
          tiers.length >= 3 ? 3 : 2,
          tiers.map((tier) =>
            card([
              heading(tier.name, 3),
              // The price is the thing being compared, so it carries the accent.
              heading(tier.price, 2, { color: 'accent' }),
              ...(tier.cadence ? [paragraph(tier.cadence)] : []),
              bulletList(tier.features),
              button(tier.ctaLabel, tier.ctaHref),
            ]),
          ),
        ),
      ]),
    ]),
});

const testimonialsCards = defineRecipe({
  id: 'testimonials.cards',
  name: 'Testimonials',
  category: 'proof',
  tags: ['testimonials', 'reviews', 'quotes', 'social proof', 'customers'],
  description: 'Quotes in cards, each attributed. Only use with quotes you actually have.',
  contentSchema: z.object({
    heading: z.string().default('What customers say'),
    items: z
      .array(
        z.object({
          quote: z.string().default('A quote from a real customer.'),
          attribution: z.string().default('Name, role'),
        }),
      )
      .max(6)
      .default([
        { quote: 'Replace this with a quote you have permission to use.', attribution: 'Name, role' },
        { quote: 'Replace this with a quote you have permission to use.', attribution: 'Name, role' },
      ]),
  }),
  build: ({ heading: title, items }) =>
    band({ paddingY: 'lg', background: 'mint' }, [
      stack([
        heading(title, 2),
        columns(
          items.length >= 3 ? 3 : 2,
          items.map((item) => card([paragraph(item.quote), heading(item.attribution, 4)])),
        ),
      ]),
    ]),
});

const ctaBanner = defineRecipe({
  id: 'cta.banner',
  name: 'Call to action band',
  category: 'conversion',
  tags: ['cta', 'call to action', 'banner', 'closing', 'get in touch'],
  description: 'A dark band with one action. Put it near the end of a long page.',
  contentSchema: z.object({
    heading: z.string().default('Ready when you are'),
    body: z.string().default('A single sentence telling the reader what happens next.'),
    ctaLabel: z.string().default('Start a conversation'),
    ctaHref: z.string().default('#contact'),
  }),
  build: ({ heading: title, body, ctaLabel, ctaHref }) =>
    // The button is inverted onto paper here. Left to its default it paints the
    // theme accent, which on a dark band is the same colour as the band.
    band({ paddingY: 'xl', background: 'ink', color: 'paper', align: 'center' }, [
      stack([
        heading(title, 2),
        paragraph(body),
        createNode('button', { label: ctaLabel, href: ctaHref }, {
          style: { background: 'paper', color: 'ink' },
        }),
      ]),
    ]),
});

const contactForm = defineRecipe({
  id: 'contact.form',
  name: 'Contact — details and form',
  category: 'conversion',
  tags: ['contact', 'enquiry', 'form', 'email', 'get in touch', 'booking'],
  description: 'Contact details beside an enquiry form.',
  contentSchema: z.object({
    heading: z.string().default('Get in touch'),
    body: z.string().default('Tell the reader how quickly you reply, and to what.'),
    details: z.array(z.string()).max(5).default(['hello@example.com']),
    fields: z
      .array(z.object({ name: z.string().default('field'), label: z.string().default('Field'), type: z.string().default('text') }))
      .max(6)
      .default([
        { name: 'name', label: 'Name', type: 'text' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'message', label: 'Message', type: 'textarea' },
      ]),
  }),
  build: ({ heading: title, body, details, fields }) =>
    band({ paddingY: 'lg' }, [
      stack([
        columns(2, [
          createNode('section', {}, {
            style: { padding: 'none' },
            children: [heading(title, 2), paragraph(body), bulletList(details)],
          }),
          createNode('form', { fields }),
        ]),
      ]),
    ]),
});

const shopGrid = defineRecipe({
  id: 'shop.grid',
  name: 'Shop',
  category: 'commerce',
  tags: ['shop', 'products', 'store', 'sell', 'catalogue', 'ecommerce'],
  description:
    'Your catalogue, with a cart. Products and stock are managed under Products for this site; the block shows whatever is live.',
  contentSchema: z.object({
    heading: z.string().default('Shop'),
    intro: z.string().default(''),
    columnCount: z.number().default(3),
    showPrices: z.boolean().default(true),
  }),
  build: ({ heading: title, intro, columnCount, showPrices }) =>
    band({ paddingY: 'lg' }, [
      stack([
        heading(title, 2),
        ...(intro ? [paragraph(intro)] : []),
        createNode('product_grid', {
          columns: Math.min(Math.max(columnCount, 1), 4),
          showPrices,
        }),
      ]),
    ]),
});

export const CONVERSION_RECIPES: AnySectionRecipe[] = [
  pricingTiers,
  testimonialsCards,
  ctaBanner,
  contactForm,
  shopGrid,
];
