import { clsx } from 'clsx';

/** The KleeLab wordmark: heavy grotesque, with "Lab" in the cobalt pen. */
export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span
      className={clsx(
        'font-display text-xl font-extrabold tracking-tight',
        inverted ? 'text-paper' : 'text-ink',
        className,
      )}
    >
      Klee<span className={inverted ? 'text-sun' : 'text-cobalt'}>Lab</span>
    </span>
  );
}
