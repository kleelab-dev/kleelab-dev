'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import type { ProjectUpdate, Stage } from '@/types/api';
import { APPROVAL_STATUS, formatDateTime } from './format';

const KIND_LABEL = { progress: 'Progress', message: 'Message', approval: 'Approval', note: 'Team note' } as const;

/** Updates and messages, newest first. */
export function UpdateFeed({ updates, stages, empty, team = false }: { updates: ProjectUpdate[]; stages: Stage[]; empty?: string; team?: boolean }) {
  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const ordered = [...updates].sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (!ordered.length) {
    return <p className="rounded-xl border-[1.5px] border-dashed border-line p-5 text-sm text-muted">{empty ?? 'Nothing here yet.'}</p>;
  }
  return (
    <ol className="grid gap-3">
      {ordered.map((update) => (
        <li
          key={update.id}
          className={clsx(
            'rounded-xl border-[1.5px] p-4',
            update.kind === 'note' ? 'border-dashed border-ink/40 bg-sun-soft' : update.from_team ? 'border-line bg-white' : 'border-cobalt/40 bg-cobalt-soft/50',
          )}
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-label text-muted">
            <span className={clsx('font-semibold', update.from_team ? 'text-cobalt' : 'text-ink')}>
              {update.from_team ? `KleeLab${update.author_name ? ` · ${update.author_name}` : ''}` : update.author_name || (team ? 'The client' : 'You')}
            </span>
            <span>·</span>
            <span>{update.kind === 'note' ? 'Team note · the client cannot see this' : KIND_LABEL[update.kind]}</span>
            {update.stage_id && stageName.get(update.stage_id) && (
              <>
                <span>·</span>
                <span>{stageName.get(update.stage_id)}</span>
              </>
            )}
            <span className="ml-auto normal-case tracking-normal">{formatDateTime(update.created_at)}</span>
          </div>
          {update.title && <h3 className="mt-2 font-semibold">{update.title}</h3>}
          <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-ink-soft">{update.body}</p>
          {update.link_url && <UpdateLink update={update} />}
          {update.kind === 'approval' && update.approval_status && (
            <p className="mt-3 text-sm">
              <span className={clsx('stamp', update.approval_status === 'approved' && 'border-ink text-ink', update.approval_status === 'changes_requested' && 'border-danger text-danger')}>
                {APPROVAL_STATUS[update.approval_status]}
              </span>
              {update.approval_note && <span className="ml-3 text-muted">“{update.approval_note}”</span>}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

export function UpdateLink({ update }: { update: Pick<ProjectUpdate, 'link_url' | 'link_label'> }) {
  if (!update.link_url) return null;
  return (
    <a href={update.link_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-cobalt">
      {update.link_label || 'Open link'} <ArrowTopRightOnSquareIcon className="h-4 w-4" />
    </a>
  );
}

/** One thing waiting for the client to approve, with both answers. */
export function ApprovalCard({
  update,
  stageName,
  onDecide,
}: {
  update: ProjectUpdate;
  stageName?: string;
  onDecide: (decision: 'approved' | 'changes_requested', note: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<'idle' | 'changes'>('idle');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'approved' | 'changes_requested') {
    if (decision === 'changes_requested' && !note.trim()) {
      setError('Tell us what you would like changed.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onDecide(decision, note.trim());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That did not save. Please try again.');
      setBusy(false);
    }
  }

  return (
    <article className="rounded-xl border-[1.5px] border-ink bg-white p-5 shadow-block-sm">
      <p className="font-mono text-[10px] uppercase tracking-label text-cobalt">
        Please approve{stageName ? ` · ${stageName}` : ''}
      </p>
      <h3 className="mt-1.5 font-display text-lg font-extrabold">{update.title || 'Ready for you to look at'}</h3>
      <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-ink-soft">{update.body}</p>
      <UpdateLink update={update} />
      {mode === 'changes' && (
        <div className="mt-4">
          <label htmlFor={`note-${update.id}`} className="label">What should change?</label>
          <textarea id={`note-${update.id}`} rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="field" />
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {mode === 'idle' ? (
          <>
            <Button onClick={() => decide('approved')} disabled={busy}>
              {busy ? 'Saving…' : 'Approve'}
            </Button>
            <Button variant="secondary" onClick={() => setMode('changes')} disabled={busy}>
              Ask for changes
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => decide('changes_requested')} disabled={busy}>
              {busy ? 'Sending…' : 'Send my changes'}
            </Button>
            <Button variant="ghost" onClick={() => setMode('idle')} disabled={busy}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </article>
  );
}
