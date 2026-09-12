import Link from 'next/link';
import { CloverMark } from '@/components/marketing/Logo';

/**
 * The hero's canvas: a page being assembled out of blocks on the editor.
 *
 * This is the most characteristic thing in the subject's world - KleeLab is a
 * builder, so the product shows itself working rather than being described. The
 * blocks arrive in sequence, the first one carrying the selection and drag
 * chrome, so the sequence reads as assembly rather than decoration.
 */
function CanvasBlock({
  label,
  delay,
  selected = false,
  children,
}: {
  label: string;
  delay: number;
  selected?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`animate-block-in relative rounded-lg border p-3.5 ${
        selected ? 'border-accent bg-accent/[0.04]' : 'border-line'
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="absolute -top-2 left-3 bg-white px-1.5 font-mono text-[10px] uppercase tracking-label text-muted">
        {label}
      </span>

      {selected && (
        <>
          {/* Drag handle, as the editor draws it. */}
          <span
            aria-hidden="true"
            className="absolute -left-2.5 top-1/2 grid -translate-y-1/2 grid-cols-1 gap-[3px] rounded-full border border-accent bg-white p-1.5"
          >
            {[0, 1, 2].map((row) => (
              <span key={row} className="flex gap-[3px]">
                <span className="h-[3px] w-[3px] rounded-full bg-accent" />
                <span className="h-[3px] w-[3px] rounded-full bg-accent" />
              </span>
            ))}
          </span>
          {/* Drop target below the block. */}
          <span
            aria-hidden="true"
            className="absolute -bottom-[7px] left-0 right-0 h-0.5 rounded-full bg-accent"
          />
        </>
      )}

      {children}
    </div>
  );
}

function HeroCanvas() {
  return (
    <div
      role="img"
      aria-label="Illustration: a page being assembled from heading, text and image blocks on the KleeLab editor canvas."
      className="rounded-2xl border border-line bg-white shadow-[0_18px_50px_-24px_rgba(23,35,28,0.35)]"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="inline-flex items-center gap-2">
          <CloverMark className="h-4 w-4 text-accent" />
          <span className="font-mono text-xs text-muted">index — draft</span>
        </span>
        <span aria-hidden="true" className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
          <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
      </div>

      <div className="space-y-5 p-5">
        <CanvasBlock label="Heading" delay={120} selected>
          <div className="h-5 w-4/5 rounded-sm bg-ink/85" />
          <div className="mt-2.5 h-5 w-1/2 rounded-sm bg-ink/25" />
        </CanvasBlock>

        <CanvasBlock label="Text" delay={300}>
          <div className="h-2.5 w-full rounded-full bg-ink/15" />
          <div className="mt-2 h-2.5 w-[92%] rounded-full bg-ink/15" />
          <div className="mt-2 h-2.5 w-2/3 rounded-full bg-ink/15" />
        </CanvasBlock>

        <CanvasBlock label="Image" delay={480}>
          <div className="grid h-24 place-items-center rounded-md bg-canvas">
            <CloverMark className="h-6 w-6 text-ink/20" />
          </div>
        </CanvasBlock>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <div className="mx-auto max-w-content px-6 pb-16 pt-14 sm:pb-24 sm:pt-20">
      <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <div>
          <p className="font-mono text-xs uppercase tracking-label text-muted">
            Studio · Founded 2024
          </p>

          <h1 className="mt-5 font-serif text-4xl leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Build it yourself, or have us build it.
          </h1>

          <p className="mt-6 max-w-measure text-lg leading-8 text-muted">
            KleeLab is a small studio in London. Use our builder to put a site up yourself this
            afternoon, or hand it over and we will design and build it properly.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/builder/new"
              className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper transition-colors hover:bg-ink-soft"
            >
              Start building
            </Link>
            <Link
              href="/contact"
              className="rounded-full border border-line-strong px-6 py-3 text-sm font-medium text-ink transition-colors hover:border-ink"
            >
              Talk to the studio
            </Link>
          </div>

          <p className="mt-6 font-mono text-xs text-muted">
            No card, no trial, no email required to try the builder.
          </p>
        </div>

        <div className="animate-rise">
          <HeroCanvas />
        </div>
      </div>
    </div>
  );
}
