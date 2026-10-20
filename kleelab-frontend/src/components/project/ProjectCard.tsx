import Link from 'next/link';
import type { ProjectSummary } from '@/types/api';
import { formatDate, PROJECT_STATUS } from './format';
import { Pill, Progress } from './Pill';

/** One project in a list. `href` decides whether it opens the client or team view. */
export function ProjectCard({ project, href, showClient = false }: { project: ProjectSummary; href: string; showClient?: boolean }) {
  const status = PROJECT_STATUS[project.status];
  return (
    <Link href={href} className="card group block p-5 no-underline transition-shadow hover:shadow-block sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-label text-cobalt">{project.reference}</span>
        <Pill tone={status.tone}>{status.label}</Pill>
        {project.pending_approvals > 0 && (
          <Pill tone="bg-sun text-ink">
            {project.pending_approvals} to approve
          </Pill>
        )}
        {project.open_requests > 0 && <Pill tone="bg-cobalt-soft text-cobalt-dark">{showClient ? `${project.open_requests} to answer` : `${project.open_requests} request${project.open_requests === 1 ? '' : 's'} with us`}</Pill>}
        {project.unpaid_invoices > 0 && <Pill tone="bg-sun-soft text-ink">{project.unpaid_invoices} to pay</Pill>}
        {showClient && project.awaiting_reply && <Pill tone="bg-danger-soft text-danger">Reply needed</Pill>}
      </div>
      <h2 className="mt-3 font-display text-2xl font-extrabold tracking-tight group-hover:text-cobalt">{project.title}</h2>
      {showClient && (project.client_name || project.client_email) && (
        <p className="mt-1 text-sm text-muted">
          {project.client_name ? `${project.client_name} · ` : ''}
          {project.client_email}
          {project.owner_name ? ` · Looked after by ${project.owner_name}` : ''}
        </p>
      )}
      <p className="mt-3 text-sm text-ink-soft">
        {project.status === 'completed' ? 'Finished.' : project.current_stage ? (
          <>
            Now on: <strong className="font-semibold">{project.current_stage}</strong>
          </>
        ) : (
          'Getting started.'
        )}
      </p>
      <div className="mt-4">
        <Progress done={project.stages_done} total={project.stages_total} />
      </div>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-label text-muted">
        Finish by {formatDate(project.target_date)} · Last change {formatDate(project.updated_at)}
      </p>
    </Link>
  );
}
