import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import type { Handover } from '@/types/api';
import { formatDate } from './format';

/** Everything the client needs to look after what we built: where it lives, how to change it, who to call. */
export function HandoverPack({ handover }: { handover: Handover }) {
  return (
    <div className="grid gap-5">
      {handover.notes && <p className="whitespace-pre-line text-sm leading-6">{handover.notes}</p>}
      {handover.items.length > 0 && (
        <dl className="grid gap-2">
          {handover.items.map((item, index) => (
            <div key={`${item.label}-${index}`} className="grid gap-0.5 rounded-xl border-[1.5px] border-line bg-paper p-3 sm:grid-cols-[minmax(0,180px)_1fr] sm:gap-4">
              <dt className="font-mono text-[11px] uppercase tracking-label text-muted sm:pt-0.5">{item.label}</dt>
              <dd className="min-w-0 break-words text-sm">
                {item.value && <span className="whitespace-pre-line">{item.value}</span>}
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className={`${item.value ? 'mt-1 ' : ''}flex w-fit max-w-full items-center gap-1 break-all font-semibold text-cobalt underline-offset-4 hover:underline`}
                  >
                    {item.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 shrink-0" />
                  </a>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="text-xs text-muted">
        Last updated {formatDate(handover.updated_at)}. Something unclear? Send us a message.
      </p>
    </div>
  );
}
