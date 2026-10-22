import type { Metadata } from 'next';
import { PortfolioImage } from '@/components/site/PortfolioImage';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon, CheckIcon } from '@heroicons/react/24/outline';
import { CallToAction } from '@/components/site/CallToAction';
import { DemoButton, PortfolioEnquiry, PortfolioView } from '@/components/site/PortfolioActions';
import { Section } from '@/components/site/Section';
import { formatPrice, getPortfolioItem, shareImage, type PortfolioItem } from '@/lib/portfolio';

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://kleelab.com').replace(/\/$/, '');

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, { preview }] = await Promise.all([params, searchParams]);
  const item = await getPortfolioItem(slug, preview);
  if (!item) return { title: 'Not found' };
  const cover = item.images[0];
  return {
    title: item.title,
    description: item.summary,
    alternates: { canonical: `/portfolio/${item.slug}` },
    // A draft seen through its preview link must never reach a search engine.
    robots: item.preview ? { index: false, follow: false } : undefined,
    openGraph: {
      type: 'website',
      title: item.title,
      description: item.summary,
      url: `/portfolio/${item.slug}`,
      images: cover ? [{ ...shareImage(cover), alt: cover.alt }] : undefined,
    },
    twitter: { card: cover ? 'summary_large_image' : 'summary' },
  };
}

/** What search engines read: a product with its offer for a ready-made site, a creative work otherwise. */
function structuredData(item: PortfolioItem) {
  const url = `${BASE}/portfolio/${item.slug}`;
  const image = item.images.map((i) => i.url);
  if (item.kind === 'for_sale') {
    return {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: item.title,
      description: item.summary,
      url,
      image,
      category: item.sector ?? 'Website',
      brand: { '@type': 'Brand', name: 'KleeLab' },
      ...(item.price_cents
        ? {
            offers: {
              '@type': 'Offer',
              url,
              price: (item.price_cents / 100).toFixed(2),
              priceCurrency: item.currency,
              availability: item.sold ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
              seller: { '@type': 'Organization', name: 'KleeLab' },
            },
          }
        : {}),
    };
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: item.title,
    description: item.summary,
    url,
    image,
    creator: { '@type': 'Organization', name: 'KleeLab' },
    ...(item.client_name ? { sourceOrganization: { '@type': 'Organization', name: item.client_name } } : {}),
    ...(item.published_at ? { datePublished: item.published_at } : {}),
    keywords: item.tags.join(', ') || undefined,
  };
}

