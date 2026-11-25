import type { PaymentMethod } from "./ledger";
export type Employee = { id:string; name:string; weeklySalary:number; active:boolean };
export type AttendanceDay = { date:string; hours:number };
export type PayrollAdvance = { id:string; date:string; amount:number; method:PaymentMethod };
export type SalaryPayment = { id:string; date:string; amount:number; method:PaymentMethod };
export type PayrollWeek = { id:string; employeeId:string; weekStart:string; attendance:AttendanceDay[]; advances:PayrollAdvance[]; salaryPayments:SalaryPayment[] };
export type PayrollSummary = { earned:number; hours:number; advances:number; priorAdvanceDebt:number; payable:number; paid:number; remaining:number; advanceDebt:number };
const nonnegative=(n:number)=>Number.isFinite(n)?Math.max(0,n):0;
export function summarizePayroll(week:PayrollWeek,employee:Employee,previousWeeks:PayrollWeek[]=[]):PayrollSummary{
 const prior=[...previousWeeks].filter(w=>w.employeeId===employee.id&&w.weekStart<week.weekStart).sort((a,b)=>a.weekStart.localeCompare(b.weekStart));
 let debt=0;
 for(const old of prior){
  const hours=old.attendance.reduce((s,d)=>s+nonnegative(d.hours),0);
  const earned=employee.weeklySalary/(6*9)*hours;
  const advances=old.advances.reduce((s,a)=>s+nonnegative(a.amount),0);
  debt=Math.max(0,debt+advances-earned);
 }
 const hours=week.attendance.reduce((s,d)=>s+nonnegative(d.hours),0);
 const earned=employee.weeklySalary/(6*9)*hours;
 const advances=week.advances.reduce((s,a)=>s+nonnegative(a.amount),0);
 const payable=Math.max(0,earned-debt-advances);
 const paid=week.salaryPayments.reduce((s,p)=>s+nonnegative(p.amount),0);
 return {earned,hours,advances,priorAdvanceDebt:debt,payable,paid,remaining:Math.max(0,payable-paid),advanceDebt:Math.max(0,debt+advances-earned)};
}
export function addSalaryPayment(week:PayrollWeek,employee:Employee,previousWeeks:PayrollWeek[],payment:SalaryPayment):PayrollWeek{
 if(!Number.isFinite(payment.amount)||payment.amount<=0)throw new Error("Le montant du salaire versé doit être supérieur à zéro.");
 const summary=summarizePayroll(week,employee,previousWeeks);
 if(summary.paid+payment.amount>summary.payable+0.001)throw new Error("Le paiement dépasse le salaire restant après déduction des avances.");
 if(week.salaryPayments.some(p=>p.id===payment.id))throw new Error("Identifiant de paiement déjà utilisé.");
 return {...week,salaryPayments:[...week.salaryPayments,payment]};
}
