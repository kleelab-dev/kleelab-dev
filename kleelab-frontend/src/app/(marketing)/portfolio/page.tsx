import type { Metadata } from 'next';
import Link from 'next/link';
import { CallToAction } from '@/components/site/CallToAction';
import { PortfolioCard } from '@/components/site/PortfolioCard';
import { PageHero, Section, SectionHeading } from '@/components/site/Section';
import { Reveal } from '@/components/site/Reveal';
import { ButtonLink } from '@/components/ui/Button';
import { getPortfolio } from '@/lib/portfolio';

export const metadata: Metadata = {
  title: 'Portfolio: sites we built and ready-made sites',
  description: 'Sites KleeLab has built, and ready-made sites we change to suit your business and set up for you.',
  alternates: { canonical: '/portfolio' },
};

export default async function PortfolioPage() {
  const items = await getPortfolio();
  const forSale = items.filter((item) => item.kind === 'for_sale');
  const work = items.filter((item) => item.kind === 'work');

  return (
    <>
      <PageHero
        tag="Portfolio"
        title={
          <>
            Sites we built, and sites <span className="mark">ready for you.</span>
          </>
        }
        intro="Look through work we have handed over, or pick a ready-made site. We change the words, colours and pictures to suit your business, then set it up on your own domain."
      >
        {forSale.length > 0 && work.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="#ready-made" variant="secondary">Ready-made sites</ButtonLink>
            <ButtonLink href="#our-work" variant="ghost">Sites we built</ButtonLink>
          </div>
        )}
      </PageHero>

      {items.length === 0 && (
        <Section tone="white">
          <p className="max-w-xl text-lg text-muted">
            New pieces are on their way. In the meantime, see <Link href="/work" className="font-semibold text-cobalt underline">the kind of thing we build</Link>.
          </p>
        </Section>
      )}

      {forSale.length > 0 && (
        <Section tone="white" id="ready-made">
          <SectionHeading
            tag="Ready-made sites"
            title="Start from one of these."
            intro="Each one is a working site. Open the demo, then tell us what to change. It costs less and is ready sooner than starting from nothing."
          />
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {forSale.map((item, index) => (
              <Reveal key={item.slug} delay={(index % 2) * 90}>
                <PortfolioCard item={item} priority={index < 2} />
              </Reveal>
            ))}
          </div>
        </Section>
      )}

      {work.length > 0 && (
        <Section id="our-work">
          <SectionHeading tag="Our work" title="Sites we built for clients." intro="Shown with each client's agreement." />
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {work.map((item, index) => (
              <Reveal key={item.slug} delay={(index % 2) * 90}>
                <PortfolioCard item={item} priority={forSale.length === 0 && index < 2} />
              </Reveal>
            ))}
          </div>
        </Section>
      )}

      <CallToAction title="Want something like these?" />
    </>
  );
}
