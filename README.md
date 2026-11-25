# Cairo Verre — Workshop Management

New, independent application for Cairo Verre. This repository is intentionally separate from the legacy glass-management project.

## Current build
- Next.js App Router + TypeScript
- Responsive workshop workspace
- Unified quote calculator (glass, services and accessories)
- Dimensions entered in millimetres
- Six linear-meter services; other services calculated by square metres
- Drafts can be reopened, edited and deleted
- Devis, BP, BL and Facture can be printed directly from a saved draft; printouts do not expose the internal draft status
- Pure delivery ledger engine: drafts are inert; delivered orders derive accessory consumption, confirmed cash movements, customer balances, credit and actual refunds; cancellations preserve real collections
- Automated calculation and ledger tests; CI workflow for typecheck, tests and production build
- Drafts stored locally in this first UI milestone only

## Cloudflare deployment
- Hosting target: Cloudflare Workers using `@opennextjs/cloudflare` (OpenNext).
- Dedicated Worker name: `glass-management`.
- Preview locally with `npm run preview`; deploy only after manual QA with `npm run deploy`.
- The repository includes `wrangler.jsonc`, `open-next.config.ts`, and Cloudflare static-asset cache headers.
- No Worker has been deployed yet; the Cloudflare account currently has no Worker scripts for this project.

## Important
No paid Supabase project or external database is created in this phase. Local browser storage is temporary and device-specific. Before real business use, connect a database and implement transactional delivery, stock, payments, customer balances and reports.

## Run locally
`npm install`
`npm run dev`
`npm run typecheck`
`npm test`
`npm run build`
