'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { CalendarDaysIcon, VideoCameraIcon } from '@heroicons/react/24/outline';
import { Logo } from '@/components/ui/Logo';
import { Button, buttonClass } from '@/components/ui/Button';
import { errorText } from '@/components/project/format';
import { SlotPicker, callWhen, sameClockAsTeam, teamTime } from '@/components/call/SlotPicker';
import { ApiError, apiService } from '@/services/api';
import type { CallSlots, PublicCall } from '@/types/api';

type Mode = 'view' | 'move' | 'cancel';

/** A booked call from its email link: see it, move it or cancel it. */
export function CallView({ token }: { token: string }) {
  const [call, setCall] = useState<PublicCall | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<Mode>('view');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiService
      .getCall(token)
      .then((value) => active && setCall(value))
      .catch((reason) => {
        if (!active) return;
        if (reason instanceof ApiError && reason.status === 404) setMissing(true);
        else setLoadError(errorText(reason));
      });
    return () => {
      active = false;
    };
  }, [token, attempt]);

  if (missing) {
    return (
      <Shell>
        <section className="card p-7 shadow-block sm:p-8">
          <div className="dim">link problem</div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">We cannot find this call</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Open the link from your confirmation email exactly as it was sent. You can also{' '}
            <Link href="/book" className="font-semibold text-cobalt">book a new time</Link>.
          </p>
        </section>
      </Shell>
    );
  }

  if (!call) {
    return (
      <Shell>
        {loadError ? (
          <div role="alert" className="flex flex-wrap items-center gap-4 rounded-xl bg-danger-soft p-4 text-sm text-danger">
            <span className="flex-1">{loadError}</span>
            <button type="button" onClick={() => { setLoadError(null); setAttempt((n) => n + 1); }} className="font-semibold underline underline-offset-2">
              Try again
            </button>
          </div>
        ) : (
          <div className="card animate-pulse p-8" role="status">
            <span className="sr-only">Loading your call…</span>
            <div className="h-4 w-1/4 rounded-full bg-line" />
            <div className="mt-4 h-8 w-3/4 rounded-full bg-line" />
            <div className="mt-6 h-3 w-2/3 rounded-full bg-line/70" />
          </div>
        )}
      </Shell>
    );
  }

  const cancelled = call.status === 'cancelled';
  const live = !cancelled && !call.past;
  const done = (next: PublicCall, message: string) => {
    setCall(next);
    setMode('view');
    setNotice(message);
  };

  return (
    <Shell>
      <section className="card relative p-7 shadow-block sm:p-8">
        <span className={clsx('stamp absolute right-5 top-5', cancelled && 'text-danger')}>
          {cancelled ? 'Cancelled' : call.past ? 'Done' : 'Booked'}
        </span>
        <div className="dim">free first call</div>
        <p className="font-mono text-[11px] uppercase tracking-label text-cobalt">Your call with KleeLab</p>
        <h1 className={clsx('mt-2 font-display text-3xl font-extrabold tracking-tight', cancelled && 'text-muted line-through')}>
          {callWhen(call.starts_at)}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {call.duration_minutes} minutes
          {!sameClockAsTeam(call.utc_offset_minutes) &&
            ` · ${teamTime(call.starts_at, call.utc_offset_minutes)} ${call.timezone_label}`}
        </p>

        {notice && <p role="status" className="mt-5 rounded-xl bg-mint px-4 py-3 text-sm">{notice}</p>}

        {cancelled && (
          <div className="mt-5 rounded-xl bg-paper p-4 text-sm leading-6">
            {call.cancelled_by === 'team' ? (
              <>
                <p>We had to cancel this call, sorry.</p>
                {call.cancel_reason && <p className="mt-1 text-muted">{call.cancel_reason}</p>}
              </>
            ) : (
              <p>You cancelled this call.</p>
            )}
            <Link href="/book" className={buttonClass('primary', 'sm', 'mt-4')}>
              Pick another time
            </Link>
          </div>
        )}

        {call.past && !cancelled && (
          <p className="mt-5 text-sm leading-6 text-muted">
            This call has happened. Thanks for your time; if anything is still open, just reply to any of our emails.
          </p>
        )}

        {live && mode === 'view' && (
          <>
            {call.notes && (
              <div className="mt-5 rounded-xl bg-paper p-4 text-sm leading-6">
                <p className="font-mono text-[11px] uppercase tracking-label text-muted">You want to talk about</p>
                <p className="mt-1 whitespace-pre-line">{call.notes}</p>
              </div>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              {call.meeting_url && (
                <a href={call.meeting_url} target="_blank" rel="noreferrer" className={buttonClass('primary')}>
                  <VideoCameraIcon className="h-4 w-4" /> Join the call
                </a>
              )}
              <a href={call.calendar_url} target="_blank" rel="noreferrer" className={buttonClass('sun')}>
                <CalendarDaysIcon className="h-4 w-4" /> Add to Google Calendar
              </a>
            </div>
            {!call.meeting_url && (
              <p className="mt-4 text-sm leading-6 text-muted">We will email you the link to join before the call.</p>
            )}
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-sm">
              <button type="button" onClick={() => { setNotice(null); setMode('move'); }} className="font-semibold text-cobalt underline-offset-4 hover:underline">
                Move to another time
              </button>
              <button type="button" onClick={() => { setNotice(null); setMode('cancel'); }} className="font-semibold text-danger underline-offset-4 hover:underline">
                Cancel the call
              </button>
            </div>
          </>
        )}

        {live && mode === 'move' && (
          <MoveCall token={token} call={call} onDone={(next) => done(next, 'Moved. We have emailed you the new time.')} onBack={() => setMode('view')} />
        )}
        {live && mode === 'cancel' && (
          <CancelCall token={token} onDone={(next) => done(next, 'Cancelled. Thanks for letting us know.')} onBack={() => setMode('view')} />
        )}
      </section>
    </Shell>
  );
}

function MoveCall({ token, call, onDone, onBack }: { token: string; call: PublicCall; onDone: (call: PublicCall) => void; onBack: () => void }) {
  const [slots, setSlots] = useState<CallSlots | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiService
      .getCallSlots()
      .then((value) => active && setSlots(value))
      .catch((reason) => active && setError(errorText(reason, 'The open times did not load.')));
    return () => {
      active = false;
    };
  }, [attempt]);

  async function save() {
    if (!slot) return setError('Pick a new time first.');
    setSaving(true);
    setError(null);
    try {
      onDone(await apiService.rescheduleCall(token, slot));
    } catch (reason) {
      setError(errorText(reason, 'That did not move. Please try again.'));
      if (reason instanceof ApiError && reason.status === 409) {
        setSlot(null);
        setAttempt((n) => n + 1);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 grid gap-5 border-t border-line pt-5">
      <p className="font-semibold">Pick a new time</p>
      {slots ? (
        <SlotPicker
          slots={slots.slots}
          value={slot}
          onChange={setSlot}
          timezoneLabel={slots.timezone_label}
          offsetMinutes={slots.utc_offset_minutes}
        />
      ) : (
        !error && <p role="status" className="text-sm text-muted">Loading open times…</p>
      )}
      {error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={saving || !slot || slot === call.starts_at}>
          {saving ? 'Moving…' : 'Move the call'}
        </Button>
        <Button variant="ghost" onClick={onBack} disabled={saving}>
          Keep the current time
        </Button>
      </div>
    </div>
  );
}

function CancelCall({ token, onDone, onBack }: { token: string; onDone: (call: PublicCall) => void; onBack: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function cancel() {
    setSaving(true);
    setError(null);
    try {
      onDone(await apiService.cancelCall(token, reason.trim()));
    } catch (failure) {
      setError(errorText(failure, 'That did not cancel. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 grid gap-4 border-t border-line pt-5">
      <div>
        <label htmlFor="cancel-reason" className="label">Anything we should know? (optional)</label>
        <textarea
          id="cancel-reason"
          rows={3}
          maxLength={1000}
          className="field resize-y"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. we have decided to wait until next quarter"
        />
      </div>
      {error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="danger" onClick={cancel} disabled={saving}>
          {saving ? 'Cancelling…' : 'Cancel the call'}
        </Button>
        <Button variant="ghost" onClick={onBack} disabled={saving}>
          Keep it
        </Button>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-graph min-h-screen px-4 py-10 text-ink sm:px-5 sm:py-12">
      <div className="mx-auto grid w-full max-w-xl gap-6">
        <Link href="/" className="inline-block w-fit no-underline" aria-label="KleeLab home">
          <Logo className="text-2xl" />
        </Link>
        {children}
      </div>
    </main>
  );
}
