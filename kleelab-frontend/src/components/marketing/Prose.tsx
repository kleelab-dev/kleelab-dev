import type { ReactNode } from 'react';

/**
 * Long-form reading container for notes and legal pages.
 *
 * Descendant styling is scoped to this element so headings inside a legal page
 * cannot leak the marketing heading scale, and vice versa.
 */
export function Prose({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`max-w-measure text-base leading-7 text-ink
        [&_h2]:mt-12 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:leading-tight [&_h2]:tracking-tight
        [&_h3]:mt-8 [&_h3]:font-serif [&_h3]:text-xl
        [&_p]:mt-5 [&_p]:leading-7
        [&_ul]:mt-5 [&_ul]:space-y-2 [&_ul]:pl-5
        [&_li]:list-disc [&_li]:leading-7 [&_li::marker]:text-accent
        [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2
        [&_strong]:font-semibold
        ${className}`}
    >
      {children}
    </div>
  );
}
