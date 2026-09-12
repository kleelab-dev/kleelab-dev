import { studio } from '@/content/site';

/**
 * The studio mark.
 *
 * "Klee" is German for clover, so the mark is a four-leaf clover drawn from four
 * circles - geometric enough to read at 16px, organic enough not to look like a
 * generic tech glyph.
 */
export function CloverMark({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className} fill="none">
      <circle cx="16" cy="9.5" r="6" fill="currentColor" />
      <circle cx="22.5" cy="16" r="6" fill="currentColor" />
      <circle cx="16" cy="22.5" r="6" fill="currentColor" />
      <circle cx="9.5" cy="16" r="6" fill="currentColor" />
      <circle cx="16" cy="16" r="2.25" fill="rgb(var(--paper))" />
    </svg>
  );
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <CloverMark className="h-6 w-6 text-accent" />
      <span className="font-serif text-xl leading-none tracking-tight">{studio.name}</span>
    </span>
  );
}
