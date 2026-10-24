import Link from 'next/link';
import { footerNav, studio } from '@/content/site';
import { Logo } from '@/components/ui/Logo';

export function SiteFooter() {
  return (
    <footer className="on-ink bg-ink px-5 pb-10 pt-16 text-paper sm:px-8">
      <div className="mx-auto max-w-content">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_2fr]">
          <div>
            <Logo inverted className="text-3xl" />
            <p className="mt-4 max-w-sm leading-relaxed text-paper/70">
              We design and build websites and systems for organisations and businesses, and you watch every step
              from your own dashboard.
            </p>
            <a href={`mailto:${studio.email}`} className="mt-6 inline-block font-mono text-sm text-sun no-underline hover:underline">
              {studio.email}
            </a>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {footerNav.map((group) => (
              <div key={group.heading}>
                <p className="font-mono text-[11px] uppercase tracking-label text-paper/50">{group.heading}</p>
                <ul className="mt-4 grid gap-2.5">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="text-sm text-paper/85 no-underline hover:text-sun">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-14 flex flex-col justify-between gap-3 border-t border-paper/15 pt-6 font-mono text-[11px] uppercase tracking-label text-paper/50 sm:flex-row">
          <span>
            © {new Date().getFullYear()} {studio.name}
          </span>
          <span>Designed, built and handed over with care</span>
        </div>
      </div>
    </footer>
  );
}
