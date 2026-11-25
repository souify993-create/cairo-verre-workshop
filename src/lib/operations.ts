import type { PaymentMethod } from "./ledger";

export type ExpenseCategory = "Loyer" | "Eau" | "Électricité" | "Maintenance" | "Carburant" | "Autres";
export type ExpenseFrequency = "Jour" | "Semaine" | "Mois" | "Année";
export type ExpenseRecord = {
  id: string;
  name: string;
  category: ExpenseCategory;
  amount: number;
  frequency: ExpenseFrequency;
  paymentMethod: PaymentMethod;
  startDate: string;
  endDate?: string;
};
export type OperationalMovement = {
  orderId: string;
  reference: string;
  method: PaymentMethod;
  direction: "Sortie";
  amount: number;
  kind: "Dépense";
  counterparty: string;
  date: string;
};

const divisor: Record<ExpenseFrequency, number> = { Jour: 1, Semaine: 6, Mois: 30, Année: 365 };
const validDate = (value: string) => {\n  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;\n  const [year, month, day] = value.split("-").map(Number);\n  const date = new Date(Date.UTC(year, month - 1, day));\n  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;\n};
export function dailyExpenseAmount(expense: ExpenseRecord): number {
  return Number.isFinite(expense.amount) && expense.amount > 0 ? expense.amount / divisor[expense.frequency] : 0;
}
export function deriveExpenseMovements(expenses: ExpenseRecord[], date: string): OperationalMovement[] {
  if (!validDate(date)) return [];
  return expenses.filter(expense =>
    validDate(expense.startDate) &&
    expense.startDate <= date &&
    (!expense.endDate || (validDate(expense.endDate) && expense.endDate >= date)) &&
    dailyExpenseAmount(expense) > 0
  ).map(expense => ({
    orderId: expense.id,
    reference: expense.name,
    method: expense.paymentMethod,
    direction: "Sortie",
    amount: dailyExpenseAmount(expense),
    kind: "Dépense",
    counterparty: expense.category,
    date,
  }));
}
