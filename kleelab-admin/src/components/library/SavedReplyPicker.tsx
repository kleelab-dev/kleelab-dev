'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiService } from '@/services/api';
import type { SavedReply } from '@/types/api';

export interface ReplyWords {
  firstName?: string | null;
  project?: string | null;
  myName?: string | null;
}

/** Fill {first_name}, {project} and {my_name}, with plain words when one is not known. */
export function fillReply(body: string, words: ReplyWords): string {
  return body
    .replaceAll('{first_name}', words.firstName || 'there')
    .replaceAll('{project}', words.project || 'your project')
    .replaceAll('{my_name}', words.myName || 'The KleeLab team');
}

/**
 * A menu of the team's saved replies. Picking one hands its words, filled in,
 * to `onPick`; the menu goes back to its prompt so the same one can be picked again.
 */
export function SavedReplyPicker({ id, words, onPick }: { id: string; words: ReplyWords; onPick: (text: string) => void }) {
  const [replies, setReplies] = useState<SavedReply[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    apiService
      .adminSavedReplies()
      .then((list) => active && setReplies(list))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  if (failed) return null;
  if (replies && replies.length === 0) {
    return (
      <p className="text-xs text-muted">
        No saved replies yet.{' '}
        <Link href="/library#replies" className="font-semibold text-cobalt">Add one</Link> for words you send often.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="shrink-0 font-mono text-[10px] uppercase tracking-label text-muted">Saved reply</label>
      <select
        id={id}
        value=""
        disabled={!replies}
        onChange={(e) => {
          const reply = replies?.find((r) => r.id === e.target.value);
          if (reply) onPick(fillReply(reply.body, words));
        }}
        className="field w-auto max-w-full py-1.5 text-xs"
      >
        <option value="">{replies ? 'Insert one…' : 'Loading…'}</option>
        {replies?.map((r) => (
          <option key={r.id} value={r.id}>{r.title}</option>
        ))}
      </select>
    </div>
  );
}
