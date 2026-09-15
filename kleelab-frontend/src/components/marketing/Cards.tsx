import Link from 'next/link';
import { KleeLabMark } from '@/components/marketing/KleeLabLogo';
import { formatDate } from '@/content/posts';
import type { Post } from '@/content/posts';
import type { Service } from '@/content/services';
import type { CaseStudy } from '@/content/work';

export function ServiceCard({ service, index }: { service: Service; index: number }) {
  return (
    <article id={service.slug} className="group flex flex-col border-t border-line pt-6">
      <p className="font-mono text-xs text-muted">
        {String(index + 1).padStart(2, '0')}
      </p>
      <h3 className="mt-3 font-serif text-2xl leading-tight">{service.name}</h3>
      <p className="mt-3 text-sm leading-6 text-muted">{service.summary}</p>

      <ul className="mb-6 mt-5 space-y-2">
        {service.includes.map((item) => (
          <li key={item} className="flex gap-2.5 text-sm leading-6 text-ink">
            <span aria-hidden="true" className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
            {item}
          </li>
        ))}
      </ul>

      {/* Each term and its description share one wrapper. They used to be
          siblings - a `div` holding the `dt`, then a bare `dd` - which is
          invalid inside a `dl` and left screen readers with two labels and two
          orphaned values instead of two pairs. `mt-auto` keeps the two cards in
          a row aligned even when one has more bullet points than the other. */}
      <dl className="mt-auto space-y-4 border-t border-line-soft pt-4 text-xs">
        <div>
          <dt className="font-mono uppercase tracking-label text-muted">Good for</dt>
          <dd className="mt-1 text-muted">{service.bestFor}</dd>
        </div>
        <div>
          <dt className="font-mono uppercase tracking-label text-muted">Timeline</dt>
          <dd className="mt-1 text-muted">{service.timeline}</dd>
        </div>
      </dl>
    </article>
  );
}

/**
 * No stock photography: a wallpaper of the studio mark stands in for a project
 * image. Honest, consistent, and it cannot be mistaken for a real screenshot.
 */
function Plate({ label }: { label: string }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line bg-canvas">
      <div className="absolute inset-0 grid grid-cols-3 place-items-center gap-2 p-6 opacity-[0.14]">
        {Array.from({ length: 9 }).map((_, index) => (
          <KleeLabMark key={index} className="h-8 w-8 text-ink" />
        ))}
      </div>
      <span className="absolute bottom-3 left-3 font-mono text-xs text-muted">{label}</span>
    </div>
  );
}

export function WorkCard({ study }: { study: CaseStudy }) {
  return (
    <article className="group">
      <Link href={`/work/${study.slug}`} className="block no-underline">
        <Plate label={study.client} />
        <div className="mt-5 flex items-baseline justify-between gap-4">
          {/* `group-hover:text-accent` used to sit here, but `accent` and `ink`
              are the same hex - the whole card is a link and nothing said so.
              An underline is the one hover signal a monochrome palette has. */}
          <h3 className="font-serif text-2xl leading-tight text-ink underline-offset-4 group-hover:underline group-hover:decoration-1">
            {study.title}
          </h3>
          <span className="shrink-0 font-mono text-xs text-muted">{study.year}</span>
        </div>
        <p className="mt-3 max-w-measure text-sm leading-6 text-muted">{study.summary}</p>
        <p className="mt-4 font-mono text-xs uppercase tracking-label text-muted">
          {study.services.join(' · ')}
        </p>
      </Link>
    </article>
  );
}

export function PostCard({ post }: { post: Post }) {
  return (
    <article className="border-t border-line pt-6">
      <Link href={`/blog/${post.slug}`} className="group block no-underline">
        <div className="flex items-center gap-3 font-mono text-xs text-muted">
          <span className="uppercase tracking-label">{post.topic}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={post.date}>{formatDate(post.date)}</time>
        </div>
        <h3 className="mt-3 font-serif text-2xl leading-tight text-ink underline-offset-4 group-hover:underline group-hover:decoration-1">
          {post.title}
        </h3>
        <p className="mt-3 max-w-measure text-sm leading-6 text-muted">{post.summary}</p>
        <p className="mt-4 font-mono text-xs text-muted">{post.readingMinutes} min read</p>
      </Link>
    </article>
  );
}
