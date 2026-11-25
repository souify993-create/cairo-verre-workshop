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
- Email/password administrator sign-in with persistent Supabase Auth sessions; only users carrying the server-managed `app_metadata.role = admin` claim can enter the workspace
- Supabase shared-state schema with RLS and optimistic revision writes; application-wide cloud synchronization is still being integrated
- Drafts and workshop data still use local browser storage until cloud synchronization is completed and verified

## Supabase backend
- Project: `cairo-verre` (`sppcvihdyhplndhoanyu`), region `eu-west-3`.
- `public.workshop_state` stores the versioned workshop payload; RLS restricts reads and writes to authenticated users with the server-managed admin app-metadata claim.
- `save_workshop_state` validates the payload and uses an expected revision to reject concurrent stale writes.
- No service-role key is included in the browser or repository.
- Admin users have not yet been provisioned. Do not rely on this build for live workshop records until cloud synchronization, admin accounts and end-to-end QA are complete.

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
