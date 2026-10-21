import Link from 'next/link';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { buttonClass } from '@/components/ui/Button';
import type { ProjectDetail } from '@/types/api';
import { formatDate, PROJECT_STATUS } from './format';
import { Pill, Progress } from './Pill';

export function ProjectHeader({ project, backHref, backLabel }: { project: ProjectDetail; backHref: string; backLabel: string }) {
  const done = project.stages.filter((s) => s.status === 'done').length;
  const status = PROJECT_STATUS[project.status];
  return (
    <header>
      <Link href={backHref} className="font-mono text-[11px] uppercase tracking-label text-muted no-underline hover:text-ink">
        ← {backLabel}
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-label text-cobalt">{project.reference}</span>
            <Pill tone={status.tone}>{status.label}</Pill>
          </div>
          <h1 className="mt-2 break-words font-display text-3xl font-extrabold tracking-tightest sm:text-5xl">{project.title}</h1>
          {project.summary && <p className="mt-3 leading-7 text-muted">{project.summary}</p>}
        </div>
        {project.live_url && (
          <a href={project.live_url} target="_blank" rel="noopener noreferrer" className={buttonClass('sun')}>
            View live site <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </a>
        )}
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end sm:gap-8">
        <Progress done={done} total={project.stages.length} />
        <Meta label="Started" value={formatDate(project.start_date)} />
        <Meta label="Finish by" value={formatDate(project.target_date)} />
      </div>
    </header>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-label text-muted">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
