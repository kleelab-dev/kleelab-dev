'use client';

import { useState } from 'react';
import { useCurrentUser, useUpdateUser } from '@/components/app/AppShell';
import { errorText } from '@/components/project/format';
import { apiService } from '@/services/api';

/** Turn optional emails on or off. The team inbox and Slack still get everything. */
export function EmailChoices() {
  const user = useCurrentUser();
  const updateUser = useUpdateUser();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const topics = user.email_topics ?? [];

  async function toggle(key: string, on: boolean) {
    setBusy(key);
    setError(null);
    try {
      const next = await apiService.setEmailPrefs({ [key]: on });
      updateUser({ ...user, email_topics: next.email_topics });
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-3">
      <ul className="grid gap-2">
        {topics.map((topic) => (
          <li key={topic.key}>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border-[1.5px] border-line bg-white p-3 hover:border-ink">
              <input
                type="checkbox"
                checked={topic.on}
                disabled={busy !== null}
                onChange={(e) => toggle(topic.key, e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-cobalt"
              />
              <span>
                <span className="block text-sm font-semibold">{topic.label}</span>
                <span className="block text-xs text-muted">{topic.description}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <p className="text-xs text-muted">
        These cover projects you look after. The team inbox and Slack still get everything, and sign-in and security emails always come.
      </p>
    </div>
  );
}
