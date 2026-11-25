export const LINEAR_SERVICES = [
  "RECTILLING TOTAL", "RECTILLING 1 FACE", "RECTILLING 2 FACE",
  "RECTILLING 3 FACE", "VID 6", "VID 8",
] as const;
export type ServiceLine = { name: string; unit: "ml" | "m²"; quantity: number; unitPrice: number };
export type GlassLine = { label: string; widthMm: number; heightMm: number; quantity: number; pricePerM2: number };
export type AccessoryLine = { label: string; quantity: number; unitPrice: number };
export const serviceUnit = (name: string): "ml" | "m²" => LINEAR_SERVICES.includes(name as typeof LINEAR_SERVICES[number]) ? "ml" : "m²";
export const areaM2 = (w: number, h: number, q: number) => Math.max(0,w)*Math.max(0,h)*Math.max(0,q)/1_000_000;
export const lineTotal = (q: number, p: number) => Math.max(0,q)*Math.max(0,p);
export function isValidQuote(glass: GlassLine[], services: ServiceLine[], accessories: AccessoryLine[]): boolean {
  const hasLines = glass.length > 0 || services.length > 0 || accessories.length > 0;
  return hasLines
    && glass.every(x => x.label.trim().length > 0 && Number.isFinite(x.widthMm) && x.widthMm > 0 && Number.isFinite(x.heightMm) && x.heightMm > 0 && Number.isFinite(x.quantity) && x.quantity > 0 && Number.isFinite(x.pricePerM2) && x.pricePerM2 >= 0)
    && services.every(x => x.name.trim().length > 0 && Number.isFinite(x.quantity) && x.quantity > 0 && Number.isFinite(x.unitPrice) && x.unitPrice >= 0)
    && accessories.every(x => x.label.trim().length > 0 && Number.isFinite(x.quantity) && x.quantity > 0 && Number.isFinite(x.unitPrice) && x.unitPrice >= 0);
}
export function quoteTotals(glass: GlassLine[], services: ServiceLine[], accessories: AccessoryLine[]) {
  const glassTotal = glass.reduce((s,x)=>s+areaM2(x.widthMm,x.heightMm,x.quantity)*x.pricePerM2,0);
  const serviceTotal = services.reduce((s,x)=>s+lineTotal(x.quantity,x.unitPrice),0);
  const accessoryTotal = accessories.reduce((s,x)=>s+lineTotal(x.quantity,x.unitPrice),0);
  const ttc=glassTotal+serviceTotal+accessoryTotal, ht=ttc/1.2;
  return {glassTotal,serviceTotal,accessoryTotal,ttc,ht,tva:ttc-ht};
}
