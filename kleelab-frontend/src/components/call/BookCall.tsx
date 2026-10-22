'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDaysIcon, CheckIcon } from '@heroicons/react/24/outline';
import { ApiError, apiService } from '@/services/api';
import { Button, buttonClass } from '@/components/ui/Button';
import { Bone, Loading } from '@/components/ui/States';
import { PhoneField, fullPhone, phoneLooksRight, type Phone } from '@/components/ui/PhoneField';
import { errorText } from '@/components/project/format';
import { SlotPicker, callWhen, sameClockAsTeam, teamTime } from '@/components/call/SlotPicker';
import type { CallBooked, CallSlots } from '@/types/api';

/** Book a free first call: pick a time, say who you are, done. */
export function BookCall() {
  const [slots, setSlots] = useState<CallSlots | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState<Phone>({ iso: 'NG', number: '' });
  const [notes, setNotes] = useState('');
  // Honeypot, as on the contact form.
  const [website, setWebsite] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<CallBooked | null>(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiService
      .getCallSlots()
      .then((value) => active && setSlots(value))
      .catch((reason) => active && setLoadError(errorText(reason, 'The open times did not load.')));
    return () => {
      active = false;
    };
  }, [attempt]);

  const load = () => {
    setLoadError(null);
    setAttempt((n) => n + 1);
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slot) return setError('Pick a time first.');
    if (!name.trim()) return setError('Add your name so we know who we are talking to.');
    if (!email.trim()) return setError('Add an email address for the confirmation.');
    if (!phoneLooksRight(phone)) return setError('That phone number looks too short or too long. Check it, or leave it empty.');
    setSending(true);
    setError(null);
    try {
      setBooked(
        await apiService.bookCall({
          name: name.trim(),
          email: email.trim(),
          company: company.trim() || null,
          phone: fullPhone(phone),
          notes: notes.trim() || null,
          starts_at: slot,
          website,
        }),
      );
    } catch (reason) {
      setError(errorText(reason, 'That did not book. Please try again.'));
      // Someone took the time first: show what is still free.
      if (reason instanceof ApiError && reason.status === 409 && /taken|booked that time/i.test(reason.message)) {
        setSlot(null);
        load();
      }
    } finally {
      setSending(false);
    }
  }

  if (booked) return <Booked call={booked} />;

  return (
    <form onSubmit={submit} className="card relative grid gap-7 p-6 shadow-block sm:p-8" noValidate>
      <div className="dim">call booking</div>
      <section>
        <p className="label">1. Pick a time</p>
        {slots ? (
          <SlotPicker
            slots={slots.slots}
            value={slot}
            onChange={setSlot}
            timezoneLabel={slots.timezone_label}
            offsetMinutes={slots.utc_offset_minutes}
          />
        ) : loadError ? (
          <div role="alert" className="flex flex-wrap items-center gap-4 rounded-xl bg-danger-soft p-4 text-sm text-danger">
            <span className="flex-1">{loadError}</span>
            <button type="button" onClick={load} className="font-semibold underline underline-offset-2">
              Try again
            </button>
          </div>
        ) : (
          <Loading label="Loading open times…" className="grid gap-3">
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((n) => (
                <Bone key={n} className="h-12 w-24 rounded-xl" />
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
                <Bone key={n} className="h-10 rounded-xl" />
              ))}
            </div>
          </Loading>
        )}
      </section>

      <section className="grid gap-5">
        <p className="label -mb-2">2. About you</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="b-name" className="label">Your name *</label>
            <input id="b-name" className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} />
          </div>
          <div>
            <label htmlFor="b-email" className="label">Email *</label>
            <input id="b-email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
        </div>
        <div>
          <label htmlFor="b-company" className="label">Organisation</label>
          <input id="b-company" className="field" value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" maxLength={150} />
        </div>
        <PhoneField id="b-phone" label="Phone (optional)" value={phone} onChange={setPhone} />
        <div>
          <label htmlFor="b-notes" className="label">What would you like to talk about?</label>
          <textarea
            id="b-notes"
            rows={4}
            maxLength={2000}
            className="field resize-y"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="A line or two is plenty: what you want to build, and anything we should look at before the call."
          />
        </div>
      </section>
      <div className="hidden" aria-hidden>
        <label htmlFor="b-website">Website</label>
        <input id="b-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      {error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" disabled={sending || !slots}>
          {sending ? 'Booking…' : slot ? `Book ${callWhen(slot).replace(' at ', ', ')}` : 'Book the call'}
        </Button>
        <p className="font-mono text-[11px] uppercase tracking-label text-muted">
          {slots ? `${slots.duration_minutes} minutes · free · no obligation` : 'Free · no obligation'}
        </p>
      </div>
    </form>
  );
}

function Booked({ call }: { call: CallBooked }) {
  return (
    <div ref={(node) => node?.scrollIntoView({ block: 'center', behavior: 'smooth' })} className="card relative self-start p-8 shadow-block">
      <span className="stamp absolute right-5 top-5">Booked</span>
      <span className="grid h-12 w-12 place-items-center rounded-full bg-sun">
        <CheckIcon className="h-6 w-6" />
      </span>
      <h2 className="mt-5 font-display text-3xl font-extrabold tracking-tight">See you then, {call.name.split(' ')[0]}.</h2>
      <p className="mt-3 text-lg font-semibold">{callWhen(call.starts_at)}</p>
      {!sameClockAsTeam(call.utc_offset_minutes) && (
        <p className="text-sm text-muted">
          That is {teamTime(call.starts_at, call.utc_offset_minutes)} {call.timezone_label}.
        </p>
      )}
      <p className="mt-4 max-w-md leading-relaxed text-muted">
        We have emailed you the details{call.meeting_url ? ' and the link to join' : ''}, with a link to move or cancel the
        call if your plans change.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a href={call.calendar_url} target="_blank" rel="noreferrer" className={buttonClass('sun')}>
          <CalendarDaysIcon className="h-4 w-4" /> Add to Google Calendar
        </a>
        <Link href={`/call/${encodeURIComponent(call.token)}`} className={buttonClass('secondary')}>
          Manage the call
        </Link>
      </div>
    </div>
  );
}
