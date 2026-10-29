# Kelisim — MVP

**Kelisim** (from Kazakh *келісім* — "agreement") is a web service for small businesses in Kazakhstan that import from China and Turkey. One deal form → a risk check → a bilingual document package (RU/CN or RU/EN) → a calendar of currency-control deadlines with reminders.

> "A contract with your Chinese supplier in 15 minutes: no lawyer, no fines."

**Live demo:** https://kelisim.erseit-aid.workers.dev · click **"Демо-кабинет"** for a pre-filled account.

- Full project documentation: [`docs/PROJECT_DOCUMENTATION.md`](docs/PROJECT_DOCUMENTATION.md)
- Demo video script (3–5 min): [`docs/DEMO_VIDEO_SCRIPT.md`](docs/DEMO_VIDEO_SCRIPT.md)
- Design inputs (brief, personas, journey, sitemap, flows, mockups): [`docs/design/`](docs/design)
- Screenshots of the running MVP: [`docs/screenshots/`](docs/screenshots) (phone layout: [`docs/screenshots/mobile/`](docs/screenshots/mobile))

## Tech stack

| Layer | Technology |
|---|---|
| Hosting / runtime | Cloudflare Workers (one Worker serves the API and the static app) |
| Database | Cloudflare D1 (SQLite), SQL migrations in `migrations/` |
| API | TypeScript + [Hono](https://hono.dev) |
| Frontend | React 19 + React Router + Vite, plain CSS design tokens (UI kit from the brief) |
| Documents | `docx` (DOCX export), browser print → PDF |
| Real data | OpenSanctions (OFAC SDN, EU, UK) imported into D1 + FTS5; official NBRK exchange rates |
| Files | Cloudflare R2 (or D1 fallback) for proof files |
| Notifications | Telegram bot, email via Resend, in-app bell |
| Scheduling | Cloudflare Cron Trigger (reminders, rates) + GitHub Actions (deploy, daily sanctions import) |
| App | PWA (installable, offline shell), light / dark theme |
| Tests | Vitest (unit, 47 tests) + Playwright (end-to-end journey + mobile audit) |

## Project structure

```
kelisim/
├── shared/                 # Domain logic shared by API and UI (pure TypeScript, unit-tested)
│   ├── compliance.ts       #   compliance engine: sanctions, UCN rule, deadlines, validation
│   ├── documents.ts        #   bilingual document generator (contract, spec, invoice, packing list)
│   ├── opensanctions.ts    #   OpenSanctions CSV parser + FTS candidate query
│   ├── fx.ts               #   NBRK rate parser, currency conversion for the UCN threshold
│   ├── sanctions-data.ts   #   fictitious demo entries (screened in addition to the real lists)
│   ├── sanitize.ts, types.ts, dates.ts, bin.ts, countries.ts, sample.ts
├── worker/                 # Cloudflare Worker (API)
│   ├── index.ts            #   routes, error handling, cron handler
│   ├── routes/             #   auth, account, deals, counterparties, tracker, files, telegram
│   └── lib/                #   auth (PBKDF2, sessions), deals service, external data (sanctions, rates),
│                           #   telegram bot, email, demo seed
├── scripts/import-sanctions.ts  # daily OpenSanctions → D1 import
├── .github/workflows/      # deploy on push, daily sanctions import
├── src/                    # React frontend
│   ├── pages/              #   Landing, Auth, Onboarding, Dashboard, Wizard, Check, Package,
│   │                       #   DealPage, Documents, Counterparties, Calendar, Company, Settings, Help
│   ├── components/         #   AppShell (sidebar, header, mobile menu), UI kit, deadlines
│   ├── lib/                #   DOCX / PDF export, formatting
│   └── i18n.tsx            #   RU / EN interface dictionary
├── migrations/             # D1 schema
├── tests/                  # unit tests (Vitest)
├── e2e/                    # end-to-end journey + mobile audit (Playwright)
├── public/                 # logo, icons, PWA manifest, service worker
├── docs/                   # documentation, design inputs, screenshots
└── wrangler.toml           # Cloudflare configuration
```

## 1. Install

Requirements: **Node.js 20+** and a free **Cloudflare account** (only for deployment).

```bash
npm install
```

## 2. Run locally

```bash
npm run dev
```

This builds the frontend, applies the D1 migrations to a local SQLite database and starts the Worker at **http://localhost:8787** (no Cloudflare account needed).

- Click **"Посмотреть демо-кабинет"** on the landing page (or **"Открыть демо-кабинет"** on the login page) to get a pre-filled Pro account with 3 deals, an overdue deadline and a deal that needs a UCN.
- Or register a new account: onboarding → BIN `950312400129` (demo registry) → create a deal → use **"Заполнить примером"** in the wizard.
- Demo BINs: `950312400129` (ИП Aigerim Store), `140540005313` (ТОО Строй Импорт Астана), `181140007622` (ТОО Dinara Accounting). Any other BIN with a valid check digit → manual entry.
- Load the **real sanctions lists** into the local database (needs internet): `npm run sanctions:import:local`. Without it the demo entries below are used.
- Sanctions demo names that trigger a **red** result: `Shenzhen Redline Electronics Co., Ltd.`, `Pacific Dragon Logistics Limited`, `Bosphorus Dual Trade A.S.`, `Ningbo Blackwater Machinery Co.`, `Golden Crane Import Export Ltd`.
- A deal above **50,000 USD** (e.g. 5,000 jackets × 24 USD) triggers the **yellow** "UCN required" result.

For frontend hot reload, run `npx wrangler dev` in one terminal and `npm run dev:ui` in another (Vite proxies `/api` to the Worker).

## 3. Test

```bash
npm test              # 47 unit tests: compliance rules, deadlines, validation, documents,
                      #   OpenSanctions CSV import, FTS query, NBRK rate parsing
npm run typecheck     # TypeScript, frontend + worker

# end-to-end (with `npm run dev` running in another terminal):
npx playwright install chromium   # once
node e2e/journey.mjs              # registration → onboarding → deal → check → download → calendar
                                  # → counterparty screening → red deal → Free limit → demo → mobile
node e2e/mobile-audit.mjs         # screenshots of every screen at 375 px + horizontal-overflow check
```

## 4. Deploy to Cloudflare

```bash
npx wrangler login                       # opens the browser once
npx wrangler d1 create kelisim-db        # copy the printed database_id …
#   … into wrangler.toml → [[d1_databases]] database_id = "…"
npm run deploy                           # build + remote migrations + wrangler deploy
```

npm run sanctions:import                 # load the real OFAC / EU / UK lists into production D1
```

After the first deploy, set the public URL (used in Telegram buttons) in `wrangler.toml` → `[vars] APP_URL = "https://kelisim.<your-subdomain>.workers.dev"` and run `npm run deploy` again.

### Updating an existing deployment

Copy the new files over your project folder **keeping your `wrangler.toml`** (it holds your `database_id`), then `npm install && npm run deploy`. New SQL migrations are applied automatically.

### Automatic deploys and daily sanctions import (GitHub Actions)

1. Push the project to a GitHub repository (with your real `database_id` in `wrangler.toml`).
2. Cloudflare dashboard → *My Profile → API Tokens* → create a token from the **"Edit Cloudflare Workers"** template and add the **D1 → Edit** permission. Copy your **Account ID** from the Workers overview page.
3. GitHub → *Settings → Secrets and variables → Actions*: add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. Every push to `main` now runs typecheck + tests and deploys (`.github/workflows/deploy.yml`); the lists are refreshed every day at 06:30 Astana (`.github/workflows/sanctions.yml`, also runnable by hand from the *Actions* tab).

### Real data sources

- **Sanctions**: [OpenSanctions](https://www.opensanctions.org) datasets `us_ofac_sdn`, `eu_fsf`, `gb_fcdo_sanctions` / `gb_hmt_sanctions` (organisations only), CC BY-NC 4.0 — free for non-commercial use. The import runs outside the Worker because the CSV files are several MB; the Worker searches candidates with SQLite FTS5 and scores them with the fuzzy matcher. Fictitious demo entries are also screened while `DEMO_SANCTIONS = "on"` (for demos without naming real companies); set it to `"off"` in production.
- **Exchange rates**: official NBRK rates (`nationalbank.kz/rss/get_rates.cfm?fdate=DD.MM.YYYY`) on the contract signing date, cached in D1; the result shows which rate was used. If the feed is unreachable, a clearly labelled demo rate is used.

### Optional: email (password reset + reminders)

1. Create a free account at [resend.com](https://resend.com), verify your sending domain, create an API key.
2. `wrangler.toml` → `EMAIL_FROM = "Kelisim <noreply@your-domain.kz>"`; `npx wrangler secret put RESEND_API_KEY`; `npm run deploy`.

Then the reset link is emailed (instead of being shown on screen) and users get deadline reminders by email (Settings → Notifications).

### Optional: R2 storage for proof files

Without R2, proof files up to **1 MB** are stored in D1. For files up to **10 MB**: `npx wrangler r2 bucket create kelisim-proofs`, uncomment the `[[r2_buckets]]` block in `wrangler.toml`, `npm run deploy`.

### Optional: Telegram bot

1. Create a bot with [@BotFather](https://t.me/BotFather), put its username into `wrangler.toml` → `TELEGRAM_BOT_USERNAME`.
2. Set the secrets:
   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET     # any random string
   ```
3. Register the webhook (once):
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://kelisim.erseit-aid.workers.dev/api/telegram/webhook&secret_token=<WEBHOOK_SECRET>"
   ```
4. Settings → Notifications → **Connect Telegram** (QR code / button). The daily cron (08:00 Astana) sends reminders 7, 3 and 1 day before each deadline and on overdue; the inline buttons "Done" and "Remind me tomorrow" update the deal. Bot commands: `/deadlines` (upcoming deadlines), `/help`; the command menu is registered automatically when an account is linked.

Without the bot token everything else works; Settings shows a preview of the bot messages, and in-app reminders (bell + dashboard) are always on.

## Environment variables

| Name | Where | Purpose |
|---|---|---|
| `DB` | `wrangler.toml` binding | D1 database |
| `APP_URL` | `[vars]` | Public URL for links in Telegram messages |
| `TELEGRAM_BOT_USERNAME` | `[vars]` | Bot username for the deep link |
| `TELEGRAM_BOT_TOKEN` | secret | Bot API token (optional) |
| `TELEGRAM_WEBHOOK_SECRET` | secret | Verifies webhook calls from Telegram |
| `DEMO_SANCTIONS` | `[vars]` | `"on"` screens fictitious demo entries in addition to the real lists |
| `RESEND_API_KEY` | secret | Email sending via Resend (optional) |
| `EMAIL_FROM` | `[vars]` | Sender address for emails |
| `PROOFS` | `wrangler.toml` R2 binding | Proof file storage (optional) |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub secrets | Deploy and sanctions import from GitHub Actions |

Locally, secrets go into `.dev.vars` (see `.dev.vars.example`).
