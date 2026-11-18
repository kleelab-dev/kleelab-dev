'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Bone, ErrorState, Loading } from '@/components/ui/States';
import { useLiveData } from '@/lib/useLiveData';
import { ApiError, apiService } from '@/services/api';
import type { ProjectDetail, RequestKind } from '@/types/api';
import { CarePlanCard } from './CarePlanCard';
import { Checklist } from './Checklist';
import { FilesPanel } from './FilesPanel';
import { HandoverPack } from './HandoverPack';
import { errorText } from './format';
import { BalanceDue, InvoiceList } from './Invoices';
import { MessageComposer } from './MessageComposer';
import { Panel } from './Pill';
import { ProjectHeader } from './ProjectHeader';
import { RequestForm, RequestList } from './Requests';
import { StageTimeline } from './StageTimeline';
import { StaleNote } from './StaleNote';
import { ApprovalCard, UpdateFeed } from './UpdateFeed';

/**
 * Everything a client sees about one project, in six panels: Over to you,
 * Where we are, Messages and updates, Files and links, Invoices and Looking
 * after your site. Each action returns the fresh project; in between, it
 * refreshes itself while the tab is open, so a reply from the team shows up
 * without reloading. Forms keep their own state, so a refresh never touches a
 * half-typed message.
 */
export function ClientProjectView({ projectId }: { projectId: string }) {
  const load = useCallback(() => apiService.getProject(projectId), [projectId]);
  const { data: project, error, stale, retry, set: setProject } = useLiveData<ProjectDetail>(`project:${projectId}`, load);

  // With exactly one project, /dashboard opens this page again, so a link back to
  // "All projects" would look broken. Until we know, the link shows.
  const [onlyProject, setOnlyProject] = useState(false);
  useEffect(() => {
    let active = true;
    apiService
      .getProjects()
      .then((all) => {
        if (active) setOnlyProject(all.length === 1);
      })
      .catch(() => {
        /* keep the link: it is the safe default */
      });
    return () => {
      active = false;
    };
  }, []);

  // When the last waiting thing is done, "Over to you" disappears along with the
  // control that had focus. Send focus to the next panel's heading instead of
  // letting it fall back to the top of the page.
  const needsYouNow = project ? needsClient(project) : null;
  const neededBefore = useRef(needsYouNow);
  useEffect(() => {
    const before = neededBefore.current;
    neededBefore.current = needsYouNow;
    if (before === true && needsYouNow === false) {
      const lost = !document.activeElement || document.activeElement === document.body;
      if (lost) document.getElementById(PLAN_HEADING)?.focus();
    }
  }, [needsYouNow]);

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
  const stillNeeded = project.checklist.filter((i) => !i.done_at);
  const needsYou = needsClient(project);
  const tick = async (itemId: string, done: boolean, note?: string | null) => setProject(await apiService.tickChecklist(project.id, itemId, done, note));

  return (
    <div>
      {onlyProject ? (
        <ProjectHeader project={project} />
      ) : (
        <ProjectHeader project={project} backHref="/dashboard" backLabel="All projects" />
      )}
      {stale && <StaleNote className="mt-4" />}

      {/* 1. Over to you: only while something is waiting on the client. */}
      {needsYou && (
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
          {approvals.length > 0 && (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {approvals.map((update) => (
                <ApprovalCard
                  key={update.id}
                  projectId={project.id}
                  update={update}
                  stageName={update.stage_id ? stageName.get(update.stage_id) : undefined}
                  onDecide={async (decision, note) => setProject(await apiService.answerApproval(project.id, update.id, decision, note))}
                />
              ))}
            </div>
          )}
          {stillNeeded.length > 0 && (
            <div className="mt-5 border-t-[1.5px] border-ink/15 pt-5">
              <h3 className="font-display text-lg font-extrabold tracking-tight">What we need to get started</h3>
              <div className="mt-2">
                <Checklist items={project.checklist} onTick={tick} />
              </div>
            </div>
          )}
          {toPay.length > 0 && (
            <p className="mt-4 text-sm text-ink-soft">
              You have {toPay.length === 1 ? 'an invoice' : `${toPay.length} invoices`} to pay. See <a href="#invoices" className="font-semibold text-cobalt">Invoices</a>.
            </p>
          )}
        </section>
      )}

      <div className="mt-8 grid gap-6 sm:mt-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-w-0 content-start gap-6">
          {/* 2. Where we are: every step, with what is happening now under the current one. */}
          <Panel tag="the plan" title="Where we are" headingId={PLAN_HEADING}>
            <StageTimeline
              stages={project.stages}
              renderControls={(stage) =>
                current && stage.id === current.id && !stage.description ? (
                  <p className="text-sm leading-6 text-ink-soft">
                    {stage.status === 'waiting_on_client'
                      ? 'We need something from you before we can carry on.'
                      : 'We are working on this now. You will see updates below as we go.'}
                  </p>
                ) : null
              }
            />
            {/* Everything sent: still there to check, change or un-tick, but out of the way. */}
            {project.checklist.length > 0 && stillNeeded.length === 0 && (
              <details className="mt-6 border-t border-line pt-4">
                <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-cobalt">
                  What you sent us ({project.checklist.length})
                </summary>
                <div className="mt-3">
                  <Checklist items={project.checklist} onTick={tick} />
                </div>
              </details>
            )}
          </Panel>

          {/* 3. Messages and updates. */}
          <Panel tag="talk to us" title="Messages and updates">
            <MessageComposer
              projectId={project.id}
              onSend={async (body, attachmentIds) => setProject(await apiService.sendMessage(project.id, body, attachmentIds))}
            />
            <div className="mt-5">
              <UpdateFeed projectId={project.id} updates={history} stages={project.stages} empty="Nothing here yet. We post an update at every step, and you can message us any time." />
            </div>
          </Panel>
        </div>

        <aside className="grid min-w-0 content-start gap-6">
          {/* 4. Files and links: previews and links first, then files. */}
          <Panel tag="shared" title="Files and links">
            <FilesPanel
              project={project}
              links={links}
              empty="No files or links yet. Add one, or we will share previews here."
              onChange={setProject}
            />
          </Panel>

          {/* 5. Invoices: only when there are any. */}
          {(invoices.length > 0 || !!project.balance_due_cents) && (
            <div id="invoices" className="scroll-mt-24">
              <Panel tag="payments" title="Invoices">
                <div className="grid gap-2">
                  {invoices.length > 0 && <InvoiceList invoices={invoices} projectId={project.id} />}
                  <BalanceDue project={project} />
                </div>
                <p className="mt-3 text-xs text-muted">Pay now opens a secure payment page. Questions about an invoice? Send us a message.</p>
              </Panel>
            </div>
          )}

          {/* 6. After launch: hand-over, care plan and requests for extra services. */}
          <AfterLaunch project={project} onRequest={async (kind, message) => setProject(await apiService.requestService(project.id, kind, message))} />
        </aside>
      </div>
    </div>
  );
}

