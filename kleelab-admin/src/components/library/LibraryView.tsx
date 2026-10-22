'use client';

import { useEffect, useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/project/Pill';
import { errorText, timeAgo } from '@/components/project/format';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States';
import { apiService } from '@/services/api';
import type { ProjectTemplate, ProjectTemplateInput, SavedReply } from '@/types/api';

// What a new template starts with: the usual six, ready to change.
const STARTER: ProjectTemplateInput = {
  name: '',
  description: null,
  stages: ['Planning', 'Design', 'Build', 'Testing', 'Going live', 'Hand-over'].map((name) => ({ name, description: null })),
  checklist: [],
};

function swap<T>(list: T[], a: number, b: number): T[] {
  const next = [...list];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

/** The team's shared library: project templates and saved replies. */
export function LibraryView() {
  return (
    <div>
      <p className="tag">team</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tightest sm:text-5xl">Library</h1>
      <p className="mt-3 max-w-2xl text-muted">
        Shared by the whole team. Templates give a new project or proposal the right steps and the right things to ask
        the client for. Saved replies are words you send often, ready to drop into an email or a project update.
      </p>
      <div className="mt-10 grid gap-10">
        <Templates />
        <Replies />
      </div>
    </div>
  );
}

// --- Project templates ---------------------------------------------------------------

function Templates() {
  const [templates, setTemplates] = useState<ProjectTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProjectTemplate | 'new' | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiService
      .adminTemplates()
      .then((list) => active && setTemplates(list))
      .catch((reason) => active && setError(errorText(reason)));
    return () => {
      active = false;
    };
  }, [attempt]);

  function saved(template: ProjectTemplate) {
    setTemplates((list) => {
      const rest = (list ?? []).filter((t) => t.id !== template.id);
      return [...rest, template].sort((a, b) => a.name.localeCompare(b.name));
    });
    setEditing(null);
  }

  async function remove(template: ProjectTemplate) {
    if (!window.confirm(`Remove the ${template.name} template? Projects already started from it keep their steps.`)) return;
    try {
      await apiService.adminDeleteTemplate(template.id);
      setTemplates((list) => list?.filter((t) => t.id !== template.id) ?? null);
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  return (
    <section id="templates" aria-labelledby="templates-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="tag">for new projects</p>
          <h2 id="templates-title" className="mt-1 font-display text-2xl font-extrabold tracking-tight">Project templates</h2>
        </div>
        {editing === null && (
          <Button type="button" onClick={() => setEditing('new')} disabled={!templates}>
            <PlusIcon className="h-4 w-4" aria-hidden /> New template
          </Button>
        )}
      </div>

      <div className="mt-5 grid gap-4">
        {error && <ErrorState message={error} onRetry={() => { setError(null); setTemplates(null); setAttempt((n) => n + 1); }} />}
        {!error && templates === null && <Skeleton rows={2} />}
        {editing === 'new' && <TemplateForm initial={STARTER} onSaved={saved} onCancel={() => setEditing(null)} />}
        {templates && templates.length === 0 && editing === null && (
          <EmptyState title="No templates yet">
            Make one for each kind of site you build often (a shop, a booking site, a company site), or save the steps of
            a project you are happy with from its page.
          </EmptyState>
        )}
        {templates && templates.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            {templates.map((template) =>
              editing !== 'new' && editing?.id === template.id ? (
                <div key={template.id} className="lg:col-span-2">
                  <TemplateForm initial={template} templateId={template.id} onSaved={saved} onCancel={() => setEditing(null)} />
                </div>
              ) : (
                <article key={template.id} className="card flex flex-col p-5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold">{template.name}</h3>
                      {template.description && <p className="mt-0.5 text-sm text-muted">{template.description}</p>}
                    </div>
                    <span className="flex shrink-0 gap-1">
                      <IconButton label={`Edit ${template.name}`} onClick={() => setEditing(template)}>
                        <PencilIcon className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton label={`Remove ${template.name}`} danger onClick={() => remove(template)}>
                        <TrashIcon className="h-3.5 w-3.5" />
                      </IconButton>
                    </span>
                  </div>
                  <ol className="mt-4 flex flex-wrap gap-1.5">
                    {template.stages.map((stage, index) => (
                      <li key={index} className="rounded-md border border-line bg-paper px-2 py-0.5 text-xs" title={stage.description ?? undefined}>
                        <span className="font-mono text-muted">{index + 1}</span> {stage.name}
                      </li>
                    ))}
                  </ol>
                  <p className="mt-3 text-xs text-muted">
                    {template.checklist.length
                      ? `Asks for: ${template.checklist.map((c) => c.title).join(', ')}`
                      : 'Asks the client for nothing up front.'}
                  </p>
                  <p className="mt-auto pt-3 font-mono text-[10px] uppercase tracking-label text-muted">
                    Changed {timeAgo(template.updated_at)}{template.created_by_name ? ` · made by ${template.created_by_name}` : ''}
                  </p>
                </article>
              ),
            )}
          </div>
        )}
      </div>
    </section>
  );
}

type Row = { a: string; b: string };

function TemplateForm({
  initial,
  templateId,
  onSaved,
  onCancel,
}: {
  initial: ProjectTemplateInput;
  templateId?: string;
  onSaved: (template: ProjectTemplate) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? '');
  const [stages, setStages] = useState<Row[]>(initial.stages.map((s) => ({ a: s.name, b: s.description ?? '' })));
  const [checklist, setChecklist] = useState<Row[]>(initial.checklist.map((c) => ({ a: c.title, b: c.description ?? '' })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: ProjectTemplateInput = {
      name: name.trim(),
      description: description.trim() || null,
      stages: stages.filter((s) => s.a.trim()).map((s) => ({ name: s.a.trim(), description: s.b.trim() || null })),
      checklist: checklist.filter((c) => c.a.trim()).map((c) => ({ title: c.a.trim(), description: c.b.trim() || null })),
    };
    if (input.name.length < 2) return setError('Give the template a name.');
    if (!input.stages.length) return setError('A template needs at least one step.');
    setBusy(true);
    setError(null);
    try {
      onSaved(templateId ? await apiService.adminUpdateTemplate(templateId, input) : await apiService.adminCreateTemplate(input));
    } catch (reason) {
      setError(errorText(reason));
      setBusy(false);
    }
  }

  return (
    <Panel tag={templateId ? 'editing' : 'new template'} title={templateId ? `Edit ${initial.name}` : 'New project template'} className="shadow-block">
      <form onSubmit={submit} className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="t-name" className="label">Name</label>
            <input id="t-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="field" placeholder="Online shop" />
          </div>
          <div>
            <label htmlFor="t-desc" className="label">When to use it (the team sees this)</label>
            <input id="t-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} className="field" placeholder="Anyone selling products with Paystack" />
          </div>
        </div>
        <RowList
          legend="Steps (the client sees these)"
          rows={stages}
          max={12}
          nameLabel="Step name"
          detailLabel="What happens in this step"
          addLabel="Add a step"
          onChange={setStages}
        />
        <RowList
          legend="What we ask the client for"
          rows={checklist}
          max={30}
          nameLabel="What you need"
          detailLabel="More detail for the client"
          addLabel="Add something to ask for"
          onChange={setChecklist}
        />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : templateId ? 'Save changes' : 'Save template'}</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </Panel>
  );
}

function RowList({
  legend,
  rows,
  max,
  nameLabel,
  detailLabel,
  addLabel,
  onChange,
}: {
  legend: string;
  rows: Row[];
  max: number;
  nameLabel: string;
  detailLabel: string;
  addLabel: string;
  onChange: (rows: Row[]) => void;
}) {
  const id = legend.replace(/\W+/g, '-').toLowerCase();
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className="grid gap-2">
        {rows.map((row, index) => (
          <div key={index} className="flex gap-2 rounded-xl border-[1.5px] border-line p-2.5">
            <span className="mt-2 w-5 shrink-0 font-mono text-xs text-muted">{index + 1}</span>
            <div className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <label htmlFor={`${id}-a-${index}`} className="sr-only">{nameLabel}</label>
              <input id={`${id}-a-${index}`} value={row.a} maxLength={nameLabel === 'Step name' ? 80 : 150} placeholder={nameLabel} className="field py-1.5 text-sm font-semibold"
                onChange={(e) => onChange(rows.map((r, i) => (i === index ? { ...r, a: e.target.value } : r)))} />
              <label htmlFor={`${id}-b-${index}`} className="sr-only">{detailLabel}</label>
              <input id={`${id}-b-${index}`} value={row.b} maxLength={1000} placeholder={`${detailLabel} (optional)`} className="field py-1.5 text-sm"
                onChange={(e) => onChange(rows.map((r, i) => (i === index ? { ...r, b: e.target.value } : r)))} />
            </div>
            <div className="flex shrink-0 items-start gap-1 pt-1 text-muted">
              <button type="button" aria-label={`Move ${row.a || 'this row'} up`} disabled={index === 0} className="hover:text-ink disabled:opacity-30"
                onClick={() => onChange(swap(rows, index, index - 1))}>
                <ArrowUpIcon className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" aria-label={`Move ${row.a || 'this row'} down`} disabled={index === rows.length - 1} className="hover:text-ink disabled:opacity-30"
                onClick={() => onChange(swap(rows, index, index + 1))}>
                <ArrowDownIcon className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" aria-label={`Remove ${row.a || 'this row'}`} className="hover:text-danger"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}>
                <TrashIcon className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-xs text-muted">Nothing yet.</p>}
        {rows.length < max && (
          <button type="button" onClick={() => onChange([...rows, { a: '', b: '' }])} className="flex w-fit items-center gap-1 text-sm font-semibold text-cobalt">
            <PlusIcon className="h-4 w-4" aria-hidden /> {addLabel}
          </button>
        )}
      </div>
    </fieldset>
  );
}

// --- Saved replies -----------------------------------------------------------------------

function Replies() {
  const [replies, setReplies] = useState<SavedReply[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SavedReply | 'new' | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiService
      .adminSavedReplies()
      .then((list) => active && setReplies(list))
      .catch((reason) => active && setError(errorText(reason)));
    return () => {
      active = false;
    };
  }, [attempt]);

  function saved(reply: SavedReply) {
    setReplies((list) => [...(list ?? []).filter((r) => r.id !== reply.id), reply].sort((a, b) => a.title.localeCompare(b.title)));
    setEditing(null);
  }

  async function remove(reply: SavedReply) {
    if (!window.confirm(`Remove the saved reply "${reply.title}"?`)) return;
    try {
      await apiService.adminDeleteSavedReply(reply.id);
      setReplies((list) => list?.filter((r) => r.id !== reply.id) ?? null);
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  return (
    <section id="replies" aria-labelledby="replies-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="tag">for emails and updates</p>
          <h2 id="replies-title" className="mt-1 font-display text-2xl font-extrabold tracking-tight">Saved replies</h2>
        </div>
        {editing === null && (
          <Button type="button" onClick={() => setEditing('new')} disabled={!replies}>
            <PlusIcon className="h-4 w-4" aria-hidden /> New saved reply
          </Button>
        )}
      </div>
      <p className="mt-2 text-sm text-muted">
        Write <code className="rounded bg-paper px-1 font-mono text-xs">{'{first_name}'}</code>,{' '}
        <code className="rounded bg-paper px-1 font-mono text-xs">{'{project}'}</code> or{' '}
        <code className="rounded bg-paper px-1 font-mono text-xs">{'{my_name}'}</code> and they are filled in when you use the reply.
      </p>

      <div className="mt-5 grid gap-4">
        {error && <ErrorState message={error} onRetry={() => { setError(null); setReplies(null); setAttempt((n) => n + 1); }} />}
        {!error && replies === null && <Skeleton rows={2} />}
        {editing === 'new' && <ReplyForm onSaved={saved} onCancel={() => setEditing(null)} />}
        {replies && replies.length === 0 && editing === null && (
          <EmptyState title="No saved replies yet">
            Good first ones: thanks for your enquiry, a call reminder, &ldquo;here is your proposal&rdquo;, and a design ready for review.
          </EmptyState>
        )}
        {replies && replies.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            {replies.map((reply) =>
              editing !== 'new' && editing?.id === reply.id ? (
                <div key={reply.id} className="lg:col-span-2">
                  <ReplyForm reply={reply} onSaved={saved} onCancel={() => setEditing(null)} />
                </div>
              ) : (
                <article key={reply.id} className="card flex flex-col p-5">
                  <div className="flex items-start gap-3">
                    <h3 className="min-w-0 flex-1 font-semibold">{reply.title}</h3>
                    <span className="flex shrink-0 gap-1">
                      <IconButton label={`Edit ${reply.title}`} onClick={() => setEditing(reply)}>
                        <PencilIcon className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton label={`Remove ${reply.title}`} danger onClick={() => remove(reply)}>
                        <TrashIcon className="h-3.5 w-3.5" />
                      </IconButton>
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-5 whitespace-pre-line text-sm leading-6 text-ink-soft">{reply.body}</p>
                  <p className="mt-auto pt-3 font-mono text-[10px] uppercase tracking-label text-muted">
                    Changed {timeAgo(reply.updated_at)}{reply.created_by_name ? ` · made by ${reply.created_by_name}` : ''}
                  </p>
                </article>
              ),
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function ReplyForm({ reply, onSaved, onCancel }: { reply?: SavedReply; onSaved: (reply: SavedReply) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(reply?.title ?? '');
  const [body, setBody] = useState(reply?.body ?? 'Hi {first_name},\n\n\n\n{my_name}');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (title.trim().length < 2) return setError('Give it a short name, so it is easy to find in the list.');
    if (!body.trim()) return setError('Write the reply.');
    setBusy(true);
    setError(null);
    try {
      onSaved(reply ? await apiService.adminUpdateSavedReply(reply.id, title.trim(), body) : await apiService.adminCreateSavedReply(title.trim(), body));
    } catch (reason) {
      setError(errorText(reason));
      setBusy(false);
    }
  }

  return (
    <Panel tag={reply ? 'editing' : 'new saved reply'} title={reply ? `Edit ${reply.title}` : 'New saved reply'} className="shadow-block">
      <form onSubmit={submit} className="grid gap-4">
        <div>
          <label htmlFor="r-title" className="label">Name in the list</label>
          <input id="r-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} className="field" placeholder="Thanks for your enquiry" />
        </div>
        <div>
          <label htmlFor="r-body" className="label">The words</label>
          <textarea id="r-body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} className="field leading-6" />
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : reply ? 'Save changes' : 'Save reply'}</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </Panel>
  );
}

function IconButton({ label, danger, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid h-7 w-7 place-items-center rounded-full border-[1.5px] border-line bg-white hover:border-ink ${danger ? 'hover:border-danger hover:text-danger' : ''}`}
    >
      {children}
    </button>
  );
}
