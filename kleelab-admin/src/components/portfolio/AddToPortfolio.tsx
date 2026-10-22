'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { errorText } from '@/components/project/format';
import { ApiError, apiService } from '@/services/api';

/** Start a portfolio draft from a finished project: its name, client and live address. */
export function AddToPortfolio({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<React.ReactNode>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const item = await apiService.adminPortfolioFromProject(projectId);
      router.push(`/portfolio/${item.id}`);
    } catch (reason) {
      setError(
        reason instanceof ApiError && reason.status === 409 ? (
          <>Already in the <Link href="/portfolio" className="font-semibold text-cobalt underline">portfolio</Link>.</>
        ) : (
          errorText(reason)
        ),
      );
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={add} disabled={busy}
        title="Starts a draft with this project's name, client and live address. Nothing shows on the site until you add screenshots, tick the client's agreement and publish.">
        {busy ? 'Starting…' : 'Add to portfolio'}
      </Button>
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </>
  );
}
