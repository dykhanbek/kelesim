# Kelisim — Project Documentation (MVP)

## 1. Product name and short description

**Kelisim** (Kazakh *келісім*, "agreement") is a web service that guides a small business's foreign-trade deal from the contract to the closing of currency control. The entrepreneur fills in **one deal form**. Kelisim then:

1. **checks the risks**: sanctions screening of the supplier, whether a contract registration number (UCN) is required, and the repatriation term;
2. **generates a bilingual document package** (contract, specification, invoice, packing list) in RU/CN or RU/EN, downloadable as DOCX or PDF;
3. **tracks the obligations** that follow from the deal (UCN, payment, delivery, repatriation) in a calendar, with in-app and Telegram reminders.

Slogan: *"A contract with your Chinese supplier in 15 minutes: no lawyer, no fines."*

## 2. Target audience and problem statement

### Target audience
| Persona | Who | What they need from Kelisim |
|---|---|---|
| **Aigerim** (primary) | 31, Almaty, sole proprietor selling children's clothing on Kaspi/Wildberries, buys in Guangzhou 1–2 times a month, doesn't speak Chinese | A correct RU/CN contract fast, so the bank lets the payment through; to know whether a UCN is needed |
| **Yerzhan** (secondary) | 42, Astana, director of a wholesale LLP importing from Turkey and China, large contracts, was fined for late repatriation | Control of all deadlines; screening new suppliers before paying |
| **Dinara** (B2B) | 36, Karaganda, outsourced accountant with 8 importing clients | All clients' deadlines in one window (future B2B plan) |

### Problem
- Small importers rarely employ a lawyer; an external one charges 50–150k KZT per contract and takes days.
- Free templates from seller chats ignore Kazakhstan's currency-control rules and are usually in one language, while Chinese suppliers ask for a contract in Chinese.
- Most losses happen **after** signing: a missing UCN (contracts above 50,000 USD must be registered with the bank before performance), a late repatriation, or a bank refusing a payment because the counterparty is sanctioned.

## 3. Implemented features

### Core features (the three modules from the brief)
1. **Document generator.** A 4-step deal wizard (type & languages → counterparty → goods & amount → terms) builds a package of 4 documents (3 for services): contract with 13 clauses (subject, price, Incoterms 2020 delivery, payment, quality, acceptance, currency control with repatriation term and UCN clause, liability, force majeure, sanctions clause, disputes, language, signatures), specification, commercial invoice and packing list. Three contract types (supply, agency, services), two language pairs (RU/CN, RU/EN). The preview has a RU / CN(EN) / bilingual switcher, a clause panel (Incoterms, payment, dates, penalty, arbitration) that regenerates the package, and export to **DOCX** (whole package or one document; bilingual side-by-side layout) and **PDF** (print).
2. **Compliance engine** (deterministic rules, `shared/compliance.ts`):
   - sanctions screening against the **real OFAC SDN, EU and UK lists**, imported daily from OpenSanctions into D1 (organisations only). The Worker finds candidates with an SQLite FTS5 full-text index and scores them with fuzzy name matching on Latin and Chinese names (legal-form words ignored; ≥85% similarity → red with the source list and programme, ≥65% → yellow; embargoed countries → red, elevated-risk countries → yellow). The result shows the list version used;
   - UCN rule: contract amount above **50,000 USD equivalent at the official NBRK rate on the signing date** (or no amount) → registration required before the first payment; the rate and its date are shown in the result;
   - repatriation term derived from the payment terms and performance date; >180 days between prepayment and performance → warning;
   - result as a **traffic light** (green / yellow / red) with a plain-language explanation and recommended action; colour is always duplicated by an icon and text.
3. **Obligation tracker.** Generating the package saves the deal and creates deadlines (UCN, payment, delivery, repatriation). Calendar with month and list views, colour by deadline type, filter by deal; "Mark as done" with an optional proof note and a **proof file** (PDF/photo of a bank statement or customs declaration, stored in Cloudflare R2 or D1, viewable and deletable from the deal); "Remind me tomorrow"; overdue deadlines turn red on the dashboard and in the calendar; when all deadlines are done the deal becomes **Closed**. A Telegram bot (deep-link linking + QR code, inline buttons "Done" / "Remind me tomorrow" / "Open deal") is sent reminders 7, 3 and 1 day ahead by a daily Cloudflare cron; the same reminders also go **by email** (Resend), with an on/off switch in Settings.

### Supporting features (complete user journey)
- Landing page (hero, three modules, how it works, trust block, pricing, FAQ), pricing, "For brokers and accountants", legal information.
- Sign-up (phone or email + password, terms consent, "already registered → log in"), log-in with "remember me", password reset, one-click **demo account**.
- Onboarding in 3 steps: BIN with check-digit validation and autofill from a registry ("We found your company" / manual entry) → bank details (IBAN validation) → Telegram (skippable).
- Dashboard: "New deal", active deals, nearest deadline, items needing attention, overdue banner, active-deals table with risk and stage badges, a **next-step hint**, empty state for new users.
- Deal page with tabs Overview / Documents / Check / Deadlines / History; entering the UCN received from the bank; **"Create similar"** (wizard pre-filled, dates shifted, opens at the amount step).
- Deals list with filters (status, risk, counterparty), documents archive, counterparties list with search, "Check again", counterparty page with the latest screening and its source list.
- Free plan limit (2 packages a month) → plan-limit screen; plans Free / Basic / Pro switchable in Settings (payments are simulated).
- Global search, notifications bell, RU/EN interface switch, change password, "Contact us" support modal.
- Draft **autosave**, "Back" without losing data, inline field validation with hints, "?" explanations of UCN, Incoterms and repatriation.
- Responsive layout: the mobile version has a sticky header with the three-dot navigation menu, card lists, full-screen wizard steps with a sticky action bar, bottom-sheet dialogs and large buttons; checked at 375 px for horizontal overflow on every screen (`e2e/mobile-audit.mjs`).
- **PWA**: installable to the home screen (manifest, icons, "Install" banner), offline app shell via a service worker.
- **Light / dark / system theme**, skeleton loaders, confirmation dialogs before destructive actions (delete draft, delete counterparty, delete file, reopen deadline, disconnect Telegram, plan downgrade).
- Password reset by **email** (when configured), notification email for phone-number accounts, test email.

