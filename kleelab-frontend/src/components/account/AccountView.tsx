'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { useCurrentUser, useUpdateUser } from '@/components/app/AppShell';
import { errorText } from '@/components/project/format';
import { Panel } from '@/components/project/Pill';
import { apiService } from '@/services/api';

const MIN_PASSWORD = 8;
/** bcrypt reads only the first 72 bytes; the API refuses anything longer. */
const MAX_PASSWORD_BYTES = 72;

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; message: string } | { kind: 'error'; message: string };

function Feedback({ status }: { status: Status }) {
  if (status.kind === 'done') {
    return (
      <p role="status" className="rounded-lg bg-mint px-2.5 py-1 text-sm font-medium text-ink">
        {status.message}
      </p>
    );
  }
  if (status.kind === 'error') {
    return (
      <p role="alert" className="text-sm font-medium text-danger">
        {status.message}
      </p>
    );
  }
  return null;
}

function signedOutText(count: number): string {
  if (count === 0) return 'No other devices were signed in.';
  return `Signed out ${count} other ${count === 1 ? 'device' : 'devices'}.`;
}

export function AccountView() {
  return (
    <div>
      <p className="tag">your account</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tightest sm:text-5xl">Your account</h1>
      <p className="mt-3 max-w-measure text-muted">Your name, your password and the devices signed in to this account.</p>

      <div className="mt-8 grid max-w-2xl gap-6 sm:mt-10">
        <NamePanel />
        <PasswordPanel />
        <DevicesPanel />
      </div>
    </div>
  );
}

function NamePanel() {
  const user = useCurrentUser();
  const setUser = useUpdateUser();
  const [name, setName] = useState(user.full_name ?? '');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const nameId = useId();
  const emailId = useId();

  const trimmed = name.trim().replace(/\s+/g, ' ');
  const unchanged = trimmed === (user.full_name ?? '');

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed) {
      setStatus({ kind: 'error', message: 'Please enter your name.' });
      return;
    }
    setStatus({ kind: 'busy' });
    try {
      const updated = await apiService.updateProfile(trimmed);
      setUser(updated);
      setName(updated.full_name ?? '');
      setStatus({ kind: 'done', message: 'Saved. This is the name we use when we write to you.' });
    } catch (reason) {
      setStatus({ kind: 'error', message: errorText(reason, 'Your name was not saved. Please try again.') });
    }
  }

  return (
    <Panel tag="about you" title="Name and email">
      <form onSubmit={save} className="grid gap-4" noValidate>
        <div>
          <label htmlFor={nameId} className="label">
            Your name
          </label>
          <input
            id={nameId}
            className="field mt-1.5 w-full"
            value={name}
            maxLength={100}
            autoComplete="name"
            onChange={(event) => {
              setName(event.target.value);
              if (status.kind !== 'busy') setStatus({ kind: 'idle' });
            }}
          />
        </div>
        <div>
          <label htmlFor={emailId} className="label">
            Email
          </label>
          <input id={emailId} className="field mt-1.5 w-full bg-ink/5 text-muted" value={user.email} readOnly aria-describedby={`${emailId}-note`} />
          <p id={`${emailId}-note`} className="mt-1.5 text-xs text-muted">
            This is how you sign in. To change it, send us a message and we will move your projects across.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Button type="submit" className="min-h-11" disabled={status.kind === 'busy' || unchanged || !trimmed}>
            {status.kind === 'busy' ? 'Saving…' : 'Save name'}
          </Button>
          <Feedback status={status} />
        </div>
      </form>
    </Panel>
  );
}

