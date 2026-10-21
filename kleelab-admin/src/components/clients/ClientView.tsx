'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckIcon } from '@heroicons/react/24/outline';
import { Button, buttonClass } from '@/components/ui/Button';
import { CopyEmail } from '@/components/ui/CopyEmail';
import { InvoiceRow } from '@/components/money/InvoiceRow';
import { Panel, Pill } from '@/components/project/Pill';
import { ProjectCard } from '@/components/project/ProjectCard';
import { errorText, formatDate, formatDateTime, formatTotals } from '@/components/project/format';
import { apiService } from '@/services/api';
import type { ClientDetail } from '@/types/api';

/** One client: their projects, their invoices, and their access. */
export function ClientView({ clientId }: { clientId: string }) {
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiService
      .adminClient(clientId)
      .then((value) => active && setClient(value))
      .catch((reason) => active && setError(errorText(reason)));
    return () => {
      active = false;
    };
  }, [clientId]);

  function done(next: ClientDetail, message: string) {
    setClient(next);
    setError(null);
    setNotice(message);
  }

  if (!client) {
    return (
      <div>
        <Link href="/clients" className="font-mono text-[11px] uppercase tracking-label text-muted no-underline hover:text-ink">← All clients</Link>
        {error ? (
          <p role="alert" className="mt-6 rounded-xl bg-danger-soft p-4 text-sm text-danger">{error}</p>
        ) : (
          <p className="mt-6 font-mono text-[11px] uppercase tracking-label text-muted">Loading…</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <Link href="/clients" className="font-mono text-[11px] uppercase tracking-label text-muted no-underline hover:text-ink">← All clients</Link>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!client.is_active && <Pill tone="bg-line text-muted">Switched off</Pill>}
        {client.is_active && !client.last_sign_in && <Pill tone="bg-sun-soft text-ink">Never signed in</Pill>}
        <span className="text-xs text-muted">Client since {formatDate(client.created_at)}</span>
      </div>
      <h1 className="mt-2 break-words font-display text-3xl font-extrabold tracking-tightest sm:text-4xl">{client.name || client.email}</h1>

      {error && <p role="alert" className="mt-6 rounded-xl bg-danger-soft p-4 text-sm text-danger">{error}</p>}
      {notice && !error && (
        <p role="status" className="mt-6 flex items-center gap-2 rounded-xl bg-mint p-3 text-sm text-ink">
          <CheckIcon className="h-4 w-4" aria-hidden />
          {notice}
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-w-0 content-start gap-6">
          <section>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-extrabold">Projects</h2>
              <Link href={`/projects?new=1`} className={buttonClass('ghost', 'sm')}>New project</Link>
            </div>
            <div className="mt-3 grid gap-4">
              {client.projects.map((project) => (
                <ProjectCard key={project.id} project={project} href={`/projects/${project.id}`} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-display text-xl font-extrabold">Invoices</h2>
            {client.invoices.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No invoices yet. Send one from a project page.</p>
            ) : (
              <ul className="card mt-3 divide-y divide-line overflow-hidden">
                {client.invoices.map((invoice) => (
                  <InvoiceRow
                    key={invoice.id}
                    invoice={invoice}
                    showClient={false}
                    onChange={(_, message) => {
                      setNotice(message);
                      apiService.adminClient(client.id).then(setClient).catch(() => undefined);
                    }}
                    onError={setError}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="grid content-start gap-6">
          <Panel tag="money" title="Account">
            <dl className="grid gap-3 text-sm">
              <Figure label="Billed">{client.billed.length ? formatTotals(client.billed) : 'Nothing yet'}</Figure>
              <Figure label="Paid">{client.paid.length ? formatTotals(client.paid) : 'Nothing yet'}</Figure>
              <Figure label="Still owes">
                <span className={client.outstanding.length ? 'font-semibold text-danger' : undefined}>
                  {client.outstanding.length ? formatTotals(client.outstanding) : 'Nothing'}
                </span>
              </Figure>
            </dl>
          </Panel>

          <Details client={client} onSaved={done} onError={setError} />
          <Access client={client} onSaved={done} onNotice={(m) => { setError(null); setNotice(m); }} onError={setError} />
        </aside>
      </div>
    </div>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-label text-muted">{label}</dt>
      <dd className="mt-0.5 break-words font-display text-lg font-extrabold text-ink">{children}</dd>
    </div>
  );
}

function Details({ client, onSaved, onError }: { client: ClientDetail; onSaved: (c: ClientDetail, m: string) => void; onError: (m: string) => void }) {
  const [name, setName] = useState(client.name ?? '');
  const [busy, setBusy] = useState(false);
  const changed = name.trim() !== (client.name ?? '');

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      onSaved(await apiService.adminUpdateClient(client.id, { full_name: name.trim() || null }), 'Name saved.');
    } catch (reason) {
      onError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel tag="contact" title="Details">
      <div className="text-sm">
        <p className="font-mono text-[10px] uppercase tracking-label text-muted">Email</p>
        <div className="mt-0.5"><CopyEmail email={client.email} /></div>
      </div>
      <form onSubmit={save} className="mt-4 grid gap-2">
        <label htmlFor="client_name" className="label">Name</label>
        <div className="flex gap-2">
          <input id="client_name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="field py-2 text-sm" />
          <Button type="submit" size="sm" variant="secondary" disabled={busy || !changed}>Save</Button>
        </div>
      </form>
    </Panel>
  );
}

function Access({
  client,
  onSaved,
  onNotice,
  onError,
}: {
  client: ClientDetail;
  onSaved: (c: ClientDetail, m: string) => void;
  onNotice: (m: string) => void;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState<'invite' | 'access' | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function invite() {
    setBusy('invite');
    try {
      const result = await apiService.adminInviteClient(client.id);
      onNotice(`Sign-in link sent to ${result.email}. It works for 7 days.`);
    } catch (reason) {
      onError(errorText(reason, 'The email could not be sent.'));
    } finally {
      setBusy(null);
    }
  }

  async function setAccess(on: boolean) {
    setBusy('access');
    try {
      const next = await apiService.adminUpdateClient(client.id, { is_active: on });
      setConfirming(false);
      onSaved(next, on ? 'Access is back on. They can sign in again.' : 'Access switched off. They have been signed out everywhere.');
    } catch (reason) {
      onError(errorText(reason));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel tag="dashboard" title="Access">
      <p className="text-sm text-muted">
        {client.last_sign_in ? (
          <>Last signed in <strong className="text-ink">{formatDateTime(client.last_sign_in)}</strong>.</>
        ) : (
          `They have never signed in.${client.is_active ? ' Their first invite may have gone to spam.' : ''}`
        )}
      </p>

      {client.is_active ? (
        <>
          <Button type="button" variant="secondary" size="sm" className="mt-4" disabled={busy !== null} onClick={invite}>
            {busy === 'invite' ? 'Sending…' : 'Send sign-in link'}
          </Button>
          <p className="mt-1 text-xs text-muted">Emails a fresh link to set a password. The old password still works until they change it.</p>

          <div className="mt-5 border-t border-line pt-4">
            {confirming ? (
              <div className="rounded-xl bg-danger-soft p-3">
                <p className="text-sm text-danger">
                  They will be signed out straight away and cannot sign in until you switch them back on. Nothing is deleted.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant="danger" size="sm" disabled={busy !== null} onClick={() => setAccess(false)}>
                    {busy === 'access' ? 'Switching off…' : 'Yes, switch off'}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="text-xs font-semibold text-danger">
                Switch off their access
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-ink">Access is switched off. Their projects and invoices are kept.</p>
          <Button type="button" size="sm" className="mt-4" disabled={busy !== null} onClick={() => setAccess(true)}>
            {busy === 'access' ? 'Switching on…' : 'Switch access back on'}
          </Button>
        </>
      )}
    </Panel>
  );
}