### Data management
Cloudflare D1 (SQLite). Tables: `users`, `sessions`, `password_resets`, `companies`, `counterparties`, `deals` (form data as JSON + check result), `deadlines`, `deal_events` (history), `usage` (Free plan counter), `sanctions_entities` + `sanctions_fts` (FTS5 index) + `sanctions_meta`, `fx_rates` (NBRK rate cache), `proof_files`. Schema: `migrations/0001_init.sql`, `migrations/0002_real_data_files_email.sql`.

### Security
PBKDF2-SHA256 (100k iterations) password hashes with per-user salt; sessions are random tokens stored hashed in D1 and sent as HttpOnly, SameSite=Lax cookies; every query is scoped to the current user; inputs are sanitized server-side (`shared/sanitize.ts`); password reset does not reveal whether an account exists; the Telegram webhook is protected by a secret header; **brute-force protection**: 5 wrong passwords per account or 20 per IP within 15 minutes lock login for the rest of the window (HTTP 429), password-reset emails and demo accounts are rate-limited per IP; a daily cron job deletes demo accounts older than 24 h, expired sessions and reset links; Workers Logs (observability) are enabled for error monitoring.

## 4. User flows (mapping to the design brief)
| Flow | Where in the app |
|---|---|
| 5.1 Sign-up and onboarding | `/register` → `/app/onboarding` (BIN → bank → Telegram) → empty dashboard |
| 5.2 Create a deal (main) | `/app/deals/new` → wizard steps 1–4 → `/check` (3 checks, ~4 s) → result → `/documents` preview → download → "Deadlines added. Connect Telegram?" |
| 5.3 Respond to a reminder | Telegram buttons or the calendar → mark done (+ proof) → deal closed when all done; overdue → red marker |
| 5.4 Counterparty check | `/app/counterparties` → Add / Check again → red (with source list) or green (with date) |
| 5.5 Repeat deal | Deal page → "Create similar" → wizard pre-filled → check |

## 5. Technologies used
- **Cloudflare Workers** (serverless runtime, static assets, cron triggers), **Cloudflare D1** (SQLite + FTS5) and optional **Cloudflare R2** (files)
- **OpenSanctions** (OFAC SDN, EU, UK; CC BY-NC 4.0), **National Bank of Kazakhstan** official rates, **Resend** (email), **GitHub Actions** (CI/CD, daily data import)
- **TypeScript** everywhere; **Hono** web framework for the API
- **React 19**, **React Router 7**, **Vite** for the frontend; Lucide icons; Inter font
- **docx** for Word export; browser print for PDF; **qrcode** for the Telegram QR code
- **Vitest** (47 unit tests) and **Playwright** (end-to-end test of the full journey, mobile layout audit)
- PWA (Web App Manifest, Service Worker)
- Design: Figma mockups (17 desktop + 4 mobile + Telegram + UI kit), draw.io sitemap, user flows, personas, customer journey map

## 6. Known limitations
- **Sanctions data** is OpenSanctions' daily snapshot of OFAC SDN, EU and UK (organisations only, no individuals or vessels); its licence (CC BY-NC) allows non-commercial use only — a commercial launch needs a data licence. Fictitious demo entries are screened in addition while `DEMO_SANCTIONS = "on"`.
- Name matching is fuzzy but not phonetic: transliterations that differ strongly (e.g. Cyrillic vs Latin spellings) can be missed; Chinese names match only as whole strings.
- **Exchange rates** fall back to clearly labelled demo values if the NBRK feed is unreachable.
- **Repatriation logic is simplified**: the repatriation date equals the performance date set in the contract; no handling of partial deliveries or extensions.
- **Templates are not reviewed by a lawyer** (marked as "requires legal review" in the UI); the Chinese text was prepared without a native legal translator.
- **BIN registry** is a stub with three demo companies (production: stat.gov.kz / eGov API).
- **Payments are not connected**: the plan is switched in Settings.
- Email and Telegram require their own keys; without them the reset link is shown on screen and reminders stay in-app.
- Proof files are limited to 1 MB without R2 (10 MB with R2); no antivirus scanning.
- **B2B plan** (several companies per account, company switcher) is not implemented.
- PDF is produced via the browser's print dialog, not generated on the server.
- No rate limiting on the login endpoint.

## 7. Potential improvements
1. Legal review of templates; Kazakh and Turkish language pairs; more contract types.
2. Commercial sanctions data licence, individuals and beneficial owners, phonetic/transliteration matching.
3. Kaspi / card payments for plans; B2B workspace with client companies and a shared calendar.
4. E-signature via NCALayer / eGov mobile; integrations with banks and 1C.
5. HS-code suggestions and customs duty calculation.
6. Rate limiting, audit log, antivirus scan of uploads; server-side PDF generation.
