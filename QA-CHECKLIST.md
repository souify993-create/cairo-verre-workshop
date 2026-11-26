# Cairo Verre — Release QA checklist

Run business-operation tests with test-only records. Do not create fake movements in the live company ledger. For UI tests that would create or delete orders, use a separate test project/environment or first obtain a verified backup and agree on an isolated test procedure.

## 1. Accounts and access

- [x] Two allowlisted administrator accounts activated and email-confirmed.
- [x] Both accounts carry the server-managed `admin` role and `cairo-verre` application claim.
- [x] User-confirmed that the existing workshop data appears after signing in with either account.
- [ ] Verify session persistence after closing and reopening the browser.
- [ ] Verify sign-out blocks access to the workspace.
- [ ] Verify a non-allowlisted account cannot activate or enter the app.

## 2. Shared data and concurrency

- [x] Shared Supabase state exists and contains the existing workshop payload.
- [x] The application loads the cloud snapshot after admin sign-in.
- [x] The app uses revision-checked writes to reject stale concurrent updates.
- [ ] On two separate devices/browsers, create a harmless isolated test change and confirm it appears on the other session.
- [ ] Confirm a stale session receives a conflict message and cannot overwrite a newer snapshot.

## 3. Quote and documents

- [ ] Create an accessory-only draft in a test environment, reload, reopen and edit it.
- [ ] Validate glass area calculations with the internal 20 mm allowance while printed dimensions remain the original entered millimetres converted to metres.
- [ ] Validate linear and area service calculations, including grouped glass dimensions and service-only quotes.
- [ ] Print Devis, BP, BL and Facture; confirm document layout, company identity, customer information and totals.
- [ ] Confirm printing a draft does not deliver it or change stock/cash.
- [ ] Deliver a test draft and confirm it becomes one order with the next shared `#C` number.

## 4. Ledger, stock and payments

- [ ] Verify cash receipts and refunds affect the cash journal exactly once.
- [ ] Verify pending cheques/effects do not count as confirmed receipts until encashed.
- [ ] Verify cheque/effect reference and due date are mandatory.
- [ ] Verify customer avoir creation and settlement follow the agreed rules.
- [ ] Verify accessory consumption and supplier purchases update stock correctly.
- [ ] Verify supplier invoices, partial settlements and pending supplier cheques.
- [ ] Verify recurring expenses and payroll allocations are not duplicated in actual cash movements.
- [ ] Verify employee attendance, advances and salary settlements.

## 5. Backup

- [ ] Click **Sauvegarde** in the top bar.
- [ ] Confirm a JSON file downloads and contains orders, drafts, customers, purchases, supplier invoices, expenses, employees and payroll.
- [ ] Store the file in a private off-device location.
- [ ] Confirm the backup file is not shared publicly and is treated as confidential.
- [ ] Document and test the restore procedure in an isolated environment before relying on it for disaster recovery.

## 6. Release checks

- [x] Latest main commit passed GitHub verification and Cloudflare deployment workflows.
- [x] Live Worker URL was opened by the owner and login/PWA installation were observed.
- [ ] Complete the remaining manual business-flow checks before declaring the app fully production-ready.
- [ ] Enable leaked-password protection when supported by the Supabase plan.
- [ ] Re-run Supabase security and performance advisors after any database changes.
