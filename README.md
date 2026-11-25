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
- Automated calculation tests and a CI workflow for typecheck, tests and production build
- Drafts stored locally in this first UI milestone only

## Important
No paid Supabase project or external database is created in this phase. Local browser storage is temporary and device-specific. Before real business use, connect a database and implement transactional delivery, stock, payments, customer balances and reports.

## Run locally
`npm install`
`npm run dev`
`npm run typecheck`
`npm test`
`npm run build`
