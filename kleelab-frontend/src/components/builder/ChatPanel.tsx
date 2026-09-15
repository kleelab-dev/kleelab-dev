'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpIcon, SparklesIcon } from '@heroicons/react/24/outline';

/** One turn in the conversation, as it is shown. */
export interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  /** What the person asked, or what the assistant replied. */
  text: string;
  /** What was actually changed, one line each. Only on assistant turns. */
  changed?: string[];
  /** What could not be done, and would otherwise look like it silently failed. */
  refused?: string[];
  /** A request that never reached the model, or came back unusable. */
  failed?: boolean;
}

const STARTERS = [
  'Make the heading bigger and centre it',
  'Write a better description for the opening section',
  'Add a section with customer reviews',
  'Make the site feel warmer and more inviting',
  'Add a page for our opening hours',
];

/**
 * The conversation.
 *
 * This replaces the old block palette and inspector, and the difference is the
 * point: the author says what they want in a sentence instead of performing it in
 * a series of gestures. What the assistant reports it did is listed under its
 * reply, and anything it could not do is listed too — a change that silently
 * failed is indistinguishable from a broken feature, so it is never hidden.
 */
export function ChatPanel({
  turns,
  busy,
  disabled,
  disabledReason,
  onSend,
}: {
  turns: ChatTurn[];
  busy: boolean;
  disabled: boolean;
  disabledReason: string | null;
  onSend: (instruction: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest turn in view as the conversation grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  const submit = () => {
    const text = draft.trim();
    if (!text || busy || disabled) return;
    setDraft('');
    onSend(text);
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-line bg-paper">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
        <SparklesIcon className="h-4 w-4 text-accent" />
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-muted">Assistant</span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {turns.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-muted">
              Ask for any change in your own words. The site updates as you talk — no dragging, no
              settings to hunt through.
            </p>
            <div className="space-y-1.5">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => setDraft(starter)}
                  className="block w-full rounded-lg border border-line bg-canvas px-3 py-2 text-left text-xs font-medium text-ink transition hover:border-accent hover:text-accent"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="space-y-4">
            {turns.map((turn) =>
              turn.role === 'user' ? (
                <li key={turn.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-3.5 py-2 text-sm leading-relaxed text-paper">
                    {turn.text}
                  </p>
                </li>
              ) : (
                <li key={turn.id} className="space-y-2">
                  <p
                    className={`text-sm leading-relaxed ${turn.failed ? 'text-accent' : 'text-ink'}`}
                  >
                    {turn.text}
                  </p>
                  {turn.changed && turn.changed.length > 0 && (
                    <ul className="space-y-1 border-l-2 border-mint pl-3">
                      {turn.changed.map((line, index) => (
                        <li key={index} className="text-xs text-muted">
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}
                  {turn.refused && turn.refused.length > 0 && (
                    <ul className="space-y-1 rounded-lg bg-canvas px-3 py-2">
                      {turn.refused.map((line, index) => (
                        <li key={index} className="text-xs text-muted">
                          Skipped {line}.
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ),
            )}
            {busy && <li className="text-sm text-muted">Thinking…</li>}
          </ol>
        )}
      </div>

      <div className="shrink-0 border-t border-line p-3">
        {disabled && disabledReason && (
          <p className="mb-2 rounded-lg bg-canvas px-3 py-2 text-xs leading-relaxed text-muted">
            {disabledReason}
          </p>
        )}
        <div className="rounded-xl border border-line-strong bg-white p-2 focus-within:border-accent">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={2}
            disabled={disabled}
            placeholder={disabled ? 'Changes need the assistant' : 'Ask for a change…'}
            className="w-full resize-none border-0 bg-transparent px-1.5 py-1 text-sm leading-relaxed text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed"
          />
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-[10px] text-muted">
              Enter to send · Shift+Enter for a new line
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={busy || disabled || !draft.trim()}
              aria-label="Send"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink text-paper transition hover:bg-accent disabled:opacity-30"
            >
              <ArrowUpIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
