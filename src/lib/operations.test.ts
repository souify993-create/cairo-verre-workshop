import test from "node:test";
import assert from "node:assert/strict";
import { dailyExpenseAmount, deriveExpenseMovements, type ExpenseRecord } from "./operations";
const expense=(overrides:Partial<ExpenseRecord>={}):ExpenseRecord=>({
 id:"e1",name:"Loyer atelier",category:"Loyer",amount:3000,frequency:"Mois",paymentMethod:"Espèces",startDate:"2026-11-01",...overrides
});
test("daily expense uses the agreed frequency divisors",()=>{
 assert.equal(dailyExpenseAmount(expense({frequency:"Jour",amount:90})),90);
 assert.equal(dailyExpenseAmount(expense({frequency:"Semaine",amount:600})),100);
 assert.equal(dailyExpenseAmount(expense({frequency:"Mois",amount:3000})),100);
 assert.equal(dailyExpenseAmount(expense({frequency:"Année",amount:3650})),10);
});
test("recurring expense is included only inside its active date range",()=>{
 const row=expense({endDate:"2026-11-30"});
 assert.equal(deriveExpenseMovements([row],"2026-10-31").length,0);
 assert.equal(deriveExpenseMovements([row],"2026-11-25")[0].amount,100);
 assert.equal(deriveExpenseMovements([row],"2026-12-01").length,0);
});
test("daily expense keeps its payment method and appears as a Sortie",()=>{
 const [movement]=deriveExpenseMovements([expense({frequency:"Semaine",amount:600,paymentMethod:"Virement"})],"2026-11-25");
 assert.equal(movement.direction,"Sortie");
 assert.equal(movement.method,"Virement");
 assert.equal(movement.amount,100);
 assert.equal(movement.kind,"Dépense");
});
\n\ntest("invalid calendar dates are rejected instead of being normalized",()=>{\n assert.deepEqual(deriveExpenseMovements([expense()],"2026-02-31"),[]);\n assert.deepEqual(deriveExpenseMovements([expense({startDate:"2026-02-31"})],"2026-03-01"),[]);\n assert.deepEqual(deriveExpenseMovements([expense({endDate:"2026-02-30"})],"2026-03-01"),[]);\n});\n