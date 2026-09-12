import Link from 'next/link';
import { CloverMark } from '@/components/marketing/Logo';
import { footerNav, studio } from '@/content/site';

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-canvas">
      <div className="mx-auto max-w-content px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <span className="inline-flex items-center gap-2.5">
              <CloverMark className="h-6 w-6 text-accent" />
              <span className="font-serif text-xl leading-none">{studio.name}</span>
            </span>
            <p className="mt-4 max-w-measure text-sm leading-6 text-muted">{studio.tagline}</p>
            <address className="mt-5 space-y-1 font-mono text-xs not-italic text-muted">
              <div>
                <a href={`mailto:${studio.email}`} className="hover:text-ink">
                  {studio.email}
                </a>
              </div>
              <div>{studio.location}</div>
            </address>
          </div>

          {footerNav.map((group) => (
            <nav key={group.heading} aria-label={group.heading}>
              <h2 className="font-mono text-xs uppercase tracking-label text-muted">
                {group.heading}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-ink hover:text-accent">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {studio.name}. Registered in England and Wales.
          </p>
          <p className="font-mono">
            Built with the {studio.name} builder
          </p>
        </div>
      </div>
    </footer>
  );
}
