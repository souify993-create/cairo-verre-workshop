import { areaM2, type GlassLine } from "./calculations";

export type IndependentInvoiceCustomer = {
  name: string;
  phone: string;
  address: string;
  ice: string;
  taxId: string;
};
export type IndependentInvoiceLine = Pick<GlassLine, "label" | "widthMm" | "heightMm" | "quantity"> & {
  weight: number;
  amount: number;
};

export function allocateIndependentInvoiceTotal(
  lines: Array<Pick<GlassLine, "label" | "widthMm" | "heightMm" | "quantity">>,
  totalTTC: number,
): IndependentInvoiceLine[] {
  if (!Number.isFinite(totalTTC) || totalTTC < 0) throw new Error("Le total doit être un montant positif.");
  if (!lines.length) throw new Error("Ajoutez au moins une ligne de vitrage.");
  const weights = lines.map(line => {
    if (!line.label.trim() || !Number.isFinite(line.widthMm) || line.widthMm <= 0 ||
        !Number.isFinite(line.heightMm) || line.heightMm <= 0 ||
        !Number.isFinite(line.quantity) || line.quantity <= 0) {
      throw new Error("Vérifiez la désignation, les dimensions et les quantités.");
    }
    return areaM2(line.widthMm, line.heightMm, line.quantity);
  });
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  if (!(totalWeight > 0)) throw new Error("Impossible de répartir le montant sur des surfaces nulles.");
  const totalCents = Math.round(totalTTC * 100);
  const exactShares = weights.map(weight => totalCents * weight / totalWeight);
  const cents = exactShares.map(Math.floor);
  let remainder = totalCents - cents.reduce((sum, value) => sum + value, 0);
  const largestRemainders = exactShares
    .map((share, index) => ({ index, fraction: share - cents[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < remainder; i++) cents[largestRemainders[i].index]++;
  return lines.map((line, index) => ({ ...line, weight: weights[index], amount: cents[index] / 100 }));
}

export function independentInvoiceNumber(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `FI-${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${String(date.getMilliseconds()).padStart(3, "0")}`;
}
