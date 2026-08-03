// The Privacy Policy and Terms, written once and used twice: rendered in
// Settings > About, and emitted as standalone pages under public/ so there is a
// real URL to hand to App Store Connect and to link from anywhere else.
//
// Everything here describes what the app actually does today. If the app starts
// collecting something new, or drops a provider, this file has to change with
// it - it is a promise, not decoration.
//
// NOT LEGAL ADVICE. A lawyer should read this before launch.
//
// OWNER_COUNTRY drives the governing-law clause in the Terms. It must be the
// owner's actual country of residence - change it there and the clause follows.
//
// TracklyLab is run by one person, not a company. Naming him matters: data
// protection law requires whoever decides how personal data is used to be
// identifiable, and "Zambop" is a nickname, not a legal identity.

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
export const OWNER_NAME = 'Pietro Zamboni';
const UPDATED = '3 August 2026';
// Country of residence of the owner. Sets the governing law in the Terms.
const OWNER_COUNTRY = 'Italy';

export const PRIVACY_POLICY: LegalDoc = {
  slug: 'privacy',
  title: 'Privacy Policy',
  updated: UPDATED,
  intro:
    'TracklyLab is built device-first. If you use it without an account, what you record never leaves your phone. This policy explains exactly what is stored, where, and who can see it.',
  sections: [
    {
      heading: 'Who is responsible',
      body: [
        `TracklyLab is made and run by ${OWNER_NAME}, an individual developer, who also goes by Zambop. It is not operated by a company.`,
        `For anything about your data, or about this policy, write to ${SUPPORT_EMAIL}.`,
      ],
    },
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
      heading: 'Using TracklyLab without an account',
      body: [
        'In guest mode, your transactions, categories, sources and settings are saved in your browser or app storage on your own device. They are not sent to us and we cannot read them.',
        'Because that data lives only on your device, clearing your browser storage, deleting the app, or losing the device will lose it. Settings > Export data saves a full copy you keep yourself.',
      ],
    },
    {
      heading: 'When you sign in',
      body: [
        'You can sign in with Google, or with a code sent to your email address. Signing in with Google shares your name, email address and profile photo with us, so we can identify your account and show your picture in Settings. We never receive your Google password.',
        'If you sign in by email, we store the address you give us and send a one-time code to it. We do not use it to write to you about anything else.',
        'Once signed in, your TracklyLab data is stored in our database as a single record belonging to your account, so it can follow you across devices.',
        `Row-level security means no other TracklyLab user can read that record. It is not, however, encrypted in a way that hides it from us: as the person who runs the service, ${OWNER_NAME} holds the administrative keys to the database, because operating, backing up and supporting it requires them. Your transactions are not read, and are never used for anything other than making the app work for you.`,
        'If you would rather nothing of yours ever left your device, use TracklyLab without signing in - guest mode keeps everything local, where we genuinely cannot reach it.',
      ],
    },
    {
      heading: 'What we collect',
      body: [
        'Account details: your email address, plus your name and profile photo if you sign in with a provider that gives us them.',
        'Your TracklyLab data, but only if you are signed in: transactions, categories, sources, recurring schedules, budget and preferences.',
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
        'Resend - delivering the sign-in codes we email you, and the support messages you send us.',
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
      body: ['TracklyLab is not intended for children, and we do not knowingly collect their data.'],
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
  intro: 'These terms cover your use of TracklyLab. Using the app means you accept them.',
  sections: [
    {
      heading: 'Who you are agreeing with',
      body: [
        `These terms are an agreement between you and ${OWNER_NAME}, the individual who makes and runs TracklyLab. There is no company behind it.`,
      ],
    },
    {
      heading: 'What TracklyLab is',
      body: [
        'TracklyLab is a personal expense tracker. It records what you tell it and shows you summaries, charts and trends based on that.',
        'It is an informational tool, not financial, tax, investment or legal advice. Every figure it shows depends on what you enter, and converted amounts rely on third-party exchange rates that are indicative rather than exact. Please do not treat its output as a substitute for your bank statements or professional advice.',
      ],
    },
    {
      heading: 'Your account',
      body: [
        'You may use TracklyLab without an account. If you create one, keep access to it secure - anyone who can use your sign-in can see your data.',
        'You are responsible for what happens under your account.',
      ],
    },
    {
      heading: 'Your data belongs to you',
      body: [
        'The transactions and other content you put into TracklyLab are yours. You give us permission only to store, process and sync them so the app can work for you.',
        'You can take a full copy with you at any time from Settings > Export data.',
      ],
    },
    {
      heading: 'Acceptable use',
      body: [
        'Please do not use TracklyLab for anything unlawful, attempt to break, overload or gain unauthorised access to it, try to reach other people\'s data, or resell the service as your own.',
      ],
    },
    {
      heading: 'Availability',
      body: [
        'TracklyLab is provided as it is and as available. It is offered free of charge, without any guarantee of uptime, and features may change or be withdrawn as it develops.',
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
        'You can stop using TracklyLab at any time, and delete your account and data from Settings.',
        'We may suspend or end access if these terms are seriously or repeatedly broken.',
      ],
    },
    {
      heading: 'Governing law',
      body: [
        `These terms are governed by the laws of ${OWNER_COUNTRY}, and any dispute will be dealt with by the courts of ${OWNER_COUNTRY}.`,
        'If you use TracklyLab as a consumer, this does not take away the protection of the mandatory consumer law of the country you live in, and you can still bring a claim before your local courts.',
      ],
    },
    {
      heading: 'Changes to these terms',
      body: [
        'We may update these terms as the app changes. The date at the top shows the current version, and continuing to use TracklyLab after a change means you accept it.',
      ],
    },
    {
      heading: 'Contact',
      body: [`Questions about these terms: ${SUPPORT_EMAIL}.`],
    },
  ],
};

export const LEGAL_DOCS: LegalDoc[] = [PRIVACY_POLICY, TERMS_OF_SERVICE];
