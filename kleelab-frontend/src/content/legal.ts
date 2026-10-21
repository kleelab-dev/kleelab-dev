/**
 * Legal pages.
 *
 * DRAFT: these describe what this codebase actually does - which data is stored,
 * which third parties are involved, how long things are kept - so they are a
 * genuine starting point rather than boilerplate. They are NOT legal advice and
 * have not been reviewed by a lawyer. Have them checked, ideally by a Nigerian
 * lawyer familiar with the NDPA, before the site goes live.
 *
 * Anything written [[like this]] is a placeholder the owner must fill in. The
 * legal pages highlight them so none can slip through to launch unnoticed.
 *
 * Keep these in step with the code. In particular: the processors list, the
 * browser storage list (Thravic sets _tf_vid and _tf_sid), and the retention
 * promises, which need the enquiry clean-up and invoice retention to be real.
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

const CONTACT = '[[hello@kleelab.com — confirm this inbox is live]]';
const COMPANY = '[[REGISTERED COMPANY NAME]]';
const UPDATED = '2026-10-21';

export const privacy: LegalDocument = {
  slug: 'privacy',
  title: 'Privacy',
  summary: 'What we collect, why we hold it, who else sees it, and how to get rid of it.',
  updated: UPDATED,
  sections: [
    {
      heading: 'Who we are',
      paragraphs: [
        `KleeLab is run by ${COMPANY}, registered in Nigeria with the Corporate Affairs Commission under number [[RC NUMBER]], at [[REGISTERED ADDRESS]]. We decide how your personal data is used, which makes us the data controller under the Nigeria Data Protection Act 2023.`,
        `For anything about your data, email ${CONTACT}.`,
      ],
    },
    {
      heading: 'What we collect',
      paragraphs: ['We collect as little as we can while still running the service.'],
      list: [
        'Account details: your email address, and a name if you give us one. Passwords are stored only as a hash, never in a readable form.',
        'Project records: the updates, messages, approvals, requests and files on your client dashboard.',
        'Invoices and payments: what we billed you and whether it was paid. Card details go straight to our payment provider; we never see or store them.',
        'Enquiries: anything you send through the contact form, along with your email address.',
        'Chat messages: what you type into the assistant on our site. They are used to answer you and are not saved once the conversation ends, unless you choose to send them to the team as an enquiry.',
        'Visit counts: which public pages are viewed, using a random visitor ID stored in your browser (see the cookies page).',
        'Technical basics: IP address and browser details, recorded in server logs for security and to limit abuse.',
      ],
    },
    {
      heading: 'Why we hold it',
      paragraphs: [
        'To deliver the service you asked for: running your client dashboard, delivering your project, billing for it, and answering when you get in touch. This is necessary for our contract with you, or for steps you asked us to take before one.',
        'To meet legal duties, such as keeping invoice and payment records for tax purposes.',
        'Because we have a legitimate interest in keeping the service working and secure, which is why we keep short-lived server logs, collect error reports and limit repeated sign-in and contact attempts.',
        '[[DECISION ON ANALYTICS: if visit counting moves behind a consent prompt, add: “To count page visits, with your consent, which you can withdraw at any time.”]]',
      ],
    },
    {
      heading: 'Who else sees it',
      paragraphs: [
        'We use a small number of service providers to run KleeLab. They handle data only on our instructions and only for the job listed:',
      ],
      list: [
        'Resend and Mailtrap: deliver account and project emails, such as invitations and update notices.',
        'Paystack: takes card payments for invoices. Paystack handles your card details directly under its own privacy policy.',
        'Cloudinary: stores files and images shared on your project dashboard.',
        'DeepSeek and Google (Gemini): generate replies in the site chat when it is switched on. Only the conversation is sent, never your account details. Please do not put private or sensitive information in the chat.',
        'Thravic: counts visits to our public pages.',
        'Sentry: collects error reports so we can fix problems. Reports describe what went wrong and may include technical details of the request.',
        'Slack: tells our team about new enquiries and project activity. These notices can include your email address and the subject of your message.',
        '[[HOSTING PROVIDERS, e.g. Render, Vercel, Neon — list the ones actually used]]: run the application and the database.',
      ],
    },
    {
      heading: 'Data stored outside Nigeria',
      paragraphs: [
        'Several of these providers store or process data outside Nigeria, including in the United States, the European Union and, for the DeepSeek chat, China. Where we send personal data abroad, we rely on the safeguards the Nigeria Data Protection Act allows, such as the provider’s contractual commitments on protecting data.',
        '[[CONFIRM WITH YOUR LAWYER which transfer basis applies to each provider]]',
      ],
    },
    {
      heading: 'How long we keep it',
      paragraphs: [
        'Account and project data are kept while your account exists, so you can always look back at decisions and approvals.',
        'If you delete your account, we delete your account and project records, except invoices and payment records. The law requires us to keep those for [[six years — confirm with your accountant]], after which we delete them.',
        'Enquiries that do not become a project are deleted after two years.',
        'Server logs and error reports are kept for [[30 days — confirm your providers’ settings]] and then deleted.',
      ],
    },
    {
      heading: 'Your rights',
      paragraphs: [
        'You can ask for a copy of your data, ask us to correct it, ask us to delete it, or object to how we use it. We can send you a machine-readable copy of everything we hold about you. Where we rely on your consent, you can withdraw it at any time.',
        `To make a request, email ${CONTACT}. We reply within 30 days.`,
        'If you are not happy with how we handle your data, please tell us first so we can put it right. You also have the right to complain to the Nigeria Data Protection Commission (ndpc.gov.ng).',
      ],
    },
    {
      heading: 'Children',
      paragraphs: ['KleeLab is a service for organisations and businesses. It is not meant for children, and we do not knowingly collect data from anyone under 18.'],
    },
    {
      heading: 'Cookies and browser storage',
      paragraphs: [
        'We do not use advertising cookies. We store sign-in details in your browser so you stay logged in, and our analytics stores a random visitor ID. The cookies page lists every item and what it is for.',
      ],
    },
    {
      heading: 'Changes to this policy',
      paragraphs: [
        'If we make a meaningful change, we update the date at the top of this page and tell clients by email before it takes effect.',
      ],
    },
  ],
};

export const terms: LegalDocument = {
  slug: 'terms',
  title: 'Terms',
  summary: 'The basics of working with KleeLab and using your client dashboard.',
  updated: UPDATED,
  sections: [
    {
      heading: 'Who we are',
      paragraphs: [
        `KleeLab is run by ${COMPANY} (RC [[RC NUMBER]]), [[REGISTERED ADDRESS]]. In these terms, “we” and “us” means ${COMPANY}, and “you” means the person or organisation using our site or working with us.`,
      ],
    },
    {
      heading: 'Using the service',
      paragraphs: [
        'Client accounts are created by us when a project starts. Please keep your password to yourself. Approvals given through your account count as decisions from you, so if you think someone else has access, tell us straight away and we will lock the account and help you secure it.',
        'Each project also has its own written scope and quote. Where that agreement and these terms disagree, the project agreement wins.',
      ],
    },
    {
      heading: 'Payment',
      paragraphs: [
        'Prices, payment stages and due dates are set out in your project quote. [[PAYMENT TERMS: e.g. deposit before work starts, invoices due within 14 days — set these]]',
        'Card payments are processed by Paystack. If a payment is late, we may pause work until it is settled, after telling you first.',
      ],
    },
    {
      heading: 'What you own',
      paragraphs: [
        'Anything you give us, such as text, images and data, stays yours. We only use it to deliver your project.',
        'Once a project is paid for in full, the code, designs and accounts we built for it are handed over to you. We may reuse general know-how and open-source tools, but never your content or data.',
        'You confirm that you have the right to use anything you send us, and that it does not infringe anyone else’s rights.',
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
        'If we change a price, we tell you at least 30 days before it takes effect, so you can cancel first if you prefer.',
      ],
    },
    {
      heading: 'The site chat',
      paragraphs: [
        'The assistant on our site gives general answers about how we work. It can make mistakes, and nothing it says is a quote, a promise or professional advice. Prices, dates and scope are only agreed in writing by our team.',
      ],
    },
    {
      heading: 'Availability and liability',
      paragraphs: [
        'We work to keep the service running, but we cannot promise it will never be unavailable. We are not liable for indirect losses, such as lost profit or lost business.',
        'Unless your project agreement says otherwise, our total liability for a project is limited to the amount you paid us for it. [[CONFIRM THIS CAP WITH YOUR LAWYER]]',
        'Nothing here limits liability for death, personal injury, fraud, or anything else the law does not allow us to limit.',
      ],
    },
    {
      heading: 'Changes to these terms',
      paragraphs: [
        'If we change these terms, we update the date at the top of this page and email clients at least 30 days before the change takes effect. Changes never apply to work already agreed in a signed project agreement.',
      ],
    },
    {
      heading: 'Governing law',
      paragraphs: [
        'These terms are governed by the laws of the Federal Republic of Nigeria, and the courts of [[STATE, e.g. Lagos State]] have jurisdiction, unless your project agreement says otherwise.',
        `Questions about these terms: ${CONTACT}.`,
      ],
    },
  ],
};

export const cookies: LegalDocument = {
  slug: 'cookies',
  title: 'Cookies',
  summary: 'Everything we store in your browser, and why. It is a short list.',
  updated: UPDATED,
  sections: [
    {
      heading: 'The short version',
      paragraphs: [
        'We do not use advertising cookies, and we do not sell or share what we learn about visitors. We store sign-in details when you log in, and our analytics stores a random ID to count visits.',
      ],
    },
    {
      heading: 'Needed to sign in',
      paragraphs: ['When you sign in to your dashboard, we store two values in your browser’s local storage:'],
      list: [
        'An access token, which expires after 15 minutes.',
        'A refresh token, which gets a new access token without asking you to log in again. It expires after 30 days, or when you sign out.',
      ],
    },
    {
      heading: 'Counting visits',
      paragraphs: ['Our analytics provider, Thravic, stores two values on every visit to our public pages:'],
      list: [
        '_tf_vid: a random visitor ID that stays in your browser’s local storage until you clear it, so a return visit is not counted as a new visitor.',
        '_tf_sid: a random session ID, kept only until you close the tab.',
      ],
    },
    {
      heading: 'Your choice',
      paragraphs: [
        'The sign-in values are strictly necessary: without them you could not stay logged in, so they do not need your consent.',
        '[[DECISION ON ANALYTICS — pick one and replace this paragraph: (a) “Visit counting only starts if you agree to it in the banner, and you can change your mind at any time.” (b) Switch Thravic to a mode that stores nothing, and delete the “Counting visits” section. (c) Remove Thravic, and delete the “Counting visits” section.]]',
      ],
    },
    {
      heading: 'Removing them',
      paragraphs: [
        'Signing out removes the sign-in values. Clearing your browser’s site data for this website removes everything listed here.',
        'If you clear them while signed in, you will be signed out. Nothing else is affected.',
      ],
    },
  ],
};

export const legalDocuments: LegalDocument[] = [privacy, terms, cookies];
