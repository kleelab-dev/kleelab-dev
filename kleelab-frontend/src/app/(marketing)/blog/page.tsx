import type { Metadata } from 'next';
import { PostCard } from '@/components/marketing/Cards';
import { CallToAction } from '@/components/marketing/CallToAction';
import { PageHeader, Section } from '@/components/marketing/Section';
import { posts } from '@/content/posts';

export const metadata: Metadata = {
  title: 'Notes',
  description:
    'Writing from KleeLab about building sites carefully, security that comes from deleting things, and running a small studio.',
};

export default function BlogPage() {
  return (
    <>
      <PageHeader
        eyebrow="Notes"
        title="Things we have learned, written down."
        lead="Mostly about the parts of a project that never make it into a case study."
      />

      <Section>
        <div className="grid gap-x-10 gap-y-12 md:grid-cols-2">
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      </Section>

      <Section tone="canvas">
        <CallToAction
          eyebrow="Next"
          title="Want this applied to your project?"
          body="Reading about it is not the same as having it done. Tell us what you are working on."
          primary={{ href: '/contact', label: 'Talk to the studio' }}
          secondary={{ href: '/work', label: 'See our work' }}
        />
      </Section>
    </>
  );
}