function PasswordPanel() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const ids = { current: useId(), next: useId(), confirm: useId(), hint: useId() };

  function problem(): string | null {
    if (!current) return 'Please enter your current password.';
    if (next.length < MIN_PASSWORD) return `Your new password needs at least ${MIN_PASSWORD} characters.`;
    if (new TextEncoder().encode(next).length > MAX_PASSWORD_BYTES) return 'Your new password is too long. Please keep it under 72 characters.';
    if (next === current) return 'Your new password is the same as your current one.';
    if (next !== confirm) return 'The two new passwords do not match.';
    return null;
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const issue = problem();
    if (issue) {
      setStatus({ kind: 'error', message: issue });
      return;
    }
    setStatus({ kind: 'busy' });
    try {
      const result = await apiService.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setStatus({
        kind: 'done',
        message: `Password changed. ${result.signed_out > 0 ? `${signedOutText(result.signed_out)} ` : ''}This device stays signed in.`,
      });
    } catch (reason) {
      setStatus({ kind: 'error', message: errorText(reason, 'Your password was not changed. Please try again.') });
    }
  }

  const clear = () => {
    if (status.kind !== 'busy') setStatus({ kind: 'idle' });
  };

  return (
    <Panel tag="security" title="Change your password">
      <form onSubmit={save} className="grid gap-4" noValidate>
        <div>
          <label htmlFor={ids.current} className="label">
            Current password
          </label>
          <input
            id={ids.current}
            type="password"
            className="field mt-1.5 w-full"
            value={current}
            autoComplete="current-password"
            onChange={(event) => {
              setCurrent(event.target.value);
              clear();
            }}
          />
          <p className="mt-1.5 text-xs text-muted">
            Forgotten it?{' '}
            <Link href="/forgot-password" className="font-semibold text-cobalt">
              Reset it by email
            </Link>
            .
          </p>
        </div>
        <div>
          <label htmlFor={ids.next} className="label">
            New password
          </label>
          <input
            id={ids.next}
            type="password"
            className="field mt-1.5 w-full"
            value={next}
            autoComplete="new-password"
            aria-describedby={ids.hint}
            onChange={(event) => {
              setNext(event.target.value);
              clear();
            }}
          />
          <p id={ids.hint} className="mt-1.5 text-xs text-muted">
            At least {MIN_PASSWORD} characters. Changing it signs out every other device.
          </p>
        </div>
        <div>
          <label htmlFor={ids.confirm} className="label">
            New password again
          </label>
          <input
            id={ids.confirm}
            type="password"
            className="field mt-1.5 w-full"
            value={confirm}
            autoComplete="new-password"
            onChange={(event) => {
              setConfirm(event.target.value);
              clear();
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Button type="submit" className="min-h-11" disabled={status.kind === 'busy'}>
            {status.kind === 'busy' ? 'Changing…' : 'Change password'}
          </Button>
          <Feedback status={status} />
        </div>
      </form>
    </Panel>
  );
}

function DevicesPanel() {
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function signOutOthers() {
    setStatus({ kind: 'busy' });
    try {
      const result = await apiService.signOutOthers();
      setConfirming(false);
      setStatus({ kind: 'done', message: `${signedOutText(result.signed_out)} This device stays signed in.` });
    } catch (reason) {
      setStatus({ kind: 'error', message: errorText(reason, 'That did not work. Please try again.') });
    }
  }

  return (
    <Panel tag="devices" title="Signed in elsewhere?">
      <p className="text-sm leading-6 text-muted">
        Signed in on a shared or lost device? Sign out everywhere except here. Those devices will need your password to get back in.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        {confirming ? (
          <>
            <Button variant="danger" className="min-h-11" onClick={signOutOthers} disabled={status.kind === 'busy'}>
              {status.kind === 'busy' ? 'Signing out…' : 'Yes, sign them out'}
            </Button>
            <Button variant="ghost" className="min-h-11" onClick={() => setConfirming(false)} disabled={status.kind === 'busy'}>
              Cancel
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            className="min-h-11"
            onClick={() => {
              setConfirming(true);
              setStatus({ kind: 'idle' });
            }}
          >
            Sign out other devices
          </Button>
        )}
        <Feedback status={status} />
      </div>
    </Panel>
  );
}
