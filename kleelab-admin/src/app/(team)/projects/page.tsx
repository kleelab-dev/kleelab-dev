'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import { useCurrentUser } from '@/components/app/AppShell';
import { ProjectCard } from '@/components/project/ProjectCard';
import { Panel } from '@/components/project/Pill';
import { errorText, staffLabel } from '@/components/project/format';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { apiService } from '@/services/api';
import { TemplatePicker } from '@/components/library/TemplatePicker';
import type { Lead, ProjectStatus, ProjectSummary, ProjectTemplate, StaffMember } from '@/types/api';

const FILTERS: { value: ProjectStatus | 'all'; label: string }[] = [
  { value: 'active', label: 'In progress' },
  { value: 'on_hold', label: 'Paused' },
  { value: 'completed', label: 'Finished' },
  { value: 'all', label: 'All' },
];

export default function ProjectsPage() {
  return (
    <Suspense fallback={<p className="font-mono text-[11px] uppercase tracking-label text-muted">Loading…</p>}>
      <Projects />
    </Suspense>
  );
}

function Projects() {
  const user = useCurrentUser();
  const params = useSearchParams();
  const leadId = params.get('lead');
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [lead, setLead] = useState<Lead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ProjectStatus | 'all'>('active');
  const [mine, setMine] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(Boolean(leadId) || params.get('new') === '1');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiService
      .adminProjects()
      .then((list) => active && setProjects(list))
      .catch((reason) => active && setError(errorText(reason)));
    apiService
      .adminStaff()
      .then((list) => active && setStaff(list))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [attempt]);

  useEffect(() => {
    if (!leadId) return;
    let active = true;
    apiService
      .adminLeads()
      .then((list) => active && setLead(list.find((l) => l.id === leadId) ?? null))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [leadId]);

  const needle = query.trim().toLowerCase();
  const shown =
    projects?.filter((p) => {
      if (filter !== 'all' && p.status !== filter) return false;
      if (mine && p.owner_id !== user.id) return false;
      if (!needle) return true;
      return [p.title, p.reference, p.client_name, p.client_email, p.owner_name].some((v) => v?.toLowerCase().includes(needle));
    }) ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="tag">team</p>
          <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tightest sm:text-5xl">Projects</h1>
        </div>
        <Button onClick={() => setCreating((v) => !v)} variant={creating ? 'secondary' : 'primary'}>
          {creating ? 'Close' : 'New project'}
        </Button>
      </div>

      {creating && (
        <CreateProject
          key={lead?.id ?? 'blank'}
          lead={lead}
          staff={staff}
          defaultOwner={user.id}
        />
      )}

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show projects that are">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={clsx('rounded-full px-3.5 py-1.5 text-sm', filter === f.value ? 'bg-ink text-paper' : 'border-[1.5px] border-line bg-white hover:border-ink')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={mine}
          onClick={() => setMine((v) => !v)}
          className={clsx('rounded-full px-3.5 py-1.5 text-sm', mine ? 'bg-cobalt text-white' : 'border-[1.5px] border-line bg-white hover:border-ink')}
        >
          Only mine
        </button>
        <label className="relative ml-auto w-full sm:w-72">
          <span className="sr-only">Search projects</span>
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, client or project number"
            className="field py-2 pl-9 text-sm"
          />
        </label>
      </div>

      <div className="mt-6">
        {error && <ErrorState message={error} onRetry={() => { setError(null); setProjects(null); setAttempt((n) => n + 1); }} />}
        {!error && projects === null && <Skeleton rows={3} />}
        {projects && shown.length === 0 && (
          <EmptyState
            title={needle || mine ? 'No projects match' : projects.length ? 'Nothing in this list' : 'No projects yet'}
            action={!projects.length && !creating ? <Button onClick={() => setCreating(true)}>Start the first one</Button> : undefined}
          >
            {needle || mine ? 'Try another search, or show everyone’s projects.' : projects.length ? 'Pick another filter above.' : 'A project gives a client a page to follow the work, approve it and pay.'}
          </EmptyState>
        )}
        <div className="grid gap-5 md:grid-cols-2">
          {shown.map((project) => (
            <ProjectCard key={project.id} project={project} href={`/projects/${project.id}`} showClient />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Creates the project and, for a new address, the client account and its invite. */
function CreateProject({ lead, staff, defaultOwner }: { lead: Lead | null; staff: StaffMember[]; defaultOwner: string }) {
  const router = useRouter();
  const [form, setForm] = useState({
    client_email: lead?.email ?? '',
    client_name: lead?.name ?? '',
    title: lead?.company ? `${lead.company} project` : '',
    summary: '',
    start_date: '',
    target_date: '',
    owner_id: defaultOwner,
    steps: '',
  });
  const [template, setTemplate] = useState<ProjectTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.client_email.trim() || !form.title.trim()) return setError('Add the client email and a project name.');
    const steps = form.steps.split('\n').map((s) => s.trim()).filter(Boolean);
    if (steps.length > 12) return setError('Start with up to 12 steps. You can add more later.');
    setBusy(true);
    setError(null);
    try {
      const { project } = await apiService.adminCreateProject({
        client_email: form.client_email.trim(),
        client_name: form.client_name.trim() || null,
        title: form.title.trim(),
        summary: form.summary.trim() || null,
        start_date: form.start_date || null,
        target_date: form.target_date || null,
        owner_id: form.owner_id || null,
        stages: steps.length ? steps : null,
        lead_id: lead?.id ?? null,
        template_id: template?.id ?? null,
      });
      router.push(`/projects/${project.id}`);
    } catch (reason) {
      setError(errorText(reason));
      setBusy(false);
    }
  }

  return (
    <Panel tag={lead ? 'from an enquiry' : 'new project'} title="Start a client project" className="mt-8 shadow-block">
      {lead && (
        <p className="mb-4 rounded-xl bg-paper p-3 text-sm text-muted">
          Filled in from the enquiry by <strong className="text-ink">{lead.name || lead.email}</strong>. The enquiry is marked as &ldquo;Became a client&rdquo; when you create the project.
        </p>
      )}
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field id="client_email" label="Client email" type="email" value={form.client_email} onChange={set('client_email')} />
        <Field id="client_name" label="Client name" value={form.client_name} onChange={set('client_name')} />
        <div className="sm:col-span-2">
          <Field id="title" label="Project name" value={form.title} onChange={set('title')} placeholder="Booking website for Ade's Salon" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="summary" className="label">Short description (the client sees this)</label>
          <textarea id="summary" rows={2} value={form.summary} onChange={set('summary')} className="field" />
        </div>
        <Field id="start_date" label="Start date" type="date" value={form.start_date} onChange={set('start_date')} />
        <Field id="target_date" label="Finish by" type="date" value={form.target_date} onChange={set('target_date')} />
        <div>
          <label htmlFor="owner_id" className="label">Looked after by</label>
          <select id="owner_id" value={form.owner_id} onChange={set('owner_id')} className="field">
            <option value="">Nobody yet</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>{staffLabel(member, staff)}</option>
            ))}
            {!staff.some((m) => m.id === defaultOwner) && <option value={defaultOwner}>Me</option>}
          </select>
        </div>
        <TemplatePicker
          id="template_id"
          label="Start from a template"
          value={template?.id}
          emptyLabel="No template: the usual steps and list"
          onPick={setTemplate}
          className="sm:col-span-2"
        />
        <div className="sm:col-span-2">
          <label htmlFor="steps" className="label">{template ? 'Different steps (optional, one per line)' : 'Steps (optional, one per line)'}</label>
          <textarea
            id="steps"
            rows={3}
            value={form.steps}
            onChange={set('steps')}
            className="field"
            placeholder={
              template
                ? `Leave empty for the template's ${template.stages.length}:\n${template.stages.map((s) => s.name).join(', ')}`
                : 'Leave empty for the usual six:\nPlanning, Design, Build, Testing, Going live, Hand-over'
            }
          />
          {template && (
            <p className="mt-1.5 text-xs text-muted">
              The client is asked for:{' '}
              {template.checklist.length ? template.checklist.map((c) => c.title).join(', ') : 'nothing yet (add to the list on the project page)'}.
            </p>
          )}
        </div>
        <p className="text-xs leading-5 text-muted sm:col-span-2">
          If this email has no account yet, we create one and email the client a link to set a password and sign in.
        </p>
        {error && <p role="alert" className="text-sm text-danger sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create project'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<'input'>) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} className="field" {...props} />
    </div>
  );
}
