import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';

/** Centered card on graph paper, used by every sign-in style page. */
export function AuthShell({ tag, title, intro, children }: { tag: string; title: string; intro?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <main className="bg-graph grid min-h-screen place-items-center px-5 py-12 text-ink">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-block no-underline" aria-label="KleeLab home">
          <Logo className="text-2xl" />
        </Link>
        <section className="card relative mt-10 p-7 shadow-block sm:p-8">
          <div className="dim">{tag}</div>
          <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight">{title}</h1>
          {intro && <p className="mt-3 text-sm leading-6 text-muted">{intro}</p>}
          {children}
        </section>
        <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-label text-muted">
          <Link href="/" className="hover:text-ink">
            ← Back to kleelab.com
          </Link>
        </p>
      </div>
    </main>
  );
}

export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
      {children}
    </p>
  );
}

