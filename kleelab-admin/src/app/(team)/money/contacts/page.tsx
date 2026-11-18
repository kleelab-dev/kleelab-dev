import type { Metadata } from 'next';
import { MoneyTabs } from '@/components/money/MoneyTabs';
import { ContactList } from '@/components/money/offline/ContactList';
import { PageHeading } from '@/components/money/offline/fields';

export const metadata: Metadata = {
  title: 'Contacts',
};

export default function ContactsPage() {
  return (
    <div>
      <PageHeading title="Contacts">People and companies invoices and receipts are made out to.</PageHeading>
      <MoneyTabs />
      <div className="mt-6">
        <ContactList />
      </div>
    </div>
  );
}
