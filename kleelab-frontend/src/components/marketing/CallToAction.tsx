import Link from 'next/link';

/** Closing band. One decision per action, named for what it does. */
export function CallToAction({
  eyebrow = 'Next step',
  title,
  body,
  primary,
  secondary,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <div className="rounded-2xl bg-ink px-8 py-12 text-paper sm:px-12 sm:py-16">
      <p className="font-mono text-xs uppercase tracking-label text-paper/60">{eyebrow}</p>
      <h2 className="mt-4 max-w-2xl font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        {title}
      </h2>
      {body && (
        <p className="mt-5 max-w-measure text-base leading-7 text-paper/70">{body}</p>
      )}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          href={primary.href}
          className="rounded-full bg-accent px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-dark"
        >
          {primary.label}
        </Link>
        {secondary && (
          <Link
            href={secondary.href}
            className="rounded-full border border-paper/25 px-5 py-3 text-sm font-medium text-paper transition-colors hover:border-paper/60"
          >
            {secondary.label}
          </Link>
        )}
      </div>
    </div>
  );
}
