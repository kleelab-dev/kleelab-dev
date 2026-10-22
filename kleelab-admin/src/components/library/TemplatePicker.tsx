'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiService } from '@/services/api';
import type { ProjectTemplate } from '@/types/api';

/** A menu of the team's project templates. Shows nothing until there is one. */
export function TemplatePicker({
  id,
  label = 'Template',
  value,
  emptyLabel,
  onPick,
  className,
}: {
  id: string;
  label?: string;
  /** The picked template's id, for a menu that keeps its choice. Leave out for a one-off "use" menu. */
  value?: string;
  emptyLabel: string;
  onPick: (template: ProjectTemplate | null) => void;
  className?: string;
}) {
  const [templates, setTemplates] = useState<ProjectTemplate[] | null>(null);

  useEffect(() => {
    let active = true;
    apiService
      .adminTemplates()
      .then((list) => active && setTemplates(list))
      .catch(() => active && setTemplates([]));
    return () => {
      active = false;
    };
  }, []);

  if (templates && templates.length === 0) {
    return (
      <p className={className ? `${className} text-xs text-muted` : 'text-xs text-muted'}>
        No project templates yet. <Link href="/library" className="font-semibold text-cobalt">Make one</Link> for the kinds of site you build often.
      </p>
    );
  }

  return (
    <div className={className}>
      <label htmlFor={id} className="label">{label}</label>
      <select
        id={id}
        value={value ?? ''}
        disabled={!templates}
        onChange={(e) => onPick(templates?.find((t) => t.id === e.target.value) ?? null)}
        className="field"
      >
        <option value="">{templates ? emptyLabel : 'Loading templates…'}</option>
        {templates?.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} · {t.stages.length} steps{t.checklist.length ? `, ${t.checklist.length} to ask for` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
