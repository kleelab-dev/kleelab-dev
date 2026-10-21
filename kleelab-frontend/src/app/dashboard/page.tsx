'use client';

import Link from 'next/link';
import { ButtonLink } from '@/components/ui/Button';
import { Bone, ErrorState, Loading } from '@/components/ui/States';
import { useCurrentUser } from '@/components/app/AppShell';
import { ProjectCard } from '@/components/project/ProjectCard';
import { errorText } from '@/components/project/format';
import { StaleNote } from '@/components/project/StaleNote';
import { useLiveData } from '@/lib/useLiveData';
import { apiService } from '@/services/api';

export default function DashboardPage() {
  const user = useCurrentUser();
  const { data: projects, error, stale, retry } = useLiveData('projects', apiService.getProjects);

  const firstName = user.full_name?.split(' ')[0];
  const waiting = projects?.reduce((sum, p) => sum + p.pending_approvals, 0) ?? 0;
  const toPay = projects?.reduce((sum, p) => sum + p.unpaid_invoices, 0) ?? 0;

  return (
    <div>
      <p className="tag">your dashboard</p>
      <h1 className="mt-2 break-words font-display text-4xl font-extrabold tracking-tightest sm:text-5xl">
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
      {stale && <StaleNote className="mt-4" />}

      <div className="mt-8 sm:mt-10">
        {error ? (
          <ErrorState
            title="Your projects did not load"
            message={`${errorText(error, 'Something went wrong on our side.')} Your projects are safe; this is only a problem showing them.`}
            onRetry={retry}
          />
        ) : projects === null ? (
          <ProjectsSkeleton />
        ) : projects.length === 0 ? (
          <NoProjects />
        ) : (
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

function ProjectsSkeleton() {
  return (
    <Loading label="Loading your projects" className="grid gap-5 md:grid-cols-2">
      {[0, 1].map((i) => (
        <div key={i} className="card mb-5 p-5 sm:p-6 md:mb-0">
          <div className="flex gap-2">
            <Bone className="h-3 w-16" />
            <Bone className="h-3 w-20" />
          </div>
          <Bone className="mt-4 h-6 w-3/5" />
          <Bone className="mt-4 h-3 w-2/5" />
          <Bone className="mt-5 h-2.5 w-full" />
          <Bone className="mt-4 h-2.5 w-1/2" />
        </div>
      ))}
    </Loading>
  );
}

const NEXT_STEPS = [
  { title: 'Tell us what you need', body: 'A few lines about your business and what the site should do. No forms to fill in beyond that.' },
  { title: 'We agree it together', body: 'We reply within one working day, then send a written plan with dates and a fixed price for you to approve.' },
  { title: 'Follow it here', body: 'Your project appears on this page with every step, update, file and invoice, and anything we need from you.' },
];

function NoProjects() {
  return (
    <section className="card max-w-2xl p-6 sm:p-7" aria-labelledby="no-projects">
      <p className="tag">nothing here yet</p>
      <h2 id="no-projects" className="mt-1 font-display text-2xl font-extrabold">
        No projects yet
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Already agreed a project with us? It shows up here as soon as we set it up. This page checks for it
        by itself, so there is no need to refresh.
      </p>
      <ol className="mt-6 grid gap-4">
        {NEXT_STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-[1.5px] border-ink bg-white font-mono text-xs font-semibold">
              {String(index + 1).padStart(2, '0')}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="font-semibold">{step.title}</p>
              <p className="mt-0.5 text-sm leading-6 text-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <ButtonLink href="/contact" className="min-h-11">
          Start a project
        </ButtonLink>
        <p className="text-sm text-muted">
          Signed in with a different email from the one you gave us?{' '}
          <Link href="/contact" className="font-semibold text-cobalt">
            Let us know
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
