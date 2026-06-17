# FarmAdvisor — App Guide

The single reference for **what this app does and where everything lives** after the
mobile-first redesign. Keep this updated when you move or add features.

> Stack: Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · next-intl (en/hi/ta)
> AI: OpenAI (`gpt-5.2`) · Data: AWS DynamoDB / S3 / SNS · Weather: Open-Meteo · Prices: data.gov.in Agmark

---

## 1. Shape of the app

FarmAdvisor is a **mobile-first web app** a farmer keeps open and uses daily. It opens
straight into the app — no marketing landing page.

- `/` → redirects: logged in → `/today`, else `/login` (`app/page.tsx`).
- Authenticated screens live in the route group **`app/(app)/`** behind a shared shell
  (`app/(app)/layout.tsx`) that verifies the session, frames the UI to phone width
  (`max-w-md mx-auto`) and renders the bottom tab bar.
- **Bottom tab bar** (`components/layout/TabBar.tsx`), iOS-style, 5 tabs:

| Tab | Route | Page file |
|-----|-------|-----------|
| Today | `/today` | `app/(app)/today/page.tsx` |
| Crop Plan | `/plan` | `app/(app)/plan/page.tsx` |
| Chat (center, raised) | `/chat` | `app/(app)/chat/page.tsx` |
| Money | `/money` | `app/(app)/money/page.tsx` |
| Profile | `/profile` | `app/(app)/profile/page.tsx` |

Route protection: `middleware.ts` (public = `/`, `/login`, `/register`, `/api/auth`, `/api/health`, assets).

---

## 2. Onboarding (Farmer ID + phone + OTP → confirm)

No long registration form and **no passwords**. The farmer enters their Government Farmer
ID and phone, verifies an OTP, and we fetch their details from a **synthetic government
dataset** and ask them to confirm.

- **Synthetic registry:** `lib/synthetic-gov-data.ts` — ~8 Tamil Nadu farmer records
  (id, phone, name, district, land area, soil/typography, land polygon coordinates near a
  real district centroid, language, survey no., masked Aadhaar, category).
  `getGovFarmerRecord(farmerId, phone)` matches on **both** id and phone.
  *To add a demo farmer:* copy a record, give it a unique `TN`+11-digit id and 10-digit phone.
- **Demo accounts:** e.g. `TN10000000001 / 9876500001`, `TN10000000004 / 9876500004` (see the file for all).
- **OTP (mock by default):** `lib/otp.ts`. With `OTP_MOCK !== 'false'` any phone accepts the
  fixed code **`123456`** (`MOCK_OTP_CODE`), shown on screen — no SMS. Set `OTP_MOCK=false`
  to use the real AWS SNS flow in `lib/aws/sns.ts`.
- **Flow:** `app/(auth)/register/page.tsx` (identify → OTP → confirm) and
  `app/(auth)/login/page.tsx` (phone → OTP).
- **APIs:** `app/api/auth/gov-lookup` (fetch record for the confirm card),
  `app/api/auth/register` (verify OTP → create `farmer_profiles` row from the record, no
  password → set `auth_token` cookie → land on `/today`), `app/api/auth/login`
  (phone + OTP → session), `app/api/auth/otp/{send,verify}` (use `lib/otp.ts`).
- **Auth/session:** JWT in httpOnly `auth_token` cookie (`lib/auth.ts`). Logout = `DELETE /api/auth/login`.

---

## 3. The tabs

### Today — `app/(app)/today/page.tsx` + `components/today/TodayView.tsx`
The daily "what to do" screen, minimal scrolling.
- Server loads profile, active plans, and the Open-Meteo forecast, then builds a
  deterministic plan with **`lib/today-plan.ts` → `buildTodayPlan()`**:
  - `weatherAlert` — surfaced **only when the week is bad for the crop** (`weatherVerdict`
    tone ≠ `good`); a normal week shows a small "weather is fine" pill, no widget.
  - `todayTasks` — the active stage's actions (`nextStepFromPlan` from `lib/farm-advice.ts`).
  - `prepareAhead` — upcoming stages within ~10 days, so the farmer can act today.
- **AI "Today's focus"** line: `app/api/today/route.ts` (OpenAI, localized, with a rule-based
  fallback). Fetched client-side so the page renders instantly.
