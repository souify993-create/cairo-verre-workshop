# Cairo Verre — Manual QA checklist

Run these checks in a clean browser profile or after making a backup of the local data. Use test-only names and amounts; do not enter real customer or supplier records during QA.

## 0. Administrator access
- [ ] Sign in with an invited admin email and password.
- [ ] Confirm a non-admin authenticated user is rejected.
- [ ] Reload the app and confirm the admin session persists.
- [ ] Sign out and confirm the workspace is no longer accessible.
- [ ] Confirm no service-role or secret key is present in browser bundles.

## 1. Quote and draft lifecycle
- [ ] Create an accessory-only quote (no glass and no services), save it, reload the page, and confirm it remains editable.
- [ ] Reopen the same draft and change its quantity/price. Save and confirm the same draft is updated rather than duplicated.
- [ ] Print Devis, BP, BL and Facture from the draft. Confirm printing does not deliver the order, change stock, or create a cash movement.
- [ ] Use `+ Nouveau` and confirm the next quote starts empty without changing the saved draft.
- [ ] Deliver a draft with a customer name. Confirm the draft disappears from the draft list and one delivered order appears.
- [ ] Try delivery without a customer name; it must be rejected.

## 2. Customer payment, cheque and refund
Use a delivered test order of 200 MAD.
- [ ] Add 100 MAD cash: customer paid = 100 MAD and cash entry = 100 MAD.
- [ ] Add a 100 MAD cheque: it remains pending and does not increase paid balance or cash.
- [ ] Confirm cheque encashment: paid balance becomes 200 MAD and the cash entry is dated on confirmation.
- [ ] Add a 25 MAD cash refund: cash outflow = 25 MAD and net customer paid = 175 MAD.
- [ ] Add a cheque refund. Even if a caller supplies a confirmed status, the application must keep it pending; it must not create a cash outflow.
- [ ] Attempt to confirm a cheque refund larger than the remaining confirmed receipts; confirmation must be rejected.
- [ ] Add enough confirmed receipt to cover the refund, confirm encashment, and verify the refund appears as a dated cash outflow.
- [ ] Cancel a delivered test order. It must stop consuming stock and stop counting as sales, while confirmed historical receipts remain visible until separately refunded.

## 3. Accessory stock and supplier invoice
- [ ] Record an accessory supplier invoice with at least two different lines. Confirm each line adds its own quantity to the corresponding stock item.
- [ ] Record the invoice as unpaid. It must not create a cash outflow.
- [ ] Record an initial supplier cheque at invoice entry. It must appear as pending, leave the paid balance unchanged, and create no cash outflow.
- [ ] Confirm that initial cheque only after actual encashment; the confirmation date must become its cash-outflow date.
- [ ] Add a partial cash or bank-transfer settlement. Paid balance and cash outflow must increase by exactly the settled amount.
- [ ] Add a supplier cheque. It must remain pending and must not increase paid balance or cash outflow.
- [ ] Confirm cheque encashment with the actual date. Paid balance and cash outflow must then include it exactly once.
- [ ] If a supplier cheque is not encashed, cancel the pending cheque. It must stop reserving the invoice balance, remain marked cancelled, and never create a cash outflow.
- [ ] Confirm the supplier balance is total TTC minus confirmed settlements, and stock quantities do not change when paying an invoice.

## 4. Daily journal, cash and payroll separation
- [ ] Record a recurring monthly expense of 3,000 MAD active on the selected date. Journalier should allocate 100 MAD for that day; La caisse must not treat this allocation as an actual payment.
- [ ] Create a test employee with weekly salary 1,200 MAD and record 54 hours across six days. Journalier salary cost should total 1,200 MAD for the week.
- [ ] Record a 200 MAD advance. Journalier must count the advance as part of the 1,200 MAD weekly salary cost, not add it twice.
- [ ] Confirm La caisse shows the actual 200 MAD advance and actual salary settlements only, not the daily allocated salary-cost rows.
- [ ] Verify no recurring expense or payroll row is duplicated after reload.

## 5. Persistence and repeatability
- [ ] Reload after each major operation and verify the records persist.
- [ ] Repeat the same ledger view/reload several times. Totals and movement counts must remain unchanged; derived movements must not accumulate duplicates.
- [ ] Test on a second browser/device only after cloud synchronization is completed; until then current data is browser-local and is not synchronized between devices.
- [ ] After cloud sync is integrated, sign in on two devices and verify updates are shared and stale revision writes are rejected without overwriting newer data.

## Cloudflare Workers preview checks

- [ ] Build the Next.js app with the OpenNext Cloudflare adapter.
- [ ] Run the local Workers preview and verify the home screen, navigation, quote calculator, draft persistence and print layouts.
- [ ] Confirm the preview is served by the Cloudflare Workers runtime, not only the standard Next.js Node server.
- [ ] Check that the Worker bundle is within the account plan size limit and that no real company data or secrets are included.
- [ ] Only after all local preview checks pass, deploy the pilot to the dedicated `glass-management` Worker.
- [ ] Verify the deployed `souify993.workers.dev` URL, then proceed to shared database and admin accounts as specified below.

## Release and account sequence

1. Complete typecheck, automated tests, and production build successfully.
2. Complete every manual QA item above in a preview/test environment using test-only records.
3. Publish the verified pilot version without sign-in to Cloudflare Workers (`glass-management`), as requested.
4. Run the same smoke tests on the published URL before treating the release as verified.
5. Only after the published version is verified, implement persistent shared database storage and secure admin authentication, then create the two admin accounts.
6. Re-run the full QA checklist after the database and authentication changes.

**Important data limitation:** the current application stores records in browser-local storage. A published URL does not make those records shared or backed up: each browser/device has its own data. Use only test data in the pilot. Do not rely on this version for the workshop's official live records until shared database persistence, backups, and the two admin accounts are implemented and verified.
