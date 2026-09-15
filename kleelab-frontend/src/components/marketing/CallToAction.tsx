import { ButtonLink } from '@/components/marketing/Button';

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
    // `on-ink` flips the focus ring to paper; without it the ring is the same
    // colour as this band and keyboard focus disappears here.
    <div className="on-ink rounded-2xl bg-ink px-8 py-12 text-paper sm:px-12 sm:py-16">
      <p className="font-mono text-xs uppercase tracking-label text-paper/60">{eyebrow}</p>
      <h2 className="mt-4 max-w-2xl font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        {title}
      </h2>
      {body && (
        <p className="mt-5 max-w-measure text-base leading-7 text-paper/70">{body}</p>
      )}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        {/* Was `bg-accent`, which is the same hex as this card's `bg-ink` - the
            primary action was invisible. Inverted instead. */}
        <ButtonLink href={primary.href} variant="inverse" size="lg">
          {primary.label}
        </ButtonLink>
        {secondary && (
          <ButtonLink href={secondary.href} variant="outline-inverse" size="lg">
            {secondary.label}
          </ButtonLink>
        )}
      </div>
    </div>
  );
}
