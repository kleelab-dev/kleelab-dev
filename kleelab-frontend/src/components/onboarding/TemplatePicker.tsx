'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { documentFromTemplate } from '@/lib/templates';
import { createSiteWithUniqueSubdomain } from '@/lib/sites';
import { apiService } from '@/services/api';
import type { Template } from '@/types/api';

/**
 * The template path.
 *
 * Kept, and kept honest, as the alternative to the AI: it is what the AI falls
 * back to when it is switched off or out of allowance, and it is the fastest way
 * to a site for someone who already knows what they want. It no longer owns the
 * page — it is the second option, not the product.
 */
export function TemplatePicker({
  defaultName = '',
  onError,
}: {
  defaultName?: string;
  onError?: (message: string) => void;
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [name, setName] = useState(defaultName);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deliberately does not set the loading flag: called from the mount effect,
  // that would be a synchronous setState inside an effect. The initial state is
  // already `true`, and the retry button sets it before calling this.
  const load = useCallback(async () => {
    try {
      const data = await apiService.getTemplates();
      setTemplates(data);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  // State is updated inside the promise callbacks rather than by calling `load`
  // directly: the lint rule that forbids a synchronous setState in an effect
  // cannot see past the first await, and the `active` guard also stops a slow
  // response from writing into a component that has unmounted.
  useEffect(() => {
    let active = true;

    apiService
      .getTemplates()
      .then((data) => {
        if (!active) return;
        setTemplates(data);
        setError(null);
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function create() {
    if (!selected) return;
    setCreating(true);
    setError(null);
    try {
      const siteName = name.trim() || selected.title;
      const site = await createSiteWithUniqueSubdomain(siteName);
      await apiService.createPage(site.id, {
        title: 'Home',
        slug: '/',
        content_json: { document: documentFromTemplate(selected) },
      });
      router.replace(`/builder/${site.id}/edit`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Unable to create your site';
      setError(message);
      onError?.(message);
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-live="polite">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-40 animate-pulse rounded-xl border border-line bg-canvas" />
        ))}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-paper p-8 text-center">
        <p className="font-serif text-xl">No templates loaded</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
          {error || 'The template library is empty right now.'}
        </p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper"
        >
          <ArrowPathIcon className="h-4 w-4" /> Try again
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => {
          const active = selected?.id === template.id;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => {
                setSelected(template);
                if (!name.trim()) setName(template.title);
              }}
              aria-pressed={active}
              className={`overflow-hidden rounded-xl border bg-paper text-left transition-colors ${
                active ? 'border-ink' : 'border-line hover:border-line-strong'
              }`}
            >
              <div className="aspect-[1.4] bg-canvas">
                {template.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- template thumbnails are arbitrary remote URLs, so next/image would need images.remotePatterns widened to every host
                  <img
                    src={template.thumbnail_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center font-mono text-xs uppercase tracking-label text-muted">
                    {template.category}
                  </div>
                )}
              </div>
              <div className="p-4">
                <p className="font-mono text-[10px] uppercase tracking-label text-muted">
                  {template.category}
                </p>
                <h3 className="mt-1.5 font-serif text-xl leading-snug">{template.title}</h3>
                <p className="mt-1.5 text-xs leading-5 text-muted">{template.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="template-site-name" className="mb-1.5 block text-xs font-bold">
            Name your site
          </label>
          <input
            id="template-site-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Maya Carter Studio"
            className="w-full rounded-lg border border-line-strong bg-white px-4 py-2.5 text-sm outline-none focus:border-ink"
          />
        </div>
        <button
          type="button"
          onClick={() => void create()}
          disabled={!selected || !name.trim() || creating}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper disabled:opacity-40"
        >
          {creating ? 'Creating…' : 'Create site'}
        </button>
      </div>

      {!selected && (
        <p className="mt-2 text-xs text-muted">Choose a template to continue.</p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-danger-line bg-danger-surface px-3 py-2 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
