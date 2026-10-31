# FloodWatch

FloodWatch is a community flood response web app built with Next.js, React, Firebase Authentication, Cloud Firestore, and Cloud Storage. It provides flood alerts, a map, shelter and resource listings, and authenticated flood reports.

## Requirements

- Node.js compatible with the Next.js version in `package.json`
- pnpm 12.3.4 (the package manager pinned in `package.json`)
- A Firebase project for account and live data features

## Run locally

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env.local` and fill in the Firebase web app values from Firebase Project Settings.
3. In Firebase Authentication, enable Email/Password. Create a Firestore database and a Storage bucket.
4. Deploy the included Firebase rules with the Firebase CLI: `firebase deploy --only firestore:rules,storage`.
5. Start the development server with `pnpm dev` and open the local URL printed by Next.js.

Without Firebase settings, the app can start but authentication and live Firestore data are unavailable. The Firebase client configuration is public by design; protect data with Firebase Security Rules and configure Firebase's authorized domains. Never put a Firebase Admin service account or other private credential in a `NEXT_PUBLIC_` variable or commit it.

## Firebase project configuration

The client currently expects the Firebase project ID `flood-alert-mru`; `lib/firebase.ts` reports a configuration error if another project ID is supplied. Update that expectation and the seed script's project guard before using a different Firebase project. The Firebase CLI configuration in `firebase.json` deploys `firestore.rules` and `storage.rules`.

The app currently uses simple collection queries and does not require the composite indexes mentioned in earlier setup notes. If future query changes require indexes, commit their definitions in `firestore.indexes.json`.

## Demo data

Demo data is fictional and must not be treated as real emergency information. It is clearly labeled in the interface. To write the demo records into the configured Firebase project, run `pnpm seed:demo`. The script refuses to write unless the target project is `flood-alert-mru`. It uses Application Default Credentials unless `FIREBASE_SERVICE_ACCOUNT_JSON` contains a service account JSON value; run it only from a trusted environment with appropriate permissions. This command writes records to Firestore.

## Accounts and administrator access

Public registration creates citizen accounts only. An administrator must be granted the Firebase Authentication custom claim `{ "role": "administrator" }` by a trusted server or Firebase Admin SDK process. Users must sign out and back in to refresh their token. Never accept an administrator role from browser input. Firestore rules use this custom claim to authorize coordinator actions.

## Data and emergency use

Signed-in users can read alerts, shelters, and resources. Users can create flood reports and read their own reports; administrators can manage coordination data. Uploaded report images are limited by Storage rules to authenticated owners and supported image types under 5 MB. Review the rules before deploying to a production project.

FloodWatch is a software project and is not an emergency service. In immediate danger, contact local emergency services.