export default async function PortfolioItemPage({ params, searchParams }: Props) {
  const [{ slug }, { preview }] = await Promise.all([params, searchParams]);
  const item = await getPortfolioItem(slug, preview);
  if (!item) notFound();

  const forSale = item.kind === 'for_sale';
  const [cover, ...rest] = item.images;
  const paragraphs = (item.body ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <>
      <script
        type="application/ld+json"
        // Escape "<" so text from the editor can never close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(item)).replace(/</g, '\\u003c') }}
      />
      {!item.preview && <PortfolioView slug={item.slug} />}

      {item.preview && (
        <div role="status" className="border-b-[1.5px] border-ink bg-sun px-5 py-2.5 text-center font-mono text-[11px] uppercase tracking-label sm:px-8">
          Preview · visitors cannot see this yet
        </div>
      )}

      <section className="px-5 pb-12 pt-10 sm:px-8 sm:pt-14">
        <div className="mx-auto max-w-content">
          <Link href="/portfolio" className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-label text-muted hover:text-ink">
            <ArrowLeftIcon className="h-3.5 w-3.5" aria-hidden /> Portfolio
          </Link>
          <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-label">
            <span className="text-cobalt">{forSale ? 'Ready-made site' : 'Site we built'}</span>
            {item.sector && <span className="rounded-full border border-line px-2 py-0.5 text-muted">{item.sector}</span>}
            {item.sold && <span className="rounded-full bg-ink px-2 py-0.5 text-paper">Sold</span>}
          </div>
          <h1 className="mt-4 max-w-4xl font-display text-5xl font-extrabold leading-[0.98] tracking-tightest sm:text-6xl">
            {item.title}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">{item.summary}</p>
          {item.demo_url && (
            <div className="mt-8">
              <DemoButton slug={item.slug} url={item.demo_url} count={!item.preview} />
            </div>
          )}
        </div>
      </section>

      {cover && (
        <section className="px-5 sm:px-8">
          <div className="mx-auto max-w-content">
            <figure className="overflow-hidden rounded-2xl border-[1.5px] border-ink bg-paper shadow-block">
              <PortfolioImage
                src={cover.url}
                alt={cover.alt}
                width={cover.width ?? 1600}
                height={cover.height ?? 1000}
                sizes="(min-width: 1200px) 1200px, 100vw"
                // A full-page capture shows its top part; the rest is in the demo.
                className="h-auto max-h-[78vh] w-full object-cover object-top"
                priority
              />
            </figure>
          </div>
        </section>
      )}

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0">
            {paragraphs.length > 0 && (
              <div className="max-w-measure space-y-5 text-lg leading-relaxed">
                {paragraphs.map((p, n) => (
                  <p key={n} className="whitespace-pre-line">{p}</p>
                ))}
              </div>
            )}

            {forSale && (item.includes.length > 0 || item.customisable.length > 0) && (
              <div className="mt-12 grid gap-6 sm:grid-cols-2">
                {item.includes.length > 0 && <List title="What you get" items={item.includes} />}
                {item.customisable.length > 0 && <List title="We change to suit you" items={item.customisable} />}
              </div>
            )}

            {rest.length > 0 && (
              <div className="mt-12 grid gap-6 sm:grid-cols-2">
                {rest.map((image) => (
                  <figure key={image.url} className="overflow-hidden rounded-xl border-[1.5px] border-ink bg-paper">
                    <PortfolioImage
                      src={image.url}
                      alt={image.alt}
                      width={image.width ?? 1200}
                      height={image.height ?? 750}
                      sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
                      className="h-auto w-full"
                    />
                    {image.alt && <figcaption className="border-t-[1.5px] border-ink bg-white px-4 py-2.5 text-sm text-muted">{image.alt}</figcaption>}
                  </figure>
                ))}
              </div>
            )}

            {item.tags.length > 0 && (
              <ul className="mt-12 flex flex-wrap gap-2">
                {item.tags.map((tag) => (
                  <li key={tag} className="rounded-full bg-white px-3 py-1 font-mono text-[11px] text-ink">{tag}</li>
                ))}
              </ul>
            )}
          </div>

          <aside className="grid content-start gap-6 lg:sticky lg:top-24">
            {forSale ? (
              <div className="card p-6">
                <p className="tag">Price</p>
                {item.price_cents ? (
                  <>
                    <p className="mt-3 font-display text-4xl font-extrabold tracking-tight">
                      <span className="mr-1.5 align-middle font-mono text-xs font-normal uppercase tracking-label text-muted">from</span>
                      {formatPrice(item.price_cents, item.currency)}
                    </p>
                    <dl className="mt-5 grid gap-2 text-sm">
                      {item.delivery_days && <Fact label="Ready in">{item.delivery_days} working days</Fact>}
                      <Fact label="Sold">{item.exclusive ? 'Once only. It is yours alone.' : 'More than once, changed for each buyer'}</Fact>
                    </dl>
                  </>
                ) : (
                  <p className="mt-3 leading-relaxed text-muted">
                    This one has been sold. Tell us about your business and we will build you something like it.
                  </p>
                )}
              </div>
            ) : (
              item.client_name && (
                <div className="card p-6">
                  <p className="tag">Client</p>
                  <p className="mt-3 font-display text-2xl font-extrabold tracking-tight">{item.client_name}</p>
                </div>
              )
            )}
            {!item.preview && <PortfolioEnquiry slug={item.slug} title={item.title} forSale={forSale && !item.sold} />}
          </aside>
        </div>
      </Section>

      <CallToAction title={forSale ? 'Not quite right?' : 'Want one of your own?'} body="Tell us what you need, or pick a time for a short first call. It is free, and you are not committing to anything." />
    </>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="card p-6">
      <h2 className="font-display text-xl font-extrabold tracking-tight">{title}</h2>
      <ul className="mt-4 grid gap-2.5">
        {items.map((text) => (
          <li key={text} className="flex gap-2.5 leading-snug">
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-cobalt" aria-hidden />
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-t border-line pt-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold">{children}</dd>
    </div>
  );
}
