'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { ArrowUpIcon, ChatBubbleLeftRightIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { apiService } from '@/services/api';
import type { ChatTurn } from '@/types/api';

const OPEN_EVENT = 'kleelab:open-chat';

/** Open the chat from anywhere on the page, optionally with a first question. */
export function openChat(question?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: question }));
}

const GREETING: ChatTurn = {
  role: 'assistant',
  content: "Hi, I'm the KleeLab assistant. Ask me anything about how we work, or tell me what you'd like to build.",
};

const STARTERS = ['What can you build?', 'How does the dashboard work?', 'Can you host it for us?'];

type LeadState = 'hidden' | 'open' | 'sending' | 'sent';

/**
 * The visitor chat on every public page.
 *
 * Stateless on the server: the transcript lives here and is sent whole with each
 * message. When the assistant thinks a person should take over, it offers a
 * short form that drops the conversation into the team's enquiries inbox.
 */
export function EnquiryChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([GREETING]);
  const [suggestions, setSuggestions] = useState<string[]>(STARTERS);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lead, setLead] = useState<LeadState>('hidden');
  const [leadName, setLeadName] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadError, setLeadError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next: ChatTurn[] = [...turns, { role: 'visitor', content }];
    setTurns(next);
    setDraft('');
    setSuggestions([]);
    setError(null);
    setBusy(true);
    try {
      // The greeting is ours, not the model's, so it is not sent.
      const reply = await apiService.chat(next.slice(1).slice(-16), pathname);
      setTurns((current) => [...current, { role: 'assistant', content: reply.reply }]);
      setSuggestions(reply.suggestions);
      if (reply.offer_contact) setLead((state) => (state === 'hidden' ? 'open' : state));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The assistant is unavailable right now.');
    } finally {
      setBusy(false);
    }
  }

  // The open-chat listener is registered once; it reads the latest send from here.
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  useEffect(() => {
    function onOpen(event: Event) {
      setOpen(true);
      const question = (event as CustomEvent<string | undefined>).detail;
      if (question) void sendRef.current(question);
    }
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy, lead]);

  async function submitLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!leadEmail.trim()) {
      setLeadError('We need an email address to reply to.');
      return;
    }
    const transcript = turns
      .slice(1)
      .map((turn) => `${turn.role === 'visitor' ? 'Visitor' : 'Assistant'}: ${turn.content}`)
      .join('\n\n');
    setLead('sending');
    setLeadError(null);
    try {
      await apiService.submitLead({
        email: leadEmail.trim(),
        name: leadName.trim() || null,
        message: `Enquiry from the site chat (${pathname}).\n\n${transcript}`.slice(0, 4000),
        source: 'chat',
      });
      setLead('sent');
    } catch (reason) {
      setLead('open');
      setLeadError(reason instanceof Error ? reason.message : 'That did not send. Please try again.');
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full border-[1.5px] border-ink bg-sun px-5 py-3 font-semibold text-ink shadow-block-sm transition-transform hover:-translate-y-0.5 hover:shadow-block"
        >
          <ChatBubbleLeftRightIcon className="h-5 w-5" aria-hidden />
          Ask us anything
        </button>
      )}

      {open && (
        <section
          aria-label="Chat with KleeLab"
          className="kl-rise fixed inset-x-3 bottom-3 z-50 flex max-h-[min(640px,calc(100dvh-1.5rem))] flex-col overflow-hidden rounded-2xl border-[1.5px] border-ink bg-paper shadow-block sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[400px]"
        >
          <header className="flex items-center justify-between border-b-[1.5px] border-ink bg-white px-4 py-3">
            <div>
              <p className="font-display text-lg font-extrabold leading-none">KleeLab assistant</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-label text-muted">Answers now · a human replies by email</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-9 w-9 place-items-center rounded-full hover:bg-ink/5"
              aria-label="Close chat"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </header>

          <div ref={scroller} className="bg-graph flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {turns.map((turn, index) => (
              <div key={index} className={clsx('flex', turn.role === 'visitor' ? 'justify-end' : 'justify-start')}>
                <p
                  className={clsx(
                    'max-w-[85%] whitespace-pre-line px-3.5 py-2.5 text-sm leading-relaxed',
                    turn.role === 'visitor'
                      ? 'rounded-2xl rounded-br-md bg-cobalt text-white'
                      : 'rounded-2xl rounded-bl-md border-[1.5px] border-ink bg-white',
                  )}
                >
                  {turn.content}
                </p>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start" aria-label="The assistant is typing">
                <span className="flex gap-1 rounded-2xl rounded-bl-md border-[1.5px] border-ink bg-white px-4 py-3">
                  {[0, 1, 2].map((dot) => (
                    <span key={dot} className="kl-dot h-1.5 w-1.5 rounded-full bg-ink" style={{ animationDelay: `${dot * 0.15}s` }} />
                  ))}
                </span>
              </div>
            )}
            {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

            {lead === 'open' || lead === 'sending' ? (
              <form onSubmit={submitLead} className="rounded-2xl border-[1.5px] border-ink bg-white p-4" noValidate>
                <p className="font-display text-base font-bold">Talk to a person</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Someone at KleeLab will read this conversation and reply by email, usually within a working day.
                </p>
                <div className="mt-3 grid gap-2">
                  <input className="field py-2" placeholder="Your name" value={leadName} onChange={(e) => setLeadName(e.target.value)} autoComplete="name" aria-label="Your name" />
                  <input className="field py-2" type="email" placeholder="Email address" value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} autoComplete="email" aria-label="Email address" required />
                </div>
                {leadError && <p className="mt-2 text-xs text-danger" role="alert">{leadError}</p>}
                <div className="mt-3 flex items-center gap-2">
                  <button type="submit" disabled={lead === 'sending'} className="rounded-full bg-cobalt px-4 py-2 text-sm font-semibold text-white hover:bg-cobalt-dark disabled:opacity-50">
                    {lead === 'sending' ? 'Sending…' : 'Send to KleeLab'}
                  </button>
                  <button type="button" onClick={() => setLead('hidden')} className="rounded-full px-3 py-2 text-sm text-muted hover:text-ink">
                    Not now
                  </button>
                </div>
              </form>
            ) : null}
            {lead === 'sent' && (
              <p className="rounded-2xl border-[1.5px] border-ink bg-mint px-4 py-3 text-sm">
                <span className="stamp mr-2">Sent</span>
                Thanks. The team has your conversation and will email you soon.
              </p>
            )}
          </div>

          {suggestions.length > 0 && !busy && (
            <div className="flex flex-wrap gap-2 border-t border-line bg-paper px-4 pt-3">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  className="rounded-full border-[1.5px] border-ink bg-white px-3 py-1 text-xs font-medium hover:bg-sun"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <form
            className="flex items-end gap-2 bg-paper p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <textarea
              ref={input}
              rows={1}
              value={draft}
              maxLength={2000}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send(draft);
                }
              }}
              placeholder="Type your question…"
              aria-label="Your message"
              className="field max-h-32 resize-none py-2.5"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-cobalt text-white hover:bg-cobalt-dark disabled:opacity-40"
              aria-label="Send"
            >
              <ArrowUpIcon className="h-5 w-5" />
            </button>
          </form>
          {lead === 'hidden' && turns.length > 2 && (
            <button type="button" onClick={() => setLead('open')} className="border-t border-line bg-white py-2 font-mono text-[10px] uppercase tracking-label text-cobalt hover:bg-cobalt-soft">
              Prefer a human? Send this to the team →
            </button>
          )}
        </section>
      )}
    </>
  );
}
