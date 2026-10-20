import { ButtonLink } from '@/components/ui/Button';
import { AskButton } from '@/components/site/AskButton';

/** The closing band on most pages. */
export function CallToAction({
  title = 'Got something to build?',
  body = 'Tell us what you need. We will reply within a working day to set up a short first call. It is free, and you are not committing to anything.',
}: {
  title?: string;
  body?: string;
}) {
  return (
    <section className="px-5 py-20 sm:px-8">
      <div className="relative mx-auto max-w-content overflow-hidden rounded-3xl border-[1.5px] border-ink bg-sun p-8 shadow-block sm:p-14">
        <span className="stamp absolute right-6 top-6 hidden bg-sun sm:inline-block">Ready to start</span>
        <h2 className="max-w-2xl font-display text-4xl font-extrabold leading-[1.02] tracking-tightest sm:text-6xl">{title}</h2>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink/80">{body}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/contact" size="lg">
            Start a project
          </ButtonLink>
          <AskButton size="lg" className="bg-white">
            Ask a quick question
          </AskButton>
        </div>
      </div>
    </section>
  );
}
