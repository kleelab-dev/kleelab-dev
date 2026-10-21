'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import { apiService } from '@/services/api';
import type { ProjectDetail, ProjectStatus, RequestStatus, Stage, StaffMember, StageStatus, UpdateKind } from '@/types/api';
import { FilesPanel } from './FilesPanel';
import { errorText, staffLabel, PROJECT_STATUS, REQUEST_STATUS, STAGE_STATUS, stageLabel, toDateInput } from './format';
import { AdminInvoices } from './Invoices';
import { Panel } from './Pill';
import { ProjectHeader } from './ProjectHeader';
import { RequestList } from './Requests';
import { StageTimeline } from './StageTimeline';
import { UpdateFeed } from './UpdateFeed';

type Save = (work: () => Promise<ProjectDetail>) => Promise<void>;

/** The team's controls for one project: steps, posts, approvals, files, invoices and details. */
export function AdminProjectView({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiService
      .getProject(projectId)
      .then((detail) => active && setProject(detail))
      .catch((reason) => active && setError(errorText(reason, 'We could not load this project.')));
    apiService
      .adminStaff()
      .then((list) => active && setStaff(list))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [projectId]);

  if (error) {
    return (
      <div className="card max-w-md p-7">
        <p className="font-display text-2xl font-extrabold">Project not found</p>
        <p className="mt-2 text-sm text-muted">{error}</p>
        <Link href="/" className="mt-5 inline-block text-sm font-semibold text-cobalt">← All projects</Link>
      </div>
    );
  }
  if (!project) return <p className="font-mono text-[11px] uppercase tracking-label text-muted">Loading project…</p>;

  const save: Save = async (work) => {
    setSaveError(null);
    try {
      setProject(await work());
    } catch (reason) {
      setSaveError(errorText(reason));
      throw reason;
    }
  };
  const quiet = (work: () => Promise<ProjectDetail>) => save(work).catch(() => undefined);
  const openRequests = project.requests.filter((r) => r.status === 'open').length;

  return (
    <div>
      <ProjectHeader project={project} backHref="/" backLabel="All projects" />
      <ClientBar project={project} staff={staff} save={quiet} />
      {saveError && <p role="alert" className="mt-6 rounded-xl bg-danger-soft p-4 text-sm text-danger">{saveError}</p>}

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="grid content-start gap-6">
          <Panel tag="write" title="Post an update">
            <PostUpdate project={project} save={save} />
          </Panel>
          <Panel tag="history" title="Everything posted">
            <UpdateFeed updates={project.updates} stages={project.stages} team empty="Nothing posted yet." />
          </Panel>
        </div>
        <aside className="grid content-start gap-6">
          <Panel tag="plan" title="Steps">
            <StageTimeline
              stages={project.stages}
              team
              renderControls={(stage) => <StageControls project={project} stage={stage} save={quiet} />}
            />
            <AddStage project={project} save={save} />
          </Panel>
          <Panel tag={openRequests ? `${openRequests} need an answer` : 'asked for'} title="Extra services">
            {project.requests.length ? (
              <RequestList
                requests={project.requests}
                team
                renderControls={(request) => (
                  <select
                    aria-label="Answer"
                    value={request.status}
                    onChange={(e) => quiet(() => apiService.adminUpdateRequest(project.id, request.id, e.target.value as RequestStatus))}
                    className="field w-auto py-1.5 text-xs"
                  >
                    {(Object.keys(REQUEST_STATUS) as RequestStatus[]).map((s) => (
                      <option key={s} value={s}>{REQUEST_STATUS[s].teamLabel}</option>
                    ))}
                  </select>
                )}
              />
            ) : (
              <p className="text-sm text-muted">The client has not asked for anything extra.</p>
            )}
            {project.requests.length > 0 && <p className="mt-3 text-xs text-muted">The client gets an email when you agree, say no, or finish.</p>}
          </Panel>
          <Panel tag="shared" title="Files">
            <FilesPanel project={project} team onChange={setProject} />
          </Panel>
          <Panel tag="money" title="Invoices">
            <AdminInvoices project={project} onChange={setProject} />
          </Panel>
          <Panel tag="about" title="Project details">
            <ProjectDetails key={project.updated_at} project={project} save={save} />
          </Panel>
        </aside>
      </div>
    </div>
  );
}

