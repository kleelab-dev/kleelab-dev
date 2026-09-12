import type { ReactNode } from 'react';

type Tone = 'paper' | 'canvas' | 'ink';

const TONES: Record<Tone, string> = {
  paper: 'bg-paper text-ink',
  canvas: 'bg-canvas text-ink',
  ink: 'bg-ink text-paper',
};

/**
 * Vertical rhythm for every marketing section.
 *
 * Tone rather than raw classes, so alternating bands stay consistent across
 * pages and a change lands everywhere at once.
 */
export function Section({
  children,
  tone = 'paper',
  className = '',
  id,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`${TONES[tone]} py-16 sm:py-24 ${className}`}>
      <div className="mx-auto max-w-content px-6">{children}</div>
    </section>
  );
}

export function Eyebrow({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={`font-mono text-xs uppercase tracking-label text-muted ${className}`}>
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  tone = 'ink',
  className = '',
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  tone?: 'ink' | 'paper';
  className?: string;
}) {
  return (
    <div className={`max-w-2xl ${className}`}>
      {eyebrow && <Eyebrow className={tone === 'paper' ? 'text-paper/60' : ''}>{eyebrow}</Eyebrow>}
      <h2
        className={`mt-3 font-serif text-3xl leading-tight tracking-tight sm:text-4xl ${
          tone === 'paper' ? 'text-paper' : 'text-ink'
        }`}
      >
        {title}
      </h2>
      {lead && (
        <p
          className={`mt-4 max-w-measure text-base leading-7 ${
            tone === 'paper' ? 'text-paper/70' : 'text-muted'
          }`}
        >
          {lead}
        </p>
      )}
    </div>
  );
}

/** Inline text link with a trailing arrow that shifts on hover. */
export function ArrowLink({
  href,
  children,
  className = '',
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={`group inline-flex items-center gap-1.5 text-sm font-medium text-accent ${className}`}
    >
      {children}
      <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </a>
  );
}

/** The single `<h1>` band at the top of every page below the home page. */
export function PageHeader({
  eyebrow,
  title,
  lead,
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-content px-6 pb-6 pt-14 sm:pt-20">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h1 className="mt-4 max-w-3xl font-serif text-4xl leading-[1.08] tracking-tight sm:text-5xl">
        {title}
      </h1>
      {lead && <p className="mt-6 max-w-measure text-lg leading-8 text-muted">{lead}</p>}
    </div>
  );
}
