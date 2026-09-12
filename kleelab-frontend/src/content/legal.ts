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
  updated: '2025-11-04',
  sections: [
    {
      heading: 'What we collect',
      paragraphs: ['We collect as little as we can while still running the service.'],
      list: [
        'Account details: your email address, and a name if you give us one. Passwords are stored only as a hash, never in a readable form.',
        'Site content: the pages, text and images you create in the builder.',
        'Enquiries: anything you send through the contact form, along with your email address.',
        'Technical basics: IP address and browser details, recorded in server logs for security and rate limiting.',
      ],
    },
    {
      heading: 'Why we hold it',
      paragraphs: [
        'To provide the service you asked for: running your account, storing and publishing your site, and answering when you get in touch.',
        'We also have a legitimate interest in keeping the service working and preventing abuse, which is why we keep short-lived server logs and apply rate limits to sign-in and contact attempts.',
      ],
    },
    {
      heading: 'Who else sees it',
      paragraphs: [
        'We use a small number of processors to run the service. They only handle data on our instructions:',
      ],
      list: [
        'Cloudinary — stores images you upload to your sites.',
        'Resend — delivers account emails such as verification links.',
        'Our hosting providers — run the application and the database.',
      ],
    },
    {
      heading: 'How long we keep it',
      paragraphs: [
        'Account and site data are kept while your account exists. Delete your account and your sites, pages and uploaded files are deleted with it.',
        'Enquiries are kept for two years so we can follow up on a project, then deleted.',
        'Server logs are kept for a short period and then rotated out.',
      ],
    },
    {
      heading: 'Your rights',
      paragraphs: [
        'You can ask for a copy of your data, ask us to correct it, or ask us to delete it. The account section includes an export that produces a machine-readable copy of everything we hold about you.',
        `To make a request, email ${CONTACT}. We answer within one month.`,
      ],
    },
    {
      heading: 'Cookies and local storage',
      paragraphs: [
        'We do not use advertising cookies. We do store a sign-in token in your browser so you do not have to log in on every page — see the cookies page for detail.',
      ],
    },
  ],
};

export const terms: LegalDocument = {
  slug: 'terms',
  title: 'Terms',
  summary: 'The agreement between you and KleeLab when you use the service.',
  updated: '2025-11-04',
  sections: [
    {
      heading: 'Using the service',
      paragraphs: [
        'You need an account to publish a site. You are responsible for keeping your password to yourself, and for anything done through your account.',
        'You must be at least 16 to hold an account.',
      ],
    },
    {
      heading: 'Your content stays yours',
      paragraphs: [
        'You own everything you put into the builder — your text, your images, your design. We claim no ownership over it.',
        'You give us permission to store it and to serve it to visitors when you publish. That permission ends when you delete the content or your account.',
      ],
    },
    {
      heading: 'What you must not publish',
      paragraphs: ['Some things we will not host, and we may remove a site without notice if it:'],
      list: [
        'breaks the law, or helps others break it;',
        'impersonates a person or organisation;',
        'distributes malware or runs a phishing page;',
        'infringes someone else’s copyright or trade marks;',
        'harasses or targets a person or group.',
      ],
    },
    {
      heading: 'Paid plans',
      paragraphs: [
        'Paid features are billed in advance and renew until cancelled. You can cancel at any time and keep access until the end of the period you have paid for.',
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
        'These terms are governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction.',
      ],
    },
  ],
};

export const cookies: LegalDocument = {
  slug: 'cookies',
  title: 'Cookies',
  summary: 'What we store in your browser, and why it is a very short list.',
  updated: '2025-11-04',
  sections: [
    {
      heading: 'The short version',
      paragraphs: [
        'We do not use advertising or tracking cookies. No third-party analytics script follows you around this site.',
      ],
    },
    {
      heading: 'What we do store',
      paragraphs: ['When you sign in, the builder stores two values in your browser:'],
      list: [
        'An access token, which expires after 15 minutes.',
        'A refresh token, which lets the builder get a new access token without asking you to log in again.',
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
