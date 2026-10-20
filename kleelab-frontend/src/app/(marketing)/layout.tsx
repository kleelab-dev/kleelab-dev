import { EnquiryChat } from '@/components/site/EnquiryChat';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';

/** Shell for the public site: header, footer and the enquiry chat on every page. */
export default function MarketingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="bg-graph flex min-h-screen flex-col">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <EnquiryChat />
    </div>
  );
}
