import test from "node:test";
import assert from "node:assert/strict";
import { addSalaryPayment, derivePayrollMovements, summarizePayroll, type Employee, type PayrollWeek } from "./payroll";
const employee:Employee={id:"emp-1",name:"Ali",weeklySalary:1200,active:true};
const week:PayrollWeek={id:"w1",employeeId:"emp-1",weekStart:"2026-11-23",attendance:Array.from({length:6},(_,i)=>({date:"2026-11-"+String(23+i).padStart(2,"0"),hours:9})),advances:[{id:"a1",date:"2026-11-25",amount:200,method:"Espèces"}],salaryPayments:[]};
test("weekly salary is prorated by attendance hours and advances reduce settlement",()=>{
 const s=summarizePayroll(week,employee);
 assert.equal(s.hours,54);assert.equal(s.earned,1200);assert.equal(s.advances,200);assert.equal(s.remaining,1000);
});
test("four full attendance days produce 800 DH and a 200 DH advance leaves 600 DH",()=>{
 const partial={...week,attendance:week.attendance.map((d,i)=>({...d,hours:i<4?9:0}))};
 const s=summarizePayroll(partial,employee);
 assert.equal(s.earned,800);assert.equal(s.remaining,600);
});
test("advance exceeding earned salary carries forward without negative salary payment",()=>{
 const prior={...week,weekStart:"2026-11-16",attendance:week.attendance.map(d=>({...d,hours:0})),advances:[{id:"a-old",date:"2026-11-18",amount:250,method:"Espèces"}]};
 const next={...week,weekStart:"2026-11-23",advances:[],attendance:week.attendance.map((d,i)=>({...d,hours:i===0?9:0}))};
 const s=summarizePayroll(next,employee,[prior]);
 assert.equal(s.priorAdvanceDebt,250);assert.equal(s.earned,200);assert.equal(s.remaining,0);assert.equal(s.advanceDebt,50);
});
test("salary settlement cannot exceed remaining amount and cash movements include only real payouts",()=>{
 const paid=addSalaryPayment(week,employee,[],{id:"s1",date:"2026-11-29",amount:1000,method:"Espèces"});
 assert.equal(summarizePayroll(paid,employee).remaining,0);
 assert.throws(()=>addSalaryPayment(week,employee,[],{id:"s2",date:"2026-11-29",amount:1001,method:"Espèces"}));
 const movements=derivePayrollMovements([paid],[employee]);
 assert.equal(movements.length,7);assert.equal(movements.filter(m=>m.kind==="Avance salaire").reduce((s,m)=>s+m.amount,0),200);assert.equal(movements.filter(m=>m.kind==="Salaire").reduce((s,m)=>s+m.amount,0),1000);assert.equal(movements.reduce((s,m)=>s+m.amount,0),1200);
 assert.ok(movements.every(m=>m.direction==="Sortie"));
});

test("daily salary allocations plus advances equal earned wages without double counting",()=>{
 const rows=derivePayrollMovements([week],[employee]);
 const salary=rows.filter(x=>x.kind==="Salaire");
 assert.equal(salary.length,6);
 assert.equal(salary.reduce((s,x)=>s+x.amount,0),1000);
 assert.equal(rows.filter(x=>x.kind==="Avance salaire").reduce((s,x)=>s+x.amount,0),200);
 assert.equal(rows.reduce((s,x)=>s+x.amount,0),1200);
});
