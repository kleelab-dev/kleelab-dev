import { ButtonLink } from '@/components/marketing/Button';
import { KleeLabMark } from '@/components/marketing/KleeLabLogo';

/**
 * The hero's canvas: a page being built by conversation.
 *
 * This used to be a drag-and-drop mock, with a grab handle and a drop target —
 * which was accurate once, and became a lie the moment the block palette was
 * removed. It now shows what the product actually looks like: an instruction on
 * the left, the page it changed on the right, and the change reported back.
 */
function CanvasBlock({
  label,
  delay,
  justChanged = false,
  children,
}: {
  label: string;
  delay: number;
  justChanged?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`animate-block-in relative rounded-lg border p-3.5 ${
        justChanged ? 'border-accent bg-accent/[0.04]' : 'border-line'
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="absolute -top-2 left-3 bg-white px-1.5 font-mono text-[10px] uppercase tracking-label text-muted">
        {label}
      </span>

      {justChanged && (
        <span className="absolute -top-2 right-3 bg-white px-1.5 font-mono text-[10px] uppercase tracking-label text-accent">
          changed
        </span>
      )}

      {children}
    </div>
  );
}

/** The sentence, drawn as the author typed it. */
function InstructionBubble() {
  return (
    <div className="border-b border-line bg-canvas/60 px-4 py-3.5">
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-3.5 py-2 text-[13px] leading-relaxed text-paper">
          Make the header warmer and add a section with our opening hours
        </p>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        Done — the heading is larger and warmer, and there is a new section below it.
      </p>
    </div>
  );
}

function HeroCanvas() {
  return (
    <div
      role="img"
      aria-label="Illustration: the author asks for a warmer header and an opening-hours section, and the page updates in reply."
      className="rounded-2xl border border-line bg-white shadow-[0_18px_50px_-24px_rgba(10,10,10,0.35)]"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="inline-flex items-center gap-2">
          <KleeLabMark className="h-4 w-4 text-accent" />
          <span className="font-mono text-xs text-muted">index — draft</span>
        </span>
        <span aria-hidden="true" className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
          <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
      </div>

      <InstructionBubble />

      <div className="space-y-5 p-5">
        <CanvasBlock label="Header" delay={120} justChanged>
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
            <KleeLabMark className="h-6 w-6 text-ink/20" />
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
            Describe your site. We build it.
          </h1>

          <p className="mt-6 max-w-measure text-lg leading-8 text-muted">
            Tell us what the business is in a sentence or two. KleeLab chooses the sections each
            page needs and writes the words — then you keep talking to it. Ask for a bigger
            heading, a warmer palette, another section, and watch the page change.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <ButtonLink href="/builder/new" size="lg">
              Describe your site
            </ButtonLink>
            <ButtonLink href="/contact" variant="outline" size="lg">
              Have us build it
            </ButtonLink>
          </div>

          <p className="mt-6 font-mono text-xs text-muted">
            {/* This used to promise no email was needed, which stopped being true
                the moment the builder started costing money per generation. */}
            You will need an account, which is free — your sites stay in it.
          </p>
        </div>

        <div className="animate-rise">
          <HeroCanvas />
        </div>
      </div>
    </div>
  );
}