/** Who the client is, who on the team looks after it, and a way back in for the client. */
function ClientBar({ project, staff, save }: { project: ProjectDetail; staff: StaffMember[]; save: (work: () => Promise<ProjectDetail>) => Promise<void> }) {
  const [invite, setInvite] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [inviteError, setInviteError] = useState<string | null>(null);

  async function resend() {
    setInvite('sending');
    setInviteError(null);
    try {
      await apiService.adminResendInvite(project.id);
      setInvite('sent');
    } catch (reason) {
      setInvite('failed');
      setInviteError(errorText(reason, 'The email could not be sent.'));
    }
  }

  return (
    <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4 rounded-2xl border-[1.5px] border-line bg-white p-4">
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-label text-muted">Client</p>
        <p className="font-semibold">{project.client_name || 'No name yet'}</p>
        <p className="truncate text-sm text-muted">{project.client_email}</p>
      </div>
      <div>
        <label htmlFor="owner" className="font-mono text-[10px] uppercase tracking-label text-muted">Looked after by</label>
        <select
          id="owner"
          value={project.owner_id ?? ''}
          onChange={(e) => save(() => apiService.adminUpdateProject(project.id, { owner_id: e.target.value || null }))}
          className="field mt-1 w-auto py-1.5 text-sm"
        >
          <option value="">Nobody yet</option>
          {staff.map((member) => (
            <option key={member.id} value={member.id}>{staffLabel(member, staff)}</option>
          ))}
          {project.owner_id && !staff.some((m) => m.id === project.owner_id) && (
            <option value={project.owner_id}>{project.owner_name || 'Current owner'}</option>
          )}
        </select>
      </div>
      <div className="ml-auto text-right">
        <Button type="button" variant="secondary" size="sm" disabled={invite === 'sending'} onClick={resend}>
          {invite === 'sending' ? 'Sending…' : 'Send sign-in link again'}
        </Button>
        {invite === 'sent' && <p role="status" className="mt-1 text-xs text-ink">Sent to {project.client_email}. It works for 7 days.</p>}
        {invite === 'failed' && inviteError && <p role="alert" className="mt-1 text-xs text-danger">{inviteError}</p>}
        {invite === 'idle' && <p className="mt-1 text-xs text-muted">For a client who lost the email or cannot sign in.</p>}
      </div>
    </div>
  );
}

function StageControls({ project, stage, save }: { project: ProjectDetail; stage: Stage; save: (work: () => Promise<ProjectDetail>) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);
  const [description, setDescription] = useState(stage.description ?? '');
  const ordered = [...project.stages].sort((a, b) => a.position - b.position);
  const index = ordered.findIndex((s) => s.id === stage.id);

  async function rename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    await save(() => apiService.adminUpdateStage(project.id, stage.id, { name: name.trim(), description: description.trim() || null }));
    setEditing(false);
  }

  if (editing) {
    return (
      <form onSubmit={rename} className="grid gap-2 rounded-xl border-[1.5px] border-line bg-paper p-3">
        <div>
          <label htmlFor={`sn-${stage.id}`} className="label">Name</label>
          <input id={`sn-${stage.id}`} value={name} onChange={(e) => setName(e.target.value)} className="field py-1.5 text-sm" maxLength={80} />
        </div>
        <div>
          <label htmlFor={`sd-${stage.id}`} className="label">What happens in this step (the client sees this)</label>
          <textarea id={`sd-${stage.id}`} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="field py-1.5 text-sm" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={!name.trim()}>Save</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </form>
    );
  }

  const icon = 'grid h-8 w-8 place-items-center rounded-full border-[1.5px] border-line bg-white hover:border-ink disabled:opacity-30 disabled:hover:border-line';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label={`Where ${stage.name} is`}
        value={stage.status}
        onChange={(e) => save(() => apiService.adminUpdateStage(project.id, stage.id, { status: e.target.value as StageStatus }))}
        className="field w-auto py-1.5 text-xs"
      >
        {(Object.keys(STAGE_STATUS) as StageStatus[]).map((s) => (
          <option key={s} value={s}>{stageLabel(s, true)}</option>
        ))}
      </select>
      <input
        type="date"
        aria-label={`Date for ${stage.name}`}
        defaultValue={toDateInput(stage.due_date)}
        onBlur={(e) => {
          if (e.target.value !== toDateInput(stage.due_date)) {
            save(() => apiService.adminUpdateStage(project.id, stage.id, { due_date: e.target.value || null }));
          }
        }}
        className="field w-auto py-1.5 text-xs"
      />
      <span className="flex gap-1">
        <button type="button" className={icon} aria-label={`Edit ${stage.name}`} title="Rename or describe" onClick={() => setEditing(true)}>
          <PencilIcon className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={icon} aria-label={`Move ${stage.name} up`} title="Move up" disabled={index <= 0} onClick={() => save(() => apiService.adminMoveStage(project.id, stage.id, 'up'))}>
          <ArrowUpIcon className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={icon} aria-label={`Move ${stage.name} down`} title="Move down" disabled={index >= ordered.length - 1} onClick={() => save(() => apiService.adminMoveStage(project.id, stage.id, 'down'))}>
          <ArrowDownIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={`${icon} hover:border-danger hover:text-danger`}
          aria-label={`Remove ${stage.name}`}
          title="Remove step"
          disabled={ordered.length <= 1}
          onClick={() => {
            if (window.confirm(`Remove the step "${stage.name}"? Updates posted under it are kept.`)) {
              save(() => apiService.adminDeleteStage(project.id, stage.id));
            }
          }}
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}

