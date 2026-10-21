'use client';

import { useState } from 'react';
import { CheckIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';

/** An email address with a copy button. */
export function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex items-center gap-2">
      <span className="min-w-0 break-all">{email}</span>
      <button
        type="button"
        onClick={() =>
          navigator.clipboard
            ?.writeText(email)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => undefined)
        }
        className="shrink-0 text-muted hover:text-ink"
        aria-label={copied ? 'Email copied' : 'Copy email'}
      >
        {copied ? <CheckIcon className="h-4 w-4 text-cobalt" aria-hidden /> : <ClipboardDocumentIcon className="h-4 w-4" aria-hidden />}
      </button>
    </span>
  );
}
