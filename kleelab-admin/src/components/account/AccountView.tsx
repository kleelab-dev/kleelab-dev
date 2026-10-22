'use client';

import { useEffect, useState } from 'react';
import { CheckCircleIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { useCurrentUser, useUpdateUser } from '@/components/app/AppShell';
import { Panel, Pill } from '@/components/project/Pill';
import { errorText, formatDate } from '@/components/project/format';
import { apiService } from '@/services/api';
import { EmailChoices } from './EmailChoices';
import type { TwoStepSetup, TwoStepStatus } from '@/types/api';

type Step =
  | { kind: 'idle' }
  | { kind: 'password' }
  | { kind: 'scan'; setup: TwoStepSetup }
  | { kind: 'codes'; codes: string[]; fresh: boolean }
  | { kind: 'renew' }
  | { kind: 'disable' };

export function AccountView() {
  const user = useCurrentUser();
  const updateUser = useUpdateUser();
  const [status, setStatus] = useState<TwoStepStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [notice, setNotice] = useState<string | null>(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiService
      .twoStepStatus()
      .then((value) => active && setStatus(value))
      .catch((reason) => active && setLoadError(errorText(reason)));
    return () => {
      active = false;
    };
  }, [attempt]);

  function load() {
    setLoadError(null);
    setAttempt((n) => n + 1);
  }

  return (
    <div>
      <p className="tag">you</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tightest sm:text-5xl">Your account</h1>
      <p className="mt-3 text-muted">How you sign in to the team dashboard, and which emails you get.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Panel tag="details" title={user.full_name || 'No name yet'} className="self-start">
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-label text-muted">Email</dt>
              <dd className="mt-0.5 break-all">{user.email}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase tracking-label text-muted">On the team since</dt>
              <dd className="mt-0.5">{formatDate(user.created_at)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted">To change your password, sign out and use “Forgot it?” on the sign-in page.</p>
        </Panel>

        <Panel tag="emails" title="Emails you get" className="self-start lg:order-last lg:col-span-2">
          <EmailChoices />
        </Panel>

        <Panel
          tag="security"
          title="Two-step sign-in"
          action={status && <Pill tone={status.enabled ? 'bg-mint text-ink' : 'bg-sun text-ink'}>{status.enabled ? 'On' : 'Off'}</Pill>}
        >
          {notice && (
            <p role="status" className="mb-4 flex items-center gap-2 rounded-xl bg-mint p-3 text-sm">
              <CheckCircleIcon className="h-5 w-5 shrink-0" aria-hidden />
              {notice}
            </p>
          )}
          {loadError && <ErrorState message={loadError} onRetry={load} />}
          {!loadError && !status && <Skeleton rows={1} card={false} />}
          {status && step.kind === 'codes' && (
            <RecoveryCodes
              codes={step.codes}
              fresh={step.fresh}
              onDone={() => {
                setStep({ kind: 'idle' });
                load();
              }}
            />
          )}
          {status && step.kind !== 'codes' && !status.enabled && (
            <SetUp
              step={step}
              setStep={setStep}
              onEnabled={(codes) => {
                setNotice('Two-step sign-in is on. You will be asked for a code each time you sign in.');
                setStep({ kind: 'codes', codes, fresh: true });
                setStatus({ enabled: true, enabled_at: new Date().toISOString(), recovery_codes_left: codes.length });
                updateUser({ ...user, two_step_enabled: true });
              }}
            />
          )}
          {status && step.kind !== 'codes' && status.enabled && (
            <Enabled
              status={status}
              step={step}
              setStep={setStep}
              onRenewed={(codes) => {
                setNotice('New recovery codes made. The old ones no longer work.');
                setStep({ kind: 'codes', codes, fresh: false });
              }}
              onDisabled={(next) => {
                setStatus(next);
                setStep({ kind: 'idle' });
                setNotice('Two-step sign-in is off. Your password alone now signs you in.');
                updateUser({ ...user, two_step_enabled: false });
              }}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}

function SetUp({ step, setStep, onEnabled }: { step: Step; setStep: (s: Step) => void; onEnabled: (codes: string[]) => void }) {
  if (step.kind === 'password') return <PasswordForm onCancel={() => setStep({ kind: 'idle' })} onSetup={(setup) => setStep({ kind: 'scan', setup })} />;
  if (step.kind === 'scan') return <ScanForm setup={step.setup} onCancel={() => setStep({ kind: 'idle' })} onEnabled={onEnabled} />;
  return (
    <div>
      <div className="flex gap-3 rounded-xl bg-sun-soft p-4 text-sm">
        <ShieldCheckIcon className="h-6 w-6 shrink-0" aria-hidden />
        <p>
          Two-step sign-in asks for a code from an app on your phone as well as your password, so a leaked password alone cannot get anyone into
          client projects. You need it on to add teammates or switch them off.
        </p>
      </div>
      <p className="mt-4 text-sm text-muted">
        Any authenticator app works: Google Authenticator, Microsoft Authenticator, 1Password, Authy and others.
      </p>
      <Button className="mt-5" onClick={() => setStep({ kind: 'password' })}>
        Set it up
      </Button>
    </div>
  );
}

function PasswordForm({ onCancel, onSetup }: { onCancel: () => void; onSetup: (setup: TwoStepSetup) => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) return setError('Type your password.');
    setBusy(true);
    setError(null);
    try {
      onSetup(await apiService.twoStepSetup(password));
    } catch (reason) {
      setError(errorText(reason));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid max-w-sm gap-3" noValidate>
      <p className="text-sm text-muted">First, confirm it is you.</p>
      <div>
        <label htmlFor="setup-password" className="label">Your password</label>
        <input id="setup-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="field" autoFocus />
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function CodeInput({ id, value, onChange, label = 'Code from the app', allowRecovery = false }: { id: string; value: string; onChange: (v: string) => void; label?: string; allowRecovery?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(allowRecovery ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode={allowRecovery ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={allowRecovery ? '123456 or xxxx-xxxx' : '123456'}
        className="field max-w-[14rem] font-mono tracking-[0.2em]"
      />
    </div>
  );
}

function ScanForm({ setup, onCancel, onEnabled }: { setup: TwoStepSetup; onCancel: () => void; onEnabled: (codes: string[]) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Groups of four are easier to type into an app by hand.
  const grouped = setup.secret.match(/.{1,4}/g)?.join(' ') ?? setup.secret;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length !== 6) return setError('Type the 6-digit code your app shows for KleeLab.');
    setBusy(true);
    setError(null);
    try {
      onEnabled(await apiService.twoStepEnable(code));
    } catch (reason) {
      setError(errorText(reason));
      setCode('');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5 sm:grid-cols-[auto_1fr]" noValidate>
      {/* eslint-disable-next-line @next/next/no-img-element -- a data URI from the API, not a static asset */}
      <img src={setup.qr_svg} alt="QR code to scan with your authenticator app" width={176} height={176} className="h-44 w-44 rounded-xl border-[1.5px] border-ink bg-white p-2" />
      <div className="grid content-start gap-3 text-sm">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Open your authenticator app and add an account.</li>
          <li>Scan this code. Or, if you cannot scan, type the key below.</li>
          <li>Type the 6-digit code the app shows.</li>
        </ol>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-label text-muted">Key</p>
          <p className="mt-0.5 select-all break-all font-mono text-sm">{grouped}</p>
        </div>
        <CodeInput id="enable-code" value={code} onChange={setCode} />
        {error && <p role="alert" className="text-danger">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Turn on'}</Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </form>
  );
}

function RecoveryCodes({ codes, fresh, onDone }: { codes: string[]; fresh: boolean; onDone: () => void }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'blocked'>('idle');
  const [saved, setSaved] = useState(false);
  const text = `KleeLab team dashboard recovery codes\nEach code works once. Keep them somewhere safe.\n\n${codes.join('\n')}\n`;

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(text);
      setCopy('copied');
    } catch {
      // Some browsers block the clipboard; the codes can still be selected by hand.
      setCopy('blocked');
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'kleelab-recovery-codes.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div>
      <h3 className="font-semibold">Save your recovery codes</h3>
      <p className="mt-1 text-sm text-muted">
        {fresh ? 'If you lose your phone, ' : 'Your old codes have stopped working. If you lose your phone, '}
        one of these codes signs you in instead. Each works once. <strong className="text-ink">This is the only time they are shown.</strong>
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-2 rounded-xl border-[1.5px] border-ink bg-white p-4 font-mono text-sm sm:grid-cols-5">
        {codes.map((code) => (
          <li key={code} className="select-all">{code}</li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={copyCodes}>{copy === 'copied' ? 'Copied' : 'Copy'}</Button>
        <Button variant="secondary" size="sm" onClick={download}>Download</Button>
        {copy === 'blocked' && <span className="text-xs text-muted">This browser blocked copying. Select the codes, or download them.</span>}
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="h-4 w-4 accent-cobalt" />
        I have saved these somewhere safe, like a password manager
      </label>
      <Button size="sm" className="mt-3" onClick={onDone} disabled={!saved}>
        Done
      </Button>
    </div>
  );
}

function Enabled({
  status,
  step,
  setStep,
  onRenewed,
  onDisabled,
}: {
  status: TwoStepStatus;
  step: Step;
  setStep: (s: Step) => void;
  onRenewed: (codes: string[]) => void;
  onDisabled: (status: TwoStepStatus) => void;
}) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const low = status.recovery_codes_left <= 3;

  function open(next: Step) {
    setCode('');
    setPassword('');
    setError(null);
    setStep(next);
  }

  async function renew(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length !== 6) return setError('Type the 6-digit code from your app.');
    setBusy(true);
    setError(null);
    try {
      onRenewed(await apiService.newRecoveryCodes(code));
    } catch (reason) {
      setError(errorText(reason));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function disable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || !code.trim()) return setError('Type your password and a code.');
    setBusy(true);
    setError(null);
    try {
      onDisabled(await apiService.twoStepDisable(password, code.trim()));
    } catch (reason) {
      setError(errorText(reason));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-label text-muted">On since</dt>
          <dd className="mt-0.5">{formatDate(status.enabled_at)}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-label text-muted">Recovery codes left</dt>
          <dd className={low ? 'mt-0.5 font-semibold text-danger' : 'mt-0.5'}>
            {status.recovery_codes_left} of 10{low && ' · make new ones soon'}
          </dd>
        </div>
      </dl>

      {step.kind === 'renew' && (
        <form onSubmit={renew} className="mt-5 grid max-w-sm gap-3 border-t-[1.5px] border-line pt-5" noValidate>
          <p className="text-sm text-muted">New codes replace all the old ones. Type a code from your app to confirm.</p>
          <CodeInput id="renew-code" value={code} onChange={setCode} />
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>{busy ? 'Making…' : 'Make new codes'}</Button>
            <Button variant="ghost" onClick={() => open({ kind: 'idle' })}>Cancel</Button>
          </div>
        </form>
      )}

      {step.kind === 'disable' && (
        <form onSubmit={disable} className="mt-5 grid max-w-sm gap-3 border-t-[1.5px] border-line pt-5" noValidate>
          <p className="text-sm text-muted">Without it, your password alone signs you in, and you cannot add or switch off teammates.</p>
          <div>
            <label htmlFor="disable-password" className="label">Your password</label>
            <input id="disable-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="field" />
          </div>
          <CodeInput id="disable-code" value={code} onChange={setCode} label="Code from the app, or a recovery code" allowRecovery />
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" disabled={busy}>{busy ? 'Turning off…' : 'Turn off two-step'}</Button>
            <Button variant="ghost" onClick={() => open({ kind: 'idle' })}>Cancel</Button>
          </div>
        </form>
      )}

      {step.kind !== 'renew' && step.kind !== 'disable' && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => open({ kind: 'renew' })}>Make new recovery codes</Button>
          <Button variant="ghost" size="sm" onClick={() => open({ kind: 'disable' })}>Turn off</Button>
        </div>
      )}
    </div>
  );
}
