'use client';

import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { buttonClass } from '@/components/ui/Button';
import { openChat } from '@/components/site/EnquiryChat';

/** Opens the site chat, optionally asking a question straight away. */
export function AskButton({
  question,
  children = 'Ask the assistant',
  variant = 'secondary',
  size = 'md',
  className,
}: {
  question?: string;
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'sun' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <button type="button" onClick={() => openChat(question)} className={buttonClass(variant, size, className)}>
      <ChatBubbleLeftRightIcon className="h-4 w-4" aria-hidden />
      {children}
    </button>
  );
}
