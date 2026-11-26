# Cairo Verre — Workshop Management

Production application for Cairo Verre, built with Next.js, TypeScript and Cloudflare Workers (OpenNext).

## Live application

- Worker: https://glass-management.idhemzirah.workers.dev
- GitHub repository: https://github.com/souify993-create/cairo-verre-workshop
- Supabase project: `sppcvihdyhplndhoanyu` (region `eu-west-3`)
- Shared state: `public.workshop_state`, protected by RLS and the server-managed `app_metadata.role = admin` and `app_metadata.application = cairo-verre` claims.
- Two approved administrator accounts are configured through the private allowlist.

## Workshop features

- Quote calculator for glass, linear-meter services, area services and accessories.
- Dimensions entered in millimetres; print documents display metres to two decimal places.
- Devis, BP, BL and Facture printing.
- Customer directory, customer balances, cheque/effect tracking, cash ledger and refunds.
- Accessory purchases and stock, supplier invoices and supplier accounts.
- Expenses, daily journal, employee attendance and payroll.
- Shared Supabase persistence for orders, drafts, customers, stock, suppliers, expenses, employees and payroll.
- Persistent administrator sessions and sign-out.
- Installable PWA with an offline shell.
- One-click JSON backup export from the top bar. The downloaded file contains the workshop business data and drafts, but not administrator credentials or database schema.

## Backup policy

The Supabase Free plan does not include automatic database backups. Use the in-app **Sauvegarde** button regularly and store the downloaded JSON file outside the device (for example, in a private Google Drive folder and on a computer). Treat the file as confidential because it contains business and customer information. The export is a recovery copy of the workshop payload; it is not a complete database/identity/schema dump, and automatic restore is not currently provided.

For a full PostgreSQL backup, use Supabase CLI `db dump` and store the output securely off-site. See the official Supabase backup guide: https://supabase.com/docs/guides/platform/backups

## Development and verification

```bash
npm install
npm run typecheck
npm test
npx opennextjs-cloudflare build
```

CI runs typecheck, automated tests, OpenNext build and a local Cloudflare Workers smoke test. Deployment to the dedicated `glass-management` Worker occurs after successful verification.

## Security notes

- No service-role or secret key is shipped to the browser.
- Only allowlisted admin accounts with the correct server-managed application claims can use the workspace.
- `private.admin_allowlist` intentionally has no client-facing RLS policy.
- Enable Supabase leaked-password protection in Auth settings when available on the selected plan.
- Keep backup files private; they include financial and customer records.
