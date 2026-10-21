'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { ShieldExclamationIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { Button, buttonClass } from '@/components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { useCurrentUser } from '@/components/app/AppShell';
import { Panel, Pill } from '@/components/project/Pill';
import { errorText, formatDate, timeAgo } from '@/components/project/format';
import { apiService } from '@/services/api';
import type { TeamMember } from '@/types/api';

export function TeamView() {
  const user = useCurrentUser();
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const secure = Boolean(user.two_step_enabled);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiService
      .adminTeam()
      .then((list) => active && setMembers(list))
      .catch((reason) => active && setLoadError(errorText(reason)));
    return () => {
      active = false;
    };
  }, [attempt]);

  function load() {
    setLoadError(null);
    setAttempt((n) => n + 1);
  }

  function replace(member: TeamMember) {
    setMembers((list) => list?.map((m) => (m.id === member.id ? member : m)) ?? null);
  }

  function say(message: string) {
    setError(null);
    setNotice(message);
  }

  function fail(message: string) {
    setNotice(null);
    setError(message);
  }

  const active = members?.filter((m) => m.is_active) ?? [];
  const off = members?.filter((m) => !m.is_active) ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="tag">team</p>
          <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tightest sm:text-5xl">Team</h1>
          <p className="mt-3 text-muted">Everyone who can sign in to this dashboard and see every client project.</p>
        </div>
        {secure && !adding && (
          <Button onClick={() => setAdding(true)}>
            <UserPlusIcon className="h-4 w-4" aria-hidden />
            Add a teammate
          </Button>
        )}
      </div>

      {!secure && (
        <div className="mt-8 flex flex-wrap items-center gap-3 rounded-xl border-[1.5px] border-ink bg-sun-soft p-4 text-sm">
          <ShieldExclamationIcon className="h-6 w-6 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            Turn on two-step sign-in to add teammates, switch them off or reset their two-step. It keeps a stolen password from being used to
            let someone else in.
          </p>
          <Link href="/account" className={buttonClass('secondary', 'sm')}>Set it up</Link>
        </div>
      )}

      {adding && (
        <AddForm
          onCancel={() => setAdding(false)}
          onAdded={(member, sent) => {
            setMembers((list) => (list ? [...list, member] : [member]));
            setAdding(false);
            if (sent) say(`${member.name || member.email} is on the team. We emailed them a link to set a password. It lasts 7 days.`);
            else fail(`${member.name || member.email} was added, but the invite email could not be sent. Try “Send invite again”.`);
          }}
        />
      )}

      {notice && <p role="status" className="mt-6 rounded-xl bg-mint p-4 text-sm">{notice}</p>}
      {error && <p role="alert" className="mt-6 rounded-xl bg-danger-soft p-4 text-sm text-danger">{error}</p>}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {loadError && <ErrorState message={loadError} onRetry={load} className="md:col-span-2" />}
        {!loadError && !members && <Skeleton rows={2} className="md:col-span-2 md:grid-cols-2" />}
        {members && active.length === 0 && <EmptyState title="Nobody is on the team" className="md:col-span-2" />}
        {active.map((member) => (
          <MemberCard key={member.id} member={member} secure={secure} onChange={replace} onNotice={say} onError={fail} />
        ))}
      </div>

      {off.length > 0 && (
        <>
          <h2 className="mt-12 font-display text-xl font-extrabold">Switched off</h2>
          <p className="mt-1 text-sm text-muted">They cannot sign in. Their history stays, and you can switch them back on.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {off.map((member) => (
              <MemberCard key={member.id} member={member} secure={secure} onChange={replace} onNotice={say} onError={fail} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AddForm({ onCancel, onAdded }: { onCancel: () => void; onAdded: (member: TeamMember, sent: boolean) => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !name.trim()) return setError('Add their name and work email.');
    setBusy(true);
    setError(null);
    try {
      const result = await apiService.adminAddTeammate(email.trim(), name.trim());
      onAdded(result.member, result.invite_sent);
    } catch (reason) {
      setError(errorText(reason));
      setBusy(false);
    }
  }

  return (
    <Panel tag="new" title="Add a teammate" className="mt-8">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div>
          <label htmlFor="member-name" className="label">Name</label>
          <input id="member-name" value={name} onChange={(e) => setName(e.target.value)} className="field" autoComplete="off" autoFocus />
        </div>
        <div>
          <label htmlFor="member-email" className="label">Email</label>
          <input id="member-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field" autoComplete="off" />
        </div>
        <p className="text-sm text-muted sm:col-span-2">
          They get an email with a link to set a password. Teammates can see every project, client and invoice.
        </p>
        {error && <p role="alert" className="text-sm text-danger sm:col-span-2">{error}</p>}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add and send invite'}</Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </Panel>
  );
}

type Confirm = null | 'off' | 'reset';

function MemberCard({
  member,
  secure,
  onChange,
  onNotice,
  onError,
}: {
  member: TeamMember;
  secure: boolean;
  onChange: (member: TeamMember) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(member.name ?? '');
  const label = member.name || member.email;
  const neverSignedIn = !member.last_sign_in;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (reason) {
      onError(errorText(reason));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  const rename = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    run(async () => {
      onChange(await apiService.adminUpdateTeammate(member.id, { full_name: name.trim() }));
      setRenaming(false);
    });
  };

  return (
    <article className={clsx('card p-5', !member.is_active && 'opacity-80')}>
      {renaming ? (
        <form onSubmit={rename} className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor={`name-${member.id}`} className="label">Name</label>
            <input id={`name-${member.id}`} value={name} onChange={(e) => setName(e.target.value)} className="field py-2" autoFocus />
          </div>
          <Button type="submit" size="sm" disabled={busy}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>Cancel</Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 truncate font-semibold">{label}</h2>
          {member.is_you && <Pill tone="bg-ink text-paper">You</Pill>}
          {!member.is_active && <Pill tone="bg-line text-muted">Switched off</Pill>}
          {member.is_active && neverSignedIn && <Pill tone="bg-sun-soft text-ink">Invite not used yet</Pill>}
          {member.is_active && (
            <Pill tone={member.two_step_enabled ? 'bg-mint text-ink' : 'bg-danger-soft text-danger'}>
              {member.two_step_enabled ? 'Two-step on' : 'Two-step off'}
            </Pill>
          )}
        </div>
      )}
      {member.name && !renaming && <p className="truncate text-sm text-muted">{member.email}</p>}

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-label text-muted">In charge of</dt>
          <dd className="mt-0.5">{member.projects_in_charge} {member.projects_in_charge === 1 ? 'project' : 'projects'}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-label text-muted">Last signed in</dt>
          <dd className="mt-0.5">{member.last_sign_in ? timeAgo(member.last_sign_in) : 'Never'}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted">
        Added {formatDate(member.created_at)} ·{' '}
        <Link href={`/activity?person=${member.id}`} className="text-cobalt">See what they did</Link>
      </p>

      {confirm && (
        <div className="mt-4 rounded-xl border-[1.5px] border-ink bg-sun-soft p-4 text-sm">
          <p>
            {confirm === 'off'
              ? `${label} will be signed out straight away and cannot sign in until you switch them back on. Their projects keep them in charge until you change it.`
              : `${label} will be signed out and can then sign in with their password alone. They should set up two-step again from their Account page. We will email them to say so.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (confirm === 'off') {
                    onChange(await apiService.adminUpdateTeammate(member.id, { is_active: false }));
                    onNotice(`${label} is switched off.`);
                  } else {
                    onChange(await apiService.adminResetTwoStep(member.id));
                    onNotice(`Two-step is off for ${label}. They have been signed out and emailed.`);
                  }
                })
              }
            >
              {confirm === 'off' ? 'Switch off' : 'Reset two-step'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {!confirm && !renaming && (
        <div className="mt-4 flex flex-wrap gap-2 border-t-[1.5px] border-line pt-4">
          <Button size="sm" variant="ghost" onClick={() => setRenaming(true)}>Rename</Button>
          {member.is_active && neverSignedIn && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const result = await apiService.adminInviteTeammate(member.id);
                  onNotice(`A new invite is on its way to ${result.email}.`);
                })
              }
            >
              Send invite again
            </Button>
          )}
          {secure && !member.is_you && member.is_active && member.two_step_enabled && (
            <Button size="sm" variant="ghost" onClick={() => setConfirm('reset')}>Reset two-step</Button>
          )}
          {secure && !member.is_you && member.is_active && (
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirm('off')}>Switch off</Button>
          )}
          {secure && !member.is_active && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  onChange(await apiService.adminUpdateTeammate(member.id, { is_active: true }));
                  onNotice(`${label} can sign in again.`);
                })
              }
            >
              Switch back on
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
