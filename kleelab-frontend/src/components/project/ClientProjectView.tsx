'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiService } from '@/services/api';
import type { ProjectDetail } from '@/types/api';
import { FilesPanel } from './FilesPanel';
import { errorText } from './format';
import { InvoiceList } from './Invoices';
import { MessageComposer } from './MessageComposer';
import { Panel } from './Pill';
import { ProjectHeader } from './ProjectHeader';
import { RequestForm, RequestList } from './Requests';
import { StageTimeline } from './StageTimeline';
import { ApprovalCard, UpdateFeed, UpdateLink } from './UpdateFeed';

/** Everything a client sees about one project. Each action returns the fresh project. */
export function ClientProjectView({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiService
      .getProject(projectId)
      .then((detail) => active && setProject(detail))
      .catch((reason) => active && setError(errorText(reason, 'We could not load this project.')));
    return () => {
      active = false;
    };
  }, [projectId]);

  if (error) {
    return (
      <div className="card max-w-md p-7">
        <p className="font-display text-2xl font-extrabold">Project not found</p>
        <p className="mt-2 text-sm text-muted">{error}</p>
        <Link href="/dashboard" className="mt-5 inline-block text-sm font-semibold text-cobalt">
          ← All projects
        </Link>
      </div>
    );
  }
  if (!project) return <p className="font-mono text-[11px] uppercase tracking-label text-muted">Loading project…</p>;

  const stageName = new Map(project.stages.map((s) => [s.id, s.name]));
  const approvals = project.updates.filter((u) => u.kind === 'approval' && u.approval_status === 'pending');
  const waitingStages = project.stages.filter((s) => s.status === 'waiting_on_client');
  const current = project.stages.find((s) => s.status === 'waiting_on_client' || s.status === 'in_progress');
  const links = project.updates
    .filter((u) => u.link_url)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const history = project.updates.filter((u) => !(u.kind === 'approval' && u.approval_status === 'pending'));
  const toPay = project.invoices.filter((i) => i.status === 'unpaid');
  const invoices = project.invoices.filter((i) => i.status !== 'cancelled');

  return (
    <div>
      <ProjectHeader project={project} backHref="/dashboard" backLabel="All projects" />

      {(approvals.length > 0 || waitingStages.length > 0 || toPay.length > 0) && (
        <section className="mt-10 rounded-2xl border-[1.5px] border-ink bg-sun-soft p-5 sm:p-6" aria-labelledby="needs-you">
          <p className="tag text-ink">waiting for you</p>
          <h2 id="needs-you" className="mt-1 font-display text-2xl font-extrabold tracking-tight">
            Over to you
          </h2>
          {waitingStages.length > 0 && approvals.length === 0 && (
            <p className="mt-2 text-sm text-ink-soft">
              We need something from you for <strong>{waitingStages.map((s) => s.name).join(', ')}</strong>. Read our latest message below, then reply or add a file.
            </p>
          )}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {approvals.map((update) => (
              <ApprovalCard
                key={update.id}
                update={update}
                stageName={update.stage_id ? stageName.get(update.stage_id) : undefined}
                onDecide={async (decision, note) => setProject(await apiService.answerApproval(project.id, update.id, decision, note))}
              />
            ))}
          </div>
          {toPay.length > 0 && (
            <p className="mt-4 text-sm text-ink-soft">
              You have {toPay.length === 1 ? 'an invoice' : `${toPay.length} invoices`} to pay. See <a href="#invoices" className="font-semibold text-cobalt">Invoices</a>.
            </p>
          )}
        </section>
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid content-start gap-6">
          {current && (
            <Panel tag="happening now" title={current.name}>
              <p className="text-sm leading-6 text-muted">
                {current.description || (current.status === 'waiting_on_client' ? 'We need something from you before we can carry on.' : 'We are working on this now. You will see updates below as we go.')}
              </p>
            </Panel>
          )}
          <Panel tag="talk to us" title="Messages and updates">
            <MessageComposer onSend={async (body) => setProject(await apiService.sendMessage(project.id, body))} />
            <div className="mt-5">
              <UpdateFeed updates={history} stages={project.stages} empty="Nothing here yet. We post an update at every step, and you can message us any time." />
            </div>
          </Panel>
        </div>

        <aside className="grid content-start gap-6">
          <Panel tag="the plan" title="Steps">
            <StageTimeline stages={project.stages} />
          </Panel>
          <Panel tag="shared" title="Files">
            <FilesPanel project={project} onChange={setProject} />
          </Panel>
          {invoices.length > 0 && (
            <div id="invoices">
              <Panel tag="payments" title="Invoices">
                <InvoiceList invoices={invoices} projectId={project.id} />
                <p className="mt-3 text-xs text-muted">Pay now opens a secure payment page. Questions about an invoice? Send us a message.</p>
              </Panel>
            </div>
          )}
          {links.length > 0 && (
            <Panel tag="links" title="Previews and links">
              <ul className="grid gap-2">
                {links.map((u) => (
                  <li key={u.id} className="border-b border-line pb-2 last:border-0 last:pb-0">
                    <p className="text-sm font-medium">{u.title || u.link_label || 'Link'}</p>
                    <UpdateLink update={u} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel tag="extra services" title="Going live, hosting and care">
            <RequestList requests={project.requests} />
            <div className={project.requests.length ? 'mt-5 border-t border-line pt-5' : ''}>
              <RequestForm onRequest={async (kind, message) => setProject(await apiService.requestService(project.id, kind, message))} />
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
