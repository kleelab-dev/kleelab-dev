'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { DocumentPlusIcon, PlusIcon } from '@heroicons/react/24/outline';
import { buttonClass } from '@/components/ui/Button';

const TABS = [
  { href: '/money', label: 'Invoices' },
  { href: '/money/receipts', label: 'Receipts' },
  { href: '/money/contacts', label: 'Contacts' },
];

/** The sub-nav under the Money heading, with the two things staff do most often. */
export function MoneyTabs({ contactId }: { contactId?: string }) {
  const pathname = usePathname();
  const query = contactId ? `?contact=${encodeURIComponent(contactId)}` : '';
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b-[1.5px] border-line pb-3">
      <nav aria-label="Money sections" className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const current = tab.href === '/money' ? pathname === '/money' || pathname.startsWith('/money/offline') : pathname.startsWith(tab.href);
          const style = clsx(
            'inline-flex min-h-10 items-center rounded-full px-3.5 py-1.5 text-sm no-underline',
            current ? 'bg-ink text-paper' : 'border-[1.5px] border-line bg-white text-ink hover:border-ink',
          );
          // The page you are on is marked, not linked to itself.
          if (pathname === tab.href) {
            return (
              <span key={tab.href} aria-current="page" className={style}>
                {tab.label}
              </span>
            );
          }
          return (
            <Link key={tab.href} href={tab.href} aria-current={current ? 'page' : undefined} className={style}>
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-wrap gap-2">
        {pathname !== '/money/receipts/new' && (
          <Link href={`/money/receipts/new${query}`} className={buttonClass('secondary', 'sm', 'min-h-10')}>
            <DocumentPlusIcon className="h-4 w-4" aria-hidden />
            Record receipt
          </Link>
        )}
        {pathname !== '/money/offline/new' && (
          <Link href={`/money/offline/new${query}`} className={buttonClass('primary', 'sm', 'min-h-10')}>
            <PlusIcon className="h-4 w-4" aria-hidden />
            New invoice
          </Link>
        )}
      </div>
    </div>
  );
}