- **Daily check-in** button (sticky, above the tab bar) → `/chat?mode=checkin`.
- Task checkmarks are stored in `localStorage` per day.

### Crop Plan — `app/(app)/plan/page.tsx`
- Generation flow reuses `components/crop-plan/StateAssessmentModal` + `CropSuggestions`
  and `POST /api/crop-plan`.
- Stages render as **`components/plan/StageAccordion.tsx`**: each stage shows a one-line
  **`summary`** collapsed; tap to expand full `tasks`, cost, weather requirement, alerts.
  The active stage is auto-detected and opened.
- "Ask or change this plan" reuses `components/crop-plan/PlanChatPanel` (→ `POST /api/crop-plan/chat`).

### Chat — `app/(app)/chat/page.tsx` + `components/chatbot/ChatPanel.tsx`
The primary way the farmer interacts. Full-screen.
- Attach menu (`+`): **Crop photo** (vision diagnosis via `POST /api/chat`, multipart) and
  **Document / Soil report** (PDF/image → `POST /api/soil/upload`, which extracts and saves
  the report as the current soil report; the summary is shown back in chat).
- **Check-in mode** (`/chat?mode=checkin`): shows a "Check-in" chip, seeds an opening line,
  and passes `mode=checkin` to `/api/chat`, which adds check-in guidance to the system
  prompt. Observations are captured to memory automatically (existing `extractFarmerFacts`).
- Voice in/out via `VoiceInput`/`VoiceOutput`.

### Money — `app/(app)/money/page.tsx` + `components/money/MoneyView.tsx`
Prices, budget/expenses, and profitability.
- Live market price: `GET /api/market-prices?commodity=<crop>` (data.gov.in Agmark).
- Expense breakdown: per-stage `estimatedCost` + total from the active plan.
- **Profit outlook:** `app/api/money/route.ts` — OpenAI estimates revenue/profit range +
  tips from the plan budget and current market price (clearly an estimate; rule-based fallback).

### Profile — `app/(app)/profile/page.tsx`
- Reuses `components/profile/ProfileCard` (editable) + `FarmerMemorySection`. Labeled
  "synced from government records". Language switcher + **Logout**.
- Soil-report upload now lives in **Chat**, not here.

---

## 4. Where the AI prompts live

- Chat advisor + check-in: `app/api/chat/route.ts`
- Crop plan generation + milestone `summary` spec + rule-based fallback: `app/api/crop-plan/route.ts`
- Plan refinement: `app/api/crop-plan/chat/route.ts`
- Today's focus line: `app/api/today/route.ts`
- Profit outlook: `app/api/money/route.ts`
- Soil report extraction: `app/api/soil/upload/route.ts`
- Crop photo diagnosis: `lib/crop-doctor.ts`
- OpenAI client (`chatWithBedrock`, embeddings, vision, STT/TTS): `lib/ai/openai.ts`

The `Milestone.summary` field (`lib/types/crop-plan.ts`) drives the collapsed stage view.

---

## 5. Data stores (DynamoDB, via `lib/aws/dynamodb.ts`)

- `farmer_profiles` — profile + `memory[]` facts (now created from the synthetic registry, no `password_hash`).
- `crop_plans` — plans with milestones, status, `active_from`.
- `soil_reports` — extracted soil data (`is_current`).
- `chat_history` — messages + summaries + tags.
- S3 mirrors media and JSON backups; Qdrant powers RAG over the knowledge base.

---

## 6. i18n

Translations in `public/locales/{en,hi,ta}/common.json` (next-intl). The `tabs` namespace
covers the bottom bar in all three languages. AI-generated content (today focus, plan
stages, chat, money outlook) is produced in the farmer's locale at request time. Some new
static chrome labels are currently English-only — add keys here to localize them further.

---

## 7. Run & verify

```bash
npm run dev      # http://localhost:3000 — open in a mobile viewport
npm run build    # type-check + lint + production build
```

Demo path: `/` → `/login` → register `TN10000000001 / 9876500001`, OTP `123456`, confirm →
`/today`. Build a plan in `/plan`, chat + upload a soil PDF in `/chat`, view `/money`, edit
`/profile`. Mock OTP needs no SMS; the rest needs the `.env` (AWS + `OPENAI_API_KEY`).
