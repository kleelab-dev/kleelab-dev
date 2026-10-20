import { clsx } from 'clsx';

/** A full-width band with the standard gutter and max width. */
export function Section({
  children,
  className,
  tone = 'graph',
  id,
}: {
  children: React.ReactNode;
  className?: string;
  tone?: 'graph' | 'white' | 'ink' | 'none';
  id?: string;
}) {
  return (
    <section
      id={id}
      className={clsx(
        'px-5 py-20 sm:px-8 sm:py-24',
        tone === 'white' && 'border-y-[1.5px] border-ink bg-white',
        tone === 'ink' && 'on-ink bg-ink text-paper',
        className,
      )}
    >
      <div className="mx-auto max-w-content">{children}</div>
    </section>
  );
}

/** Tag, headline and optional intro, in that order. */
export function SectionHeading({
  tag,
  title,
  intro,
  className,
  inverted = false,
}: {
  tag: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  className?: string;
  inverted?: boolean;
}) {
  return (
    <div className={clsx('max-w-3xl', className)}>
      <p className={clsx('tag', inverted && 'text-sun')}>{tag}</p>
      <h2 className="mt-4 font-display text-4xl font-extrabold leading-[1.02] tracking-tightest sm:text-5xl">
        {title}
      </h2>
      {intro && (
        <p className={clsx('mt-5 max-w-measure text-lg leading-relaxed', inverted ? 'text-paper/75' : 'text-muted')}>
          {intro}
        </p>
      )}
    </div>
  );
}

/** Page-top hero for inner pages. */
export function PageHero({
  tag,
  title,
  intro,
  children,
}: {
  tag: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="px-5 pb-16 pt-14 sm:px-8 sm:pb-20 sm:pt-20">
      <div className="mx-auto max-w-content">
        <p className="tag">{tag}</p>
        <h1 className="mt-5 max-w-4xl font-display text-5xl font-extrabold leading-[0.98] tracking-tightest sm:text-6xl lg:text-7xl">
          {title}
        </h1>
        {intro && <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">{intro}</p>}
        {children}
      </div>
    </section>
  );
}
