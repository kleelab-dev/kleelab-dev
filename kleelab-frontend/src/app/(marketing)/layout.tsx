import { SiteFooter } from '@/components/marketing/SiteFooter';
import { SiteHeader } from '@/components/marketing/SiteHeader';

/**
 * Shell for the public marketing site.
 *
 * The builder routes sit outside this group so they keep their own chrome and
 * do not inherit a marketing header they would have to fight.
 */
export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      {/* First thing in the tab order. Without it, reaching the content on any
          page means tabbing past the wordmark and five nav links every time.
          `tabIndex={-1}` on the target is what makes focus actually move. */}
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