/** The id of the "Where we are" heading, where focus goes when "Over to you" closes. */
const PLAN_HEADING = 'where-we-are';

/** Something is waiting on the client: an approval, a step, an invoice or a checklist item. */
function needsClient(project: ProjectDetail): boolean {
  return (
    project.updates.some((u) => u.kind === 'approval' && u.approval_status === 'pending') ||
    project.stages.some((s) => s.status === 'waiting_on_client') ||
    project.invoices.some((i) => i.status === 'unpaid') ||
    project.checklist.some((i) => !i.done_at)
  );
}

/**
 * Hand-over pack, care plan and requests for going live, hosting or care, in
 * one panel. Before hand-over and with no care plan there is nothing to read
 * yet, so the request form waits behind a button.
 */
function AfterLaunch({ project, onRequest }: { project: ProjectDetail; onRequest: (kind: RequestKind, message: string) => Promise<void> }) {
  const [asking, setAsking] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const launched = Boolean(project.handover || project.care_plan);
  const formId = `request-form-${project.id}`;
  const close = () => {
    setAsking(false);
    toggle.current?.focus();
  };

  return (
    <Panel tag="after launch" title="Looking after your site" className={project.handover ? 'border-ink bg-sun-soft' : undefined}>
      <div className="grid gap-6">
        {project.handover && (
          <div>
            <h3 className="font-semibold">Your hand-over pack</h3>
            <div className="mt-3">
              <HandoverPack handover={project.handover} />
            </div>
          </div>
        )}
        {project.care_plan && (
          <div className={project.handover ? 'border-t border-line pt-6' : undefined}>
            <h3 className="font-semibold">Your care plan</h3>
            <div className="mt-3">
              <CarePlanCard plan={project.care_plan} />
            </div>
          </div>
        )}
        {(project.requests.length > 0 || launched) && (
          <div className={launched ? 'border-t border-line pt-6' : undefined}>
            {launched && <h3 className="font-semibold">Going live, hosting and care</h3>}
            {project.requests.length > 0 && (
              <div className={launched ? 'mt-3' : undefined}>
                <RequestList requests={project.requests} />
              </div>
            )}
            {launched && (
              <div className={project.requests.length ? 'mt-5' : undefined}>
                <RequestForm onRequest={onRequest} />
              </div>
            )}
          </div>
        )}
        {!launched && (
          <div>
            <p className="text-sm leading-6 text-muted">When your site is ready, we can put it live, host it and look after it for you.</p>
            <Button
              ref={toggle}
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3 min-h-11"
              aria-expanded={asking}
              aria-controls={formId}
              onClick={() => setAsking((open) => !open)}
            >
              Need hosting or care?
            </Button>
            {/* Always in the page, so aria-controls points at something; the form is inside only while open. */}
            <div id={formId} className={asking ? 'mt-5' : undefined}>
              {asking && <RequestForm onRequest={onRequest} onCancel={close} autoFocus />}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

/** Same shape as the page: the "Over to you" box, then two columns holding the other five panels. */
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
      <div className="card mt-8 p-5 sm:mt-10 sm:p-6">
        <Bone className="h-3 w-24" />
        <Bone className="mt-3 h-6 w-40" />
        <Bone className="mt-5 h-16 w-full rounded-xl" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid content-start gap-6">
          {[0, 1].map((i) => (
            <div key={i} className="card p-5 sm:p-6">
              <Bone className="h-3 w-24" />
              <Bone className="mt-3 h-5 w-48" />
              <Bone className="mt-5 h-16 w-full rounded-xl" />
              <Bone className="mt-3 h-16 w-full rounded-xl" />
            </div>
          ))}
        </div>
        <div className="grid content-start gap-6">
          {[0, 1, 2].map((i) => (
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
