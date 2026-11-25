# Online Application for Leave

DHSUD Region 10. Staff file CSC Form No. 6 (Application for Leave, Revised 2020) in one online form, print it ready to sign, and follow it through the three signatories. A signatory who is away from the office can e-sign their section from the app.

> **Small-scale build.** This version runs on Google Apps Script and Google Sheets inside the office Google Workspace, so it needs no server. It is meant for a pilot with one or a few divisions. Move it to an office server (bare-metal) or a VPS before it is used office-wide or joined with other modules. See [Scale limits and server migration](#scale-limits-and-server-migration).

Proposal: Online Application for Leave, Project Proposal (Claude Doc shared with the project).

## How it works

1. **Sign in.** Only addresses HR registers can get in. Staff with govmail who are signed in to their dhsud.gov.ph Google account go straight in. Staff without govmail and COS staff enter their registered email and get a 6-digit code (see [Why sign-in codes](#why-sign-in-codes)).
2. **File.** The applicant clicks File leave. Items 1 to 5 (office, name, date of filing, position, salary) come from their record. They fill in 6.A type of leave, 6.B details for that type, 6.C inclusive dates on a calendar (working days are counted without weekends and holidays), and 6.D commutation.
3. **Print.** The app numbers the application (LA-2026-0001), and the applicant prints the filled-in form (or downloads a PDF) and signs it.
4. **Sign.** The paper goes to the Division Chief, the Supervising Administrative Officer, then the Regional Director, or the OIC Regional Director on the dates they are assigned. Each signs by hand and clicks "I signed the paper form" so the applicant can follow it, or clicks **E-sign** when away. HR can record a hand signature for a signatory who doesn't use the app.
5. **File (HR).** When all three have acted, HR files the signed copy and marks it filed. The final status (approved or disapproved) follows the 7.C/7.D decision, and a PDF copy is kept in a restricted Drive folder.

Every action is written to an append-only audit log.

### E-signature
- Each signatory saves a specimen signature once (draw it or upload a scan) under **My signature**. It is kept in a private Drive folder only the app account can read.
- E-sign places the signature image, name, date and time and the application number on their section. If any section is e-signed, the printout adds an **Electronic Signature Record** page for HR to attach to the paper form.
- Only the signatory named for that section can sign it, never the applicant. The OIC signs only on assigned dates. A signer can withdraw their own signature until the next signatory acts.
- E-signing is **off** by default. The administrator switches it on in Setup → Settings once management confirms in writing that e-signatures are accepted for leave forms.

### Who can see what
- Applicants see only their own applications. Signatories see what is waiting for them and what they signed. HR and the administrator see everything.
- Emails never name the type of leave or an illness. Emails to personal addresses carry only the status and a link.

## Settings HR still has to confirm

These are open items from the proposal, so they are settings rather than fixed in code (Setup → Settings, administrator only):

| Setting | Default | Notes |
|---|---|---|
| Signatory order and section 7 mapping | Division Chief → 7.B, Supervising AO → 7.A, RD/OIC → 7.C/7.D | Any order; each signatory and section used once. Applies to applications filed after the change. |
| Leave credits (7.A) | Kept on the HR leave card | Or "Balances kept in this app": HR enters VL/SL balances under Setup → Leave credits and they fill in 7.A for the AO to check (no automatic deduction). |
| Pilot divisions | All divisions | Tick the pilot division to limit filing to it. |
| E-signature | Off | See above. |
| Form header | DHSUD, Regional Office X, Cagayan de Oro City | Printed on the form. |
| HR notice email | Everyone with the HR role | Who hears "ready for filing". |

HR also sets each division's chief (Setup → Divisions), the holiday list (Setup → Holidays), and the Regional Director names the OIC (Setup → OIC Regional Director).

## Why sign-in codes

The app runs as the owner account (so staff never need access to the spreadsheet). Google tells such an app the email of a user only when the user is in the same Workspace domain. So dhsud.gov.ph accounts are recognised automatically, and Google hides personal Gmail addresses. For staff without govmail and COS staff, the app emails a 6-digit code to the address HR registered (10 minutes, 5 tries, 5 codes an hour). A session lasts up to 6 hours. Codes to personal addresses count against the 1,500 external recipients a day.

## Project layout

```
backend/src/
  api/endpoints.ts     api_* functions: parse input → caller → service
  services/            business rules: applications (workflow), auth, admin, form6 (the printout), notify, audit
  platform/            the only Google-specific code: gas.ts (Sheets, Drive, Mail, Cache, Lock), memory.ts (tests, dev)
  repository/          sheet and column definitions
  main.ts              doGet, setupDatabase
shared/                types, validation (zod), dates, leave types, privacy notice; used by both sides
frontend/src/          React app, built into one HTML file served by Apps Script
scripts/               build, assemble and deploy with clasp
```

This follows the platform-layer pattern of the DHSUD Schedule Handler: services use only the interfaces in `backend/src/platform/types.ts`.

## Develop

```
npm install
npm run dev          # http://localhost:5174/?as=staff  (also cos, chief, ao, rd, oic, hr, owner, stranger)
npm test             # workflow, sign-in, privacy and date tests
npm run typecheck
node scripts/build-sample.mjs dist/samples   # sample printouts
```

`npm run dev` runs the real backend code in the browser on sample data. Nothing is saved.

## Deploy

Prerequisites: Node.js 22, and `@google/clasp` signed in as the owner account (for example region10@dhsud.gov.ph) with the Apps Script API enabled at https://script.google.com/home/usersettings.

First time, for each environment (staging first):

1. `cd deploy/staging && clasp create-script --type standalone --title "leave-application-staging" --rootDir build`, then commit the `.clasp.json` (it only holds the script ID).
2. From the repo root: `npm run deploy:staging`. This builds, pushes and creates a deployment, and prints its URL.
3. Open the Apps Script project, choose `setupDatabase` and click Run. Approve the permissions. It creates the spreadsheet, two private Drive folders, and registers the owner as administrator and HR.
4. Open the web app URL as the owner, then register HR staff, divisions and their chiefs, signatories, holidays and the pilot division's staff.

The deployment runs as the owner (`executeAs: USER_DEPLOYING`) and is open without a Google sign-in (`access: ANYONE_ANONYMOUS`), so COS staff whose personal email is not a Google account can reach it, and nobody hits Google's account picker. The app itself admits only registered addresses: govmail users Google recognises sign in directly, everyone else with an emailed code.

Production: `CONFIRM_PRODUCTION=yes npm run deploy:production`. It is refused until the DPO approves the privacy notice and `approved` is set to `true` in `shared/privacy.ts`.

### Check on staging before the pilot
- A registered govmail account goes straight in, an unregistered govmail account is refused, and a personal Gmail account gets in only with a code.
- The downloaded PDF looks right. Apps Script's HTML-to-PDF converter supports less CSS than a browser; **Print form** uses the browser and is the reference. Adjust `backend/src/services/form6.ts` if the PDF differs.
- Emails arrive, including to a personal address.

## Scale limits and server migration

Approximate Google limits for Workspace accounts (Google can change them): 6 minutes per run, about 30 runs at once per user, about 1,500 email recipients a day (2,000 within dhsud.gov.ph), 10 million cells per spreadsheet, and no uptime guarantee for Apps Script. Archive applications yearly.

**Move to a server** when the system serves the whole regional office, is joined with document routing or other modules, needs a link to payroll or HRIS, or the limits above cause failures. Migration keeps `services/` and `shared/` as they are and replaces `platform/gas.ts` with a database, file storage, SMTP mail and an HTML-to-PDF renderer; the Sheets and Drive records are imported. Google sign-in can stay.
