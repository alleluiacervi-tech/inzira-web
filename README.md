# Inzira — service assistance platform (Next.js)

A Next.js 15 (App Router, TypeScript) build of the Inzira design: public website, service catalogue,
service detail pages, start-request flow, customer portal, request tracking, document upload,
agent workspace and admin console.

> Inzira is a placeholder brand for a **private assistance company**. The UI never imitates Irembo,
> RRA, RDB, the Judiciary or any government institution.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
```

Requires Node 18.18+ (Node 20+ recommended).

## Routes

| Area | Route |
| --- | --- |
| Home | `/` |
| Service catalogue (search + filters) | `/services`, `/services?q=company`, `/services?category=rra` |
| Service detail | `/services/[slug]` |
| Start a request (4-step form) | `/start/[slug]` (`?describe=1` for "describe my situation") |
| Customer dashboard | `/portal` |
| Request detail & tracking | `/portal/requests/[ref]` (e.g. `INZ-2026-04817`) |
| Documents & upload | `/portal/documents` |
| Agent dashboard + case table | `/agent` |
| Agent case workspace | `/agent/cases/[ref]` |
| Admin overview | `/admin` |
| Admin: services & categories / payments / roles / audit | `/admin/services`, `/admin/payments`, `/admin/roles`, `/admin/audit` |

## Structure

```
app/                 routes (App Router)
  globals.css        design tokens + all styles (no CSS framework)
components/
  ui.tsx             Icon, Logo, Badge, FeeBreakdown, ServiceCard, Timeline, Alert, Kpi…
  PublicNav, Footer, AppShell (sidebars, mobile top bar, tab bar, drawer)
  Catalogue, StartForm, DocumentCenter, RequestSide, CaseBoard, Workspace,
  ServiceAdmin, RolesMatrix, AuditLog  (client components with interactivity)
lib/data.ts          all mock content: services, fees, requests, cases, payments, audit
```

## The pricing rule

Every price is rendered as two labelled lines: **Official government fee** (outlined `OFFICIAL` tag)
and **Our service / assistance fee** (solid ember `INZIRA` tag). Use `FeeBreakdown` / `FeeLines`
from `components/ui.tsx` — never show a single combined "price".

## Before launch

- **All data is mock** (`lib/data.ts`). Official fees and processing times are illustrative —
  verify every value with the responsible institution.
- Replace placeholders: brand name/logo, `[PRICE]`, `[Office address]`, phone, company code,
  and the sample testimonials (use real, consented reviews).
- Wire up real auth (customer / agent / admin roles), a database, file storage for uploads,
  MoMo/Airtel Money payments, and SMS/WhatsApp notifications. Interactive screens currently keep
  state in the browser only.
- Language switch (EN/RW/FR) is UI-only; add i18n (e.g. `next-intl`) for real translations.
