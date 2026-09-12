import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CallToAction } from '@/components/marketing/CallToAction';
import { Prose } from '@/components/marketing/Prose';
import { Eyebrow, Section } from '@/components/marketing/Section';
import { formatDate, getPost, posts } from '@/content/posts';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: 'Not found' };
  return {
    title: post.title,
    description: post.summary,
    openGraph: { type: 'article', title: post.title, description: post.summary },
  };
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const others = posts.filter((item) => item.slug !== post.slug).slice(0, 2);

  return (
    <>
      <div className="mx-auto max-w-content px-6 pt-14 sm:pt-20">
        <Link href="/blog" className="font-mono text-xs text-muted hover:text-ink">
          ← All notes
        </Link>

        <div className="mt-10 flex flex-wrap items-center gap-3 font-mono text-xs text-muted">
          <span className="uppercase tracking-label">{post.topic}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={post.date}>{formatDate(post.date)}</time>
          <span aria-hidden="true">·</span>
          <span>{post.readingMinutes} min read</span>
        </div>

        <h1 className="mt-5 max-w-3xl font-serif text-4xl leading-[1.08] tracking-tight sm:text-5xl">
          {post.title}
        </h1>

        <p className="mt-6 max-w-measure text-lg leading-8 text-muted">{post.summary}</p>
      </div>

      <Section>
        <Prose>
          {post.body.map((section, index) => (
            <section key={section.heading ?? index}>
              {section.heading && <h2>{section.heading}</h2>}
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </Prose>
      </Section>

      <Section tone="canvas">
        <Eyebrow>Keep reading</Eyebrow>
        <div className="mt-6 grid gap-8 md:grid-cols-2">
          {others.map((other) => (
            <Link key={other.slug} href={`/blog/${other.slug}`} className="group border-t border-line pt-5">
              <span className="font-mono text-xs text-muted">{other.topic}</span>
              <span className="mt-3 block font-serif text-xl leading-snug group-hover:text-accent">
                {other.title}
              </span>
            </Link>
          ))}
        </div>
      </Section>

      <Section>
        <CallToAction
          title="Working on something?"
          body="We are happy to say whether we can help before you commit to anything."
          primary={{ href: '/contact', label: 'Talk to the studio' }}
          secondary={{ href: '/services', label: 'What we do' }}
        />
      </Section>
    </>
  );
}
