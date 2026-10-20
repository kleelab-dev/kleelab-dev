import Link from 'next/link';
import { clsx } from 'clsx';
import type { ComponentProps } from 'react';

type Variant = 'primary' | 'secondary' | 'sun' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold no-underline transition-[background-color,color,box-shadow,transform] duration-150 disabled:opacity-50';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-cobalt text-white hover:bg-cobalt-dark',
  secondary: 'border-[1.5px] border-ink bg-transparent text-ink hover:bg-ink hover:text-paper',
  sun: 'border-[1.5px] border-ink bg-sun text-ink shadow-block-sm hover:-translate-y-px hover:shadow-block',
  ghost: 'text-ink hover:bg-ink/5',
  danger: 'border-[1.5px] border-danger text-danger hover:bg-danger hover:text-white',
};

const SIZES: Record<Size, string> = {
  sm: 'px-3.5 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-6 py-3.5 text-base',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return clsx(BASE, VARIANTS[variant], SIZES[size], className);
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
