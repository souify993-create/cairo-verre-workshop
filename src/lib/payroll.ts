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

export type PayrollCashMovement={orderId:string;reference:string;method:PaymentMethod;direction:"Sortie";amount:number;kind:"Avance salaire"|"Salaire";counterparty:string;date:string};
export function derivePayrollMovements(weeks:PayrollWeek[],employees:Employee[]):PayrollCashMovement[]{
 const output:PayrollCashMovement[]=[];
 for(const employee of employees){
  let advanceDebt=0;
  const employeeWeeks=weeks.filter(w=>w.employeeId===employee.id).sort((a,b)=>a.weekStart.localeCompare(b.weekStart));
  for(const week of employeeWeeks){
   const days=[...week.attendance].sort((a,b)=>a.date.localeCompare(b.date));
   const hours=days.reduce((sum,d)=>sum+nonnegative(d.hours),0);
   const earned=employee.weeklySalary/(6*9)*hours;
   const advances=[...week.advances].sort((a,b)=>a.date.localeCompare(b.date));
   const advanceTotal=advances.reduce((sum,a)=>sum+nonnegative(a.amount),0);
   for(const advance of advances){
    if(advance.amount>0)output.push({orderId:advance.id,reference:week.weekStart,method:"Espèces",direction:"Sortie",amount:nonnegative(advance.amount),kind:"Avance salaire",counterparty:employee.name,date:advance.date});
   }
   const dailySalary=Math.max(0,earned-advanceDebt-advanceTotal);
   if(dailySalary>0&&hours>0){
    const workedDays=days.filter(day=>nonnegative(day.hours)>0);
    let allocated=0;
    workedDays.forEach((day,index)=>{
     const amount=index===workedDays.length-1
      ? Math.round((dailySalary-allocated)*100)/100
      : Math.round((dailySalary*nonnegative(day.hours)/hours)*100)/100;
     allocated+=amount;
     if(amount>0)output.push({orderId:week.id+"-"+day.date,reference:week.weekStart,method:"Espèces",direction:"Sortie",amount,kind:"Salaire",counterparty:employee.name,date:day.date});
    });
   }
   advanceDebt=Math.max(0,advanceDebt+advanceTotal-earned);
  }
 }
 return output;
}

export type PayrollCashOutflow={orderId:string;reference:string;method:PaymentMethod;direction:"Sortie";amount:number;kind:"Avance salaire"|"Règlement salaire";counterparty:string;date:string};
export function derivePayrollCashMovements(weeks:PayrollWeek[],employees:Employee[]):PayrollCashOutflow[]{
 const names=new Map(employees.map(e=>[e.id,e.name]));
 return weeks.flatMap(week=>[
  ...week.advances.map(a=>({orderId:a.id,reference:week.weekStart,method:"Espèces" as const,direction:"Sortie" as const,amount:nonnegative(a.amount),kind:"Avance salaire" as const,counterparty:names.get(week.employeeId)||"Employé",date:a.date})),
  ...week.salaryPayments.map(p=>({orderId:p.id,reference:week.weekStart,method:p.method,direction:"Sortie" as const,amount:nonnegative(p.amount),kind:"Règlement salaire" as const,counterparty:names.get(week.employeeId)||"Employé",date:p.date}))
 ]);
}
