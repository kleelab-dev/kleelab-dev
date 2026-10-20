/**
 * Legal pages.
 *
 * DRAFT: these describe what this codebase actually does - which data is stored,
 * which third parties are involved, how long things are kept - so they are a
 * genuine starting point rather than boilerplate. They are NOT legal advice and
 * have not been reviewed by a lawyer. Have them checked, and confirm the
 * registered company details, before the site goes live.
 */

export type LegalSection = {
  heading: string;
  paragraphs: string[];
  list?: string[];
};

export type LegalDocument = {
  slug: string;
  title: string;
  summary: string;
  updated: string;
  sections: LegalSection[];
};

const CONTACT = 'hello@kleelab.com';

export const privacy: LegalDocument = {
  slug: 'privacy',
  title: 'Privacy',
  summary: 'What we collect, why we hold it, and how to get rid of it.',
  updated: '2026-10-20',
  sections: [
    {
      heading: 'What we collect',
      paragraphs: ['We collect as little as we can while still running the service.'],
      list: [
        'Account details: your email address, and a name if you give us one. Passwords are stored only as a hash, never in a readable form.',
        'Project records: the updates, messages, approvals and requests on your client dashboard.',
        'Enquiries: anything you send through the contact form or the chat, along with your email address.',
        'Chat messages: what you type into the assistant on our site, used to answer you and not kept once the conversation ends unless you choose to send it to the team as an enquiry.',
        'Technical basics: IP address and browser details, recorded in server logs for security and rate limiting.',
      ],
    },
    {
      heading: 'Why we hold it',
      paragraphs: [
        'To provide the service you asked for: running your client dashboard, delivering your project, and answering when you get in touch.',
        'We also have a legitimate interest in keeping the service working and preventing abuse, which is why we keep short-lived server logs and apply rate limits to sign-in and contact attempts.',
      ],
    },
    {
      heading: 'Who else sees it',
      paragraphs: [
        'We use a small number of processors to run the service. They only handle data on our instructions:',
      ],
      list: [
        'Resend — delivers account and project emails, such as invitations and update notices.',
        'DeepSeek and Google (Gemini) — generate replies in the site chat when it is switched on. Only the conversation is sent, never your account details.',
        'Thravic — counts visits to the public pages so we know which ones are read.',
        'Our hosting providers — run the application and the database.',
      ],
    },
    {
      heading: 'How long we keep it',
      paragraphs: [
        'Account and project data are kept while your account exists, so you can always look back at decisions and approvals. Delete your account and your project records are deleted with it.',
        'Enquiries are kept for two years so we can follow up on a project, then deleted.',
        'Server logs are kept for a short period and then rotated out.',
      ],
    },
    {
      heading: 'Your rights',
      paragraphs: [
        'You can ask for a copy of your data, ask us to correct it, or ask us to delete it. We can send you a machine-readable copy of everything we hold about you.',
        `To make a request, email ${CONTACT}. We answer within one month.`,
      ],
    },
    {
      heading: 'Cookies and local storage',
      paragraphs: [
        'We do not use advertising cookies. We do store a sign-in token in your browser so you do not have to log in on every page, and we count page visits — see the cookies page for detail.',
      ],
    },
  ],
};

export const terms: LegalDocument = {
  slug: 'terms',
  title: 'Terms',
  summary: 'The basics of working with KleeLab and using your client dashboard.',
  updated: '2026-10-20',
  sections: [
    {
      heading: 'Using the service',
      paragraphs: [
        'Client accounts are created by us when a project starts. You are responsible for keeping your password to yourself, and for anything done through your account, including approvals.',
        'Each project also has its own written scope and quote. Where that agreement and these terms disagree, the project agreement wins.',
      ],
    },
    {
      heading: 'What you own',
      paragraphs: [
        'Anything you give us, such as text, images and data, stays yours. We only use it to deliver your project.',
        'Once a project is paid for, the code, designs and accounts we built for it are handed over to you. We may reuse general know-how and open-source tools, but never your content or data.',
      ],
    },
    {
      heading: 'What we will not build or host',
      paragraphs: ['We may decline or stop work, or take down a site we host, if it:'],
      list: [
        'breaks the law, or helps others break it;',
        'impersonates a person or organisation;',
        'distributes malware or runs a phishing page;',
        'infringes someone else’s copyright or trade marks;',
        'harasses or targets a person or group.',
      ],
    },
    {
      heading: 'Care plans',
      paragraphs: [
        'Hosting and maintenance are billed monthly in advance and renew until cancelled. You can cancel with a month of notice, and we help move everything to you or your new provider.',
        'If we change a price, we tell you before it takes effect and you can cancel first.',
      ],
    },
    {
      heading: 'Availability and liability',
      paragraphs: [
        'We work to keep the service running, but we do not promise it will never be unavailable. We are not liable for indirect losses, such as lost profit or lost business.',
        'Nothing here limits liability for death, personal injury, or fraud, where the law does not allow it to be limited.',
      ],
    },
    {
      heading: 'Changes and governing law',
      paragraphs: [
        'If we change these terms we will tell you, and continued use after the change means you accept them.',
        'The governing law is set out in your project agreement.',
      ],
    },
  ],
};

export const cookies: LegalDocument = {
  slug: 'cookies',
  title: 'Cookies',
  summary: 'What we store in your browser, and why it is a very short list.',
  updated: '2026-10-20',
  sections: [
    {
      heading: 'The short version',
      paragraphs: [
        'We do not use advertising cookies, and we do not sell or share what we learn about visitors. A small analytics script counts visits to our public pages.',
      ],
    },
    {
      heading: 'What we do store',
      paragraphs: ['When you sign in to your dashboard, we store two values in your browser:'],
      list: [
        'An access token, which expires after 15 minutes.',
        'A refresh token, which gets a new access token without asking you to log in again.',
      ],
    },
    {
      heading: 'Why it is not a consent banner',
      paragraphs: [
        'These are stored to make sign-in work, not to track you. Rules on consent apply to storage that is not strictly necessary for a service you asked for — a session that keeps you logged in is the example usually given.',
        'We do not share these values with anyone, and we do not use them to build a profile of you.',
      ],
    },
    {
      heading: 'Removing them',
      paragraphs: [
        'Signing out removes both values from your browser. Clearing your browser’s site data does the same thing.',
        'If you remove them while signed in, you will be signed out — nothing else is affected.',
      ],
    },
  ],
};

export const legalDocuments: LegalDocument[] = [privacy, terms, cookies];
