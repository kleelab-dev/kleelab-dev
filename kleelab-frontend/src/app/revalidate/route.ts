import { revalidateTag } from 'next/cache';
import { PORTFOLIO_TAG } from '@/lib/portfolio';

/** The API calls this when a portfolio item changes, so the site shows it straight away. */
export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Not allowed' }, { status: 401 });
  }
  // Drop the copy outright: an unpublished item must not linger while it refreshes.
  revalidateTag(PORTFOLIO_TAG, { expire: 0 });
  return Response.json({ revalidated: true });
}
