// The Privacy Policy and Terms, written once and used twice: rendered in
// Settings > About, and emitted as standalone pages under public/ so there is a
// real URL to hand to App Store Connect and to link from anywhere else.
//
// Everything here describes what the app actually does today. If the app starts
// collecting something new, or drops a provider, this file has to change with
// it - it is a promise, not decoration.
//
// NOT LEGAL ADVICE. A lawyer should read this before launch, and two clauses
// still need facts only the owner has: the legal entity behind "Zambop", and
// the governing law / jurisdiction for disputes.

export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalDoc {
  slug: 'privacy' | 'terms';
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}

export const SUPPORT_EMAIL = 'support@tracklylab.com';
const UPDATED = '28 July 2026';

export const PRIVACY_POLICY: LegalDoc = {
  slug: 'privacy',
  title: 'Privacy Policy',
  updated: UPDATED,
  intro:
    'Trackly is built device-first. If you use it without an account, what you record never leaves your phone. This policy explains exactly what is stored, where, and who can see it.',
  sections: [
    {
      heading: 'The short version',
      body: [
        'Your transactions stay on your device unless you choose to sign in.',
        'We never sell your data, and we never use your financial information for advertising.',
        'Our analytics record how the app is used - never what you spend, on what, or with which card.',
        'You can export everything, erase everything, or delete your account entirely, from inside the app.',
      ],
    },
    {
      heading: 'Using Trackly without an account',
      body: [
        'In guest mode, your transactions, categories, sources and settings are saved in your browser or app storage on your own device. They are not sent to us and we cannot read them.',
        'Because that data lives only on your device, clearing your browser storage, deleting the app, or losing the device will lose it. Settings > Export data saves a full copy you keep yourself.',
      ],
    },
    {
      heading: 'When you sign in',
      body: [
        'Signing in with Google shares your name, email address and profile photo with us, so we can identify your account and show your picture in Settings. We never receive your Google password.',
        'Once signed in, your Trackly data is stored in our database as a single record belonging to your account, so it can follow you across devices. That record is protected by row-level security, meaning it can only be read by your signed-in account.',
      ],
    },
    {
      heading: 'What we collect',
      body: [
        'Account details: your name, email address and profile photo from the sign-in provider you choose.',
        'Your Trackly data, but only if you are signed in: transactions, categories, sources, recurring schedules, budget and preferences.',
        'Usage analytics: which screens are opened and which features are used, plus general technical information such as device type, browser and approximate region derived from your IP address. These events never include transaction descriptions, amounts, categories, sources or your budget.',
        'Support messages: if you write to us from Settings > Support, we receive your message and the email address you give us so we can reply.',
      ],
    },
    {
      heading: 'Exchange rates',
      body: [
        'To convert foreign-currency transactions, the app fetches a table of daily exchange rates from an external rates provider. That request asks only for the rates themselves - it contains no personal data and no information about your transactions.',
      ],
    },
    {
      heading: 'Who we share it with',
      body: [
        'We do not sell your data or share it for advertising. We use a small number of service providers who process data on our behalf:',
        'Supabase - hosting, sign-in and the database that holds your synced data.',
        'PostHog - product analytics, as described above.',
        'Resend - delivering the support messages you send us.',
        'We may also disclose information if we are legally required to.',
      ],
    },
    {
      heading: 'How long we keep it',
      body: [
        'Your synced data is kept until you delete it. Settings > Erase all data clears your records while keeping your account; Settings > Delete account removes the account and its data.',
        'After deletion, copies may persist briefly in routine backups before being overwritten.',
      ],
    },
    {
      heading: 'Your rights',
      body: [
        'You can export a full copy of your data at any time from Settings > Export data, correct any entry by editing it, and delete your data or your whole account from Settings.',
        'Depending on where you live you may have additional rights over your personal data, including asking us for a copy or objecting to certain processing. Write to us and we will help.',
      ],
    },
    {
      heading: 'Children',
      body: ['Trackly is not intended for children, and we do not knowingly collect their data.'],
    },
    {
      heading: 'Changes to this policy',
      body: [
        'If this policy changes we will update the date at the top, and note anything significant inside the app.',
      ],
    },
    {
      heading: 'Contact',
      body: [
        `Questions about privacy, or about your data: ${SUPPORT_EMAIL}. You can also write to us from Settings > Support.`,
      ],
    },
  ],
};

export const TERMS_OF_SERVICE: LegalDoc = {
  slug: 'terms',
  title: 'Terms of Service',
  updated: UPDATED,
  intro: 'These terms cover your use of Trackly. Using the app means you accept them.',
  sections: [
    {
      heading: 'What Trackly is',
      body: [
        'Trackly is a personal expense tracker. It records what you tell it and shows you summaries, charts and trends based on that.',
        'It is an informational tool, not financial, tax, investment or legal advice. Every figure it shows depends on what you enter, and converted amounts rely on third-party exchange rates that are indicative rather than exact. Please do not treat its output as a substitute for your bank statements or professional advice.',
      ],
    },
    {
      heading: 'Your account',
      body: [
        'You may use Trackly without an account. If you create one, keep access to it secure - anyone who can use your sign-in can see your data.',
        'You are responsible for what happens under your account.',
      ],
    },
    {
      heading: 'Your data belongs to you',
      body: [
        'The transactions and other content you put into Trackly are yours. You give us permission only to store, process and sync them so the app can work for you.',
        'You can take a full copy with you at any time from Settings > Export data.',
      ],
    },
    {
      heading: 'Acceptable use',
      body: [
        'Please do not use Trackly for anything unlawful, attempt to break, overload or gain unauthorised access to it, try to reach other people\'s data, or resell the service as your own.',
      ],
    },
    {
      heading: 'Availability',
      body: [
        'Trackly is provided as it is and as available. It is offered free of charge, without any guarantee of uptime, and features may change or be withdrawn as it develops.',
        'We back up your synced data, but you should keep your own exports of anything you cannot afford to lose.',
      ],
    },
    {
      heading: 'Liability',
      body: [
        'To the fullest extent the law allows, we are not liable for indirect or consequential loss, for lost data, or for decisions you make based on what the app shows you.',
        'Nothing in these terms limits any liability that cannot lawfully be limited.',
      ],
    },
    {
      heading: 'Ending your use',
      body: [
        'You can stop using Trackly at any time, and delete your account and data from Settings.',
        'We may suspend or end access if these terms are seriously or repeatedly broken.',
      ],
    },
    {
      heading: 'Changes to these terms',
      body: [
        'We may update these terms as the app changes. The date at the top shows the current version, and continuing to use Trackly after a change means you accept it.',
      ],
    },
    {
      heading: 'Contact',
      body: [`Questions about these terms: ${SUPPORT_EMAIL}.`],
    },
  ],
};

export const LEGAL_DOCS: LegalDoc[] = [PRIVACY_POLICY, TERMS_OF_SERVICE];