function AddStage({ project, save }: { project: ProjectDetail; save: Save }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await save(() => apiService.adminAddStage(project.id, name.trim(), description.trim() || null));
      setName('');
      setDescription('');
      setOpen(false);
    } catch {
      // Shown by `save`.
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" className="mt-5" onClick={() => setOpen(true)} disabled={project.stages.length >= 20}>
        Add a step
      </Button>
    );
  }
  return (
    <form onSubmit={submit} className="mt-5 grid gap-2 border-t border-line pt-5">
      <div>
        <label htmlFor="new-step" className="label">New step (added at the end)</label>
        <input id="new-step" value={name} onChange={(e) => setName(e.target.value)} className="field" placeholder="Training" maxLength={80} />
      </div>
      <div>
        <label htmlFor="new-step-desc" className="label">What happens in it (optional)</label>
        <textarea id="new-step-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="field" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !name.trim()}>{busy ? 'Adding…' : 'Add step'}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}

function PostUpdate({ project, save }: { project: ProjectDetail; save: Save }) {
  const current = project.stages.find((s) => s.status === 'in_progress' || s.status === 'waiting_on_client');
  const blank = { kind: 'progress' as UpdateKind, title: '', body: '', stage_id: current?.id ?? '', link_url: '', link_label: '' };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value });
  const note = form.kind === 'note';

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.body.trim()) return;
    setBusy(true);
    try {
      await save(() =>
        apiService.adminPostUpdate(project.id, {
          kind: form.kind,
          title: form.title.trim() || null,
          body: form.body.trim(),
          stage_id: form.stage_id || null,
          link_url: form.link_url.trim() || null,
          link_label: form.link_label.trim() || null,
        }),
      );
      setForm({ ...blank, kind: form.kind, stage_id: form.stage_id });
    } catch {
      // Shown by `save`.
    } finally {
      setBusy(false);
    }
  }

  const kinds: { value: UpdateKind; label: string; hint: string }[] = [
    { value: 'progress', label: 'Progress', hint: 'What we did and what comes next.' },
    { value: 'message', label: 'Message', hint: 'A question or a reply.' },
    { value: 'approval', label: 'Ask for approval', hint: 'The client approves or asks for changes.' },
    { value: 'note', label: 'Team note', hint: 'Only the team can see this.' },
  ];

  return (
    <form onSubmit={submit} className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label="What are you posting?">
        {kinds.map((k) => (
          <button
            key={k.value}
            type="button"
            aria-pressed={form.kind === k.value}
            onClick={() => setForm({ ...form, kind: k.value })}
            className={
              form.kind === k.value
                ? k.value === 'note'
                  ? 'rounded-xl border-[1.5px] border-ink bg-sun-soft p-3 text-left'
                  : 'rounded-xl border-[1.5px] border-cobalt bg-cobalt-soft p-3 text-left'
                : 'rounded-xl border-[1.5px] border-line bg-white p-3 text-left hover:border-ink'
            }
          >
            <span className="block text-sm font-semibold">{k.label}</span>
            <span className="block text-xs text-muted">{k.hint}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="u-title" className="label">Title</label>
          <input id="u-title" value={form.title} onChange={set('title')} className="field" placeholder={form.kind === 'approval' ? 'Homepage design, second version' : 'Optional'} />
        </div>
        <div>
          <label htmlFor="u-stage" className="label">Step</label>
          <select id="u-stage" value={form.stage_id} onChange={set('stage_id')} className="field">
            <option value="">Not about one step</option>
            {project.stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="u-body" className="label">{note ? 'Note' : 'Message'}</label>
        <textarea id="u-body" rows={4} value={form.body} onChange={set('body')} className="field" placeholder={note ? 'Anything the team should know. The client never sees this.' : undefined} />
      </div>
      {!note && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="u-link" className="label">Link (preview, design, document)</label>
            <input id="u-link" type="url" value={form.link_url} onChange={set('link_url')} className="field" placeholder="https://" />
          </div>
          <div>
            <label htmlFor="u-link-label" className="label">Button text for the link</label>
            <input id="u-link-label" value={form.link_label} onChange={set('link_label')} className="field" placeholder="Open the preview" />
          </div>
        </div>
      )}
      <p className="text-xs text-muted">{note ? 'Not emailed. Only people on the team see notes.' : 'The client gets an email about this.'}</p>
      <div>
        <Button type="submit" disabled={busy || !form.body.trim()}>
          {busy ? 'Posting…' : note ? 'Save note' : form.kind === 'approval' ? 'Ask for approval' : 'Post to the client'}
        </Button>
      </div>
    </form>
  );
}

function ProjectDetails({ project, save }: { project: ProjectDetail; save: Save }) {
  const [form, setForm] = useState({
    title: project.title,
    summary: project.summary ?? '',
    status: project.status,
    start_date: toDateInput(project.start_date),
    target_date: toDateInput(project.target_date),
    live_url: project.live_url ?? '',
  });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    await save(() =>
      apiService.adminUpdateProject(project.id, {
        title: form.title.trim() || project.title,
        summary: form.summary.trim() || null,
        status: form.status as ProjectStatus,
        start_date: form.start_date || null,
        target_date: form.target_date || null,
        live_url: form.live_url.trim() || null,
      }),
    ).catch(() => undefined);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <div>
        <label htmlFor="p-title" className="label">Project name</label>
        <input id="p-title" value={form.title} onChange={set('title')} className="field" />
      </div>
      <div>
        <label htmlFor="p-summary" className="label">Short description (the client sees this)</label>
        <textarea id="p-summary" rows={3} value={form.summary} onChange={set('summary')} className="field" />
      </div>
      <div>
        <label htmlFor="p-status" className="label">Where the project is</label>
        <select id="p-status" value={form.status} onChange={set('status')} className="field">
          {(Object.keys(PROJECT_STATUS) as ProjectStatus[]).map((s) => (
            <option key={s} value={s}>{PROJECT_STATUS[s].label}</option>
          ))}
        </select>
        {form.status === 'completed' && project.status !== 'completed' && (
          <p className="mt-1 text-xs text-muted">The client gets an email saying the project is finished.</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="p-start" className="label">Start date</label>
          <input id="p-start" type="date" value={form.start_date} onChange={set('start_date')} className="field" />
        </div>
        <div>
          <label htmlFor="p-target" className="label">Finish by</label>
          <input id="p-target" type="date" value={form.target_date} onChange={set('target_date')} className="field" />
        </div>
      </div>
      <div>
        <label htmlFor="p-live" className="label">Web address once live</label>
        <input id="p-live" type="url" value={form.live_url} onChange={set('live_url')} className="field" placeholder="https://" />
      </div>
      <div>
        <Button type="submit" variant="secondary" size="sm" disabled={busy}>
          {busy ? 'Saving…' : 'Save details'}
        </Button>
      </div>
    </form>
  );
}
