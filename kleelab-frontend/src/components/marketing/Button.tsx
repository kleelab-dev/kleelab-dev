import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * The marketing site's one button.
 *
 * Every call-to-action used to hand-roll its own classes, and they had drifted:
 * three different paddings, one with no transition at all, and a primary that
 * was `bg-accent` on a `bg-ink` card - black on black, so the most important
 * link on the page rendered as bare text. Naming the variants here means the
 * shape is decided once.
 *
 * `inverse` and `outline-inverse` exist for the dark call-to-action band, where
 * an ink button has nowhere to go.
 */

type Variant = 'primary' | 'inverse' | 'outline' | 'outline-inverse';
type Size = 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-paper hover:bg-ink-soft',
  inverse: 'bg-paper text-ink hover:bg-canvas',
  outline: 'border border-line-strong text-ink hover:border-ink',
  'outline-inverse': 'border border-paper/25 text-paper hover:border-paper/60',
};

// Two sizes, so a button in a sidebar and a button in a hero are the same
// object at different weights rather than two unrelated ones.
const SIZES: Record<Size, string> = {
  md: 'px-5 py-2.5',
  lg: 'px-6 py-3',
};

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium ' +
  'transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50';

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

function classes({ variant = 'primary', size = 'md', className = '' }: CommonProps) {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
}

/** A button that navigates. Internal by default; pass `external` for mailto and off-site. */
export function ButtonLink({
  href,
  external = false,
  onClick,
  ...rest
}: CommonProps & { href: string; external?: boolean; onClick?: () => void }) {
  const className = classes(rest);

  if (external) {
    return (
      <a href={href} className={className} onClick={onClick}>
        {rest.children}
      </a>
    );
  }

  return (
    <Link href={href} className={className} onClick={onClick}>
      {rest.children}
    </Link>
  );
}

/** A button that submits or acts. */
export function Button({
  type = 'button',
  disabled = false,
  onClick,
  ...rest
}: CommonProps & {
  type?: 'button' | 'submit';
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={classes(rest)}>
      {rest.children}
    </button>
  );
}
