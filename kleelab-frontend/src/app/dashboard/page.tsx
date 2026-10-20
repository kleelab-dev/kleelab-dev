'use client';

import { useEffect, useState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { useCurrentUser } from '@/components/app/AppShell';
import { ProjectCard } from '@/components/project/ProjectCard';
import { errorText } from '@/components/project/format';
import { apiService } from '@/services/api';
import type { ProjectSummary } from '@/types/api';

export default function DashboardPage() {
  const user = useCurrentUser();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiService
      .getProjects()
      .then((list) => active && setProjects(list))
      .catch((reason) => active && setError(errorText(reason)));
    return () => {
      active = false;
    };
  }, []);

  const firstName = user.full_name?.split(' ')[0];
  const waiting = projects?.reduce((sum, p) => sum + p.pending_approvals, 0) ?? 0;
  const toPay = projects?.reduce((sum, p) => sum + p.unpaid_invoices, 0) ?? 0;

  return (
    <div>
      <p className="tag">your dashboard</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tightest sm:text-5xl">
        {firstName ? `Hello, ${firstName}.` : 'Hello.'}
      </h1>
      <p className="mt-3 max-w-measure text-muted">
        {waiting > 0 || toPay > 0 ? (
          <>
            <span className="mark">
              {waiting > 0 && `${waiting} thing${waiting === 1 ? ' is' : 's are'} waiting for you to approve.`}
              {waiting > 0 && toPay > 0 && ' '}
              {toPay > 0 && `${toPay} invoice${toPay === 1 ? ' is' : 's are'} ready to pay.`}
            </span>{' '}
            Open the project to see it.
          </>
        ) : (
          'Everything we are building for you, step by step, in one place.'
        )}
      </p>

      <div className="mt-10">
        {error && <p role="alert" className="rounded-xl bg-danger-soft p-4 text-sm text-danger">{error}</p>}
        {!error && projects === null && <p className="font-mono text-[11px] uppercase tracking-label text-muted">Loading projects…</p>}
        {projects && projects.length === 0 && (
          <div className="card max-w-xl p-7">
            <p className="font-display text-2xl font-extrabold">No projects yet</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Once we agree a project together, it appears here with every step, update and decision. Already spoken to us? It will show up as soon as we set it up.
            </p>
            <ButtonLink href="/contact" className="mt-5">
              Start a project
            </ButtonLink>
          </div>
        )}
        {projects && projects.length > 0 && (
          <div className="grid gap-5 md:grid-cols-2">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} href={`/dashboard/projects/${project.id}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
