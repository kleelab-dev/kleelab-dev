/**
 * Editorial pull-quote band.
 *
 * Deliberately not a client testimonial. Inventing endorsements and attributing
 * them to named people is fabrication, so this carries the studio's own
 * position instead. When real quotes exist, add an `attribution` and swap the
 * copy - the component already supports it.
 */
export function Statement({
  children,
  attribution = 'KleeLab',
}: {
  children: React.ReactNode;
  attribution?: string;
}) {
  return (
    <figure className="mx-auto max-w-3xl text-center">
      <blockquote className="font-serif text-2xl italic leading-snug tracking-tight sm:text-3xl">
        {children}
      </blockquote>
      <figcaption className="mt-6 font-mono text-xs uppercase tracking-label text-muted">
        {attribution}
      </figcaption>
    </figure>
  );
}
