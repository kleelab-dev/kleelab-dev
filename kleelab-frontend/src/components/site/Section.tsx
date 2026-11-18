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

/** Page-top hero for inner pages. With `aside`, the text sits left and the aside right from `lg`, below on phones. */
export function PageHero({
  tag,
  title,
  intro,
  children,
  aside,
}: {
  tag: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  children?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  const text = (
    <>
      {/* Rises in line by line on arrival, like the home page's opening. */}
      <p className="tag kl-hero-in">{tag}</p>
      <h1
        className={clsx(
          'kl-hero-in mt-5 max-w-4xl font-display text-5xl font-extrabold leading-[0.98] tracking-tightest sm:text-6xl',
          aside ? 'lg:text-6xl xl:text-7xl' : 'lg:text-7xl',
        )}
        style={{ animationDelay: '80ms' }}
      >
        {title}
      </h1>
      {intro && (
        <p className="kl-hero-in mt-6 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl" style={{ animationDelay: '180ms' }}>
          {intro}
        </p>
      )}
      {children && (
        <div className="kl-hero-in" style={{ animationDelay: '260ms' }}>
          {children}
        </div>
      )}
    </>
  );
  return (
    // Asides carry rotated stamps and dimension lines; clip them sideways so phones never scroll.
    <section className={clsx('px-5 pb-16 pt-14 sm:px-8 sm:pb-20 sm:pt-20', aside && 'overflow-x-clip')}>
      <div className="mx-auto max-w-content">
        {aside ? (
          <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14">
            <div className="min-w-0">{text}</div>
            <div className="kl-hero-in min-w-0" style={{ animationDelay: '320ms' }}>
              {aside}
            </div>
          </div>
        ) : (
          text
        )}
      </div>
    </section>
  );
}
