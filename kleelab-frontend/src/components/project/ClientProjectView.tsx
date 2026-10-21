'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { Bone, ErrorState, Loading } from '@/components/ui/States';
import { useLiveData } from '@/lib/useLiveData';
import { ApiError, apiService } from '@/services/api';
import type { ProjectDetail } from '@/types/api';
import { FilesPanel } from './FilesPanel';
import { errorText } from './format';
import { InvoiceList } from './Invoices';
import { MessageComposer } from './MessageComposer';
import { Panel } from './Pill';
import { ProjectHeader } from './ProjectHeader';
import { RequestForm, RequestList } from './Requests';
import { StageTimeline } from './StageTimeline';
import { StaleNote } from './StaleNote';
import { ApprovalCard, UpdateFeed, UpdateLink } from './UpdateFeed';

/**
 * Everything a client sees about one project. Each action returns the fresh
 * project; in between, it refreshes itself while the tab is open, so a reply
 * from the team shows up without reloading. Forms keep their own state, so a
 * refresh never touches a half-typed message.
 */
export function ClientProjectView({ projectId }: { projectId: string }) {
  const load = useCallback(() => apiService.getProject(projectId), [projectId]);
  const { data: project, error, stale, retry, set: setProject } = useLiveData<ProjectDetail>(`project:${projectId}`, load);

  if (error) {
    const missing = error instanceof ApiError && (error.status === 404 || error.status === 403 || error.status === 422);
    const back = (
      <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm font-semibold text-cobalt">
        ← All projects
      </Link>
    );
    return missing ? (
      <ErrorState title="Project not found" message="This project does not exist, or it is not shared with this account.">
        {back}
      </ErrorState>
    ) : (
      <ErrorState
        title="This project did not load"
        message={`${errorText(error, 'Something went wrong on our side.')} Nothing is lost; this is only a problem showing it.`}
        onRetry={retry}
      >
        {back}
      </ErrorState>
    );
  }
  if (!project) return <ProjectSkeleton />;

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
      {stale && <StaleNote className="mt-4" />}

      {(approvals.length > 0 || waitingStages.length > 0 || toPay.length > 0) && (
        <section className="mt-8 rounded-2xl border-[1.5px] border-ink bg-sun-soft p-4 sm:mt-10 sm:p-6" aria-labelledby="needs-you">
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

      <div className="mt-8 grid gap-6 sm:mt-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-w-0 content-start gap-6">
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

        <aside className="grid min-w-0 content-start gap-6">
          <Panel tag="the plan" title="Steps">
            <StageTimeline stages={project.stages} />
          </Panel>
          <Panel tag="shared" title="Files">
            <FilesPanel project={project} onChange={setProject} />
          </Panel>
          {invoices.length > 0 && (
            <div id="invoices" className="scroll-mt-24">
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
                    <p className="break-words text-sm font-medium">{u.title || u.link_label || 'Link'}</p>
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

function ProjectSkeleton() {
  return (
    <Loading label="Loading your project">
      <Bone className="h-3 w-24" />
      <div className="mt-5 flex gap-2">
        <Bone className="h-3 w-16" />
        <Bone className="h-3 w-20" />
      </div>
      <Bone className="mt-4 h-9 w-4/5 max-w-lg" />
      <Bone className="mt-4 h-3 w-full max-w-xl" />
      <Bone className="mt-6 h-2.5 w-full" />
      <div className="mt-8 grid gap-6 sm:mt-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="card p-5 sm:p-6">
          <Bone className="h-3 w-24" />
          <Bone className="mt-3 h-5 w-48" />
          <Bone className="mt-5 h-20 w-full rounded-xl" />
          <Bone className="mt-5 h-16 w-full rounded-xl" />
          <Bone className="mt-3 h-16 w-full rounded-xl" />
        </div>
        <div className="grid content-start gap-6">
          {[0, 1].map((i) => (
            <div key={i} className="card p-5 sm:p-6">
              <Bone className="h-3 w-20" />
              <Bone className="mt-3 h-5 w-32" />
              <Bone className="mt-5 h-3 w-full" />
              <Bone className="mt-3 h-3 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </Loading>
  );
}
