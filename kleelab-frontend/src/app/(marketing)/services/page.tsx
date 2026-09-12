import type { Metadata } from 'next';
import { ServiceCard } from '@/components/marketing/Cards';
import { CallToAction } from '@/components/marketing/CallToAction';
import { PageHeader, Section, SectionHeading } from '@/components/marketing/Section';
import { pricingModel, services } from '@/content/services';

export const metadata: Metadata = {
  title: 'Services',
  description:
    'Websites, online shops, web apps and ongoing care. How KleeLab scopes, prices and delivers studio projects.',
};

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Services"
        title="What you get, and what it costs."
        lead="Four services, fixed quotes, and a first call at no charge. If your project is not a fit, we will tell you on that call rather than three weeks in."
      />

      <Section>
        <div className="grid gap-x-10 gap-y-12 md:grid-cols-2">
          {services.map((service, index) => (
            <ServiceCard key={service.slug} service={service} index={index} />
          ))}
        </div>
      </Section>

      <Section tone="canvas">
        <SectionHeading
          eyebrow="How we work"
          title="No surprises on the invoice."
          lead="Every engagement follows the same three rules, whatever the size of the project."
        />
        <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {pricingModel.map((item) => (
            <div key={item.heading} className="border-t border-line pt-6">
              <h3 className="font-serif text-xl leading-snug">{item.heading}</h3>
              <p className="mt-3 text-sm leading-6 text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeading
          eyebrow="Not sure which you need?"
          title="Most people are not, and that is fine."
          lead="The first call exists to work that out. Bring the problem rather than the solution — it is usually cheaper that way."
        />
        <div className="mt-10">
          <CallToAction
            eyebrow="Start here"
            title="Book a thirty-minute call."
            body="No charge, no obligation, and no slide deck. We will tell you what we would do and what it would cost."
            primary={{ href: '/contact', label: 'Talk to the studio' }}
            secondary={{ href: '/work', label: 'See our work' }}
          />
        </div>
      </Section>
    </>
  );
}
