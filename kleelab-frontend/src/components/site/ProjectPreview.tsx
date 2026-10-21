'use client';

import { clsx } from 'clsx';
import { useEffect, useRef, useState } from 'react';

const STEPS = ['Planning', 'Design', 'Build', 'Testing', 'Going live', 'Hand-over'] as const;

/**
 * The little film the hero plays on a loop: the client approves a design,
 * the project moves on a stage and a new update lands.
 */
const SCENES = [
  { current: 2, progress: 42, cursor: false, approved: false, hold: 2600 },
  { current: 2, progress: 42, cursor: true, approved: false, hold: 1100 },
  { current: 2, progress: 42, cursor: true, approved: true, hold: 1500 },
  { current: 3, progress: 58, cursor: false, approved: true, hold: 4200 },
] as const;

const MESSAGES = [
  { body: 'Booking page is on the preview link. Try it on your phone and tell us what feels off.', meta: 'KleeLab team · build week 2' },
  { body: 'Build is finished. Testing starts Monday, and we would love two people from your team to try it.', meta: 'KleeLab team · just now' },
];

function noteFor(index: number, current: number) {
  if (index < current) return 'approved';
  if (index === current) return 'working on it';
  if (index === current + 1) return 'next';
  return 'planned';
}

/**
 * An illustration of the client dashboard for the home page.
 *
 * Labelled as an example in the markup: it is a picture of the product, not a
 * real client's project. It stays on the first frame for people who prefer
 * reduced motion, and pauses while it is off screen.
 */
export function ProjectPreview({ className }: { className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(([entry]) => setRunning(entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setSceneIndex((i) => (i + 1) % SCENES.length), SCENES[sceneIndex].hold);
    return () => window.clearTimeout(timer);
  }, [running, sceneIndex]);

  const scene = SCENES[sceneIndex];
  const message = MESSAGES[scene.current === 3 ? 1 : 0];

  return (
    <figure ref={ref} className={clsx('relative', className)} aria-label="Example of a client dashboard">
      <div className="card relative p-5 shadow-block sm:p-6">
        <div className="dim">your dashboard</div>
        <span key={scene.approved ? 'v3' : 'v2'} className="stamp kl-stamp-in absolute -right-3 -top-4">
          {scene.approved ? 'Version 3 · approved' : 'Version 3 · in review'}
        </span>
        <p className="font-mono text-[11px] uppercase tracking-label text-muted">PRJ-0142 · example project</p>
        <p className="mt-1 font-display text-xl font-extrabold tracking-tight">Clinic booking system</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full border border-ink bg-paper">
          <div
            className="h-full bg-cobalt transition-[width] duration-1000 ease-[cubic-bezier(0.23,1,0.32,1)]"
            style={{ width: `${scene.progress}%` }}
          />
        </div>
        <ol className="mt-5 grid gap-3">
          {STEPS.map((name, index) => {
            const done = index < scene.current;
            const now = index === scene.current;
            return (
              <li key={name} className="flex items-center gap-3 text-sm">
                <span
                  className={clsx(
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full border-[1.5px] border-ink font-mono text-[10px] transition-colors duration-500',
                    done && 'bg-ink text-paper',
                    now && 'bg-sun',
                  )}
                  aria-hidden
                >
                  {done ? '✓' : index + 1}
                </span>
                <span className={clsx('flex-1', now && 'font-semibold')}>{name}</span>
                <span className={clsx('font-mono text-[10.5px]', now ? 'font-semibold text-cobalt' : 'text-muted')}>
                  {noteFor(index, scene.current)}
                </span>
              </li>
            );
          })}
        </ol>
        <div
          className={clsx(
            'mt-5 rounded-xl border-[1.5px] border-dashed p-3 transition-colors duration-500',
            scene.approved ? 'border-ink/40 bg-mint' : 'border-cobalt bg-cobalt-soft',
          )}
        >
          <p className={clsx('font-mono text-[10px] uppercase tracking-label', scene.approved ? 'text-ink' : 'text-cobalt')}>
            {scene.approved ? 'Approved · saved to your log' : 'Please approve'}
          </p>
          <p className="mt-1 text-sm font-medium">Booking pages, round 2</p>
          <div className="mt-2.5 flex gap-2">
            <span className="relative">
              <span
                className={clsx(
                  'inline-block rounded-full px-3 py-1 text-xs font-semibold text-white transition-transform duration-150',
                  scene.approved ? 'bg-ink' : 'bg-cobalt',
                  scene.cursor && scene.approved && sceneIndex === 2 && 'scale-95',
                )}
              >
                {scene.approved ? 'Approved ✓' : 'Approve'}
              </span>
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                className={clsx(
                  'pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 drop-shadow transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]',
                  scene.cursor ? 'translate-x-0 translate-y-0 opacity-100' : 'translate-x-16 translate-y-10 opacity-0',
                )}
              >
                <path d="M4 2l15 9-6.5 1.5L16 20l-3 1.5-3.5-7.5L4 18z" fill="#0e1530" stroke="#fff" strokeWidth="1.5" />
              </svg>
            </span>
            <span className="rounded-full border-[1.5px] border-ink px-3 py-1 text-xs font-semibold">Ask for changes</span>
          </div>
        </div>
      </div>
      <div
        key={message.meta}
        className="kl-pop ml-auto mt-4 max-w-[85%] rounded-2xl rounded-br-md bg-cobalt px-4 py-3 text-sm text-white shadow-block-sm sm:-mr-4"
      >
        {message.body}
        <span className="mt-1 block font-mono text-[10px] text-white/70">{message.meta}</span>
      </div>
    </figure>
  );
}
