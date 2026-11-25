export const LINEAR_SERVICES = ["RTC TOTAL","RCT 1 FACE","RCT 2 FACE","RCT 3 FACE","VID 6","VID 8","VID 10","VID 12","VID 14","BISAUTAGE","BP","COULLAGE VEC"] as const;
export const AREA_SERVICES = ["COULLAGE UV","SABLAGE","ASSEMBLAGE TRANSPARANT","ASSEMBLAGE OPAL","ASSEMBLAGE OPAC","ASSEMBLAGE NOIR","DESSIN"] as const;
export type ServiceLine = { name:string; unit:"ml"|"m²"; quantity:number; unitPrice:number; widthMm?:number; heightMm?:number; pieces?:number; groupId?:string };
export type GlassLine = { label:string; widthMm:number; heightMm:number; quantity:number; pricePerM2:number; groupId?:string };
export type AccessoryLine = { label:string; quantity:number; unitPrice:number };
const normalizedServiceName=(name:string)=>name.trim().toLocaleUpperCase("fr").replace(/[.]/g,"").replace(/\s+/g," ").replace("ASSEMPLAGE","ASSEMBLAGE").replace("RECTILLING","RCT").replace("RCT TOTAL","RTC TOTAL");
export const serviceUnit=(name:string):"ml"|"m²"=>LINEAR_SERVICES.includes(normalizedServiceName(name) as typeof LINEAR_SERVICES[number])?"ml":"m²";
// Cairo Verre adds 20 mm to each entered dimension for area pricing only; entered dimensions remain unchanged.
export const areaM2=(w:number,h:number,q:number)=>(Math.max(0,w)+20)*(Math.max(0,h)+20)*Math.max(0,q)/1_000_000;
export const lineTotal=(q:number,p:number)=>Math.max(0,q)*Math.max(0,p);
export function serviceQuantity(name:string,widthMm:number,heightMm:number,pieces:number):number{
 const w=Math.max(0,widthMm)/1000,h=Math.max(0,heightMm)/1000,q=Math.max(0,pieces),key=normalizedServiceName(name);
 if(key==="RCT 1 FACE")return w*q;
 if(key==="RCT 2 FACE")return (w+h)*q;
 if(key==="RCT 3 FACE")return (2*w+h)*q;
 if(key==="RTC TOTAL")return (2*w+2*h)*q;
 return serviceUnit(name)==="ml"?2*(w+h)*q:areaM2(widthMm,heightMm,pieces);
}
export function serviceQuantityForGlassLines(name:string,lines:GlassLine[]):number{return lines.reduce((sum,line)=>sum+serviceQuantity(name,line.widthMm,line.heightMm,line.quantity),0);}
export function isValidQuote(glass:GlassLine[],services:ServiceLine[],accessories:AccessoryLine[]):boolean{
 const hasLines=glass.length>0||services.length>0||accessories.length>0;
 return hasLines&&glass.every(x=>x.label.trim().length>0&&Number.isFinite(x.widthMm)&&x.widthMm>0&&Number.isFinite(x.heightMm)&&x.heightMm>0&&Number.isFinite(x.quantity)&&x.quantity>0&&Number.isFinite(x.pricePerM2)&&x.pricePerM2>=0)&&services.every(x=>x.name.trim().length>0&&Number.isFinite(x.quantity)&&x.quantity>0&&Number.isFinite(x.unitPrice)&&x.unitPrice>=0)&&accessories.every(x=>x.label.trim().length>0&&Number.isFinite(x.quantity)&&x.quantity>0&&Number.isFinite(x.unitPrice)&&x.unitPrice>=0);
}
export function quoteTotals(glass:GlassLine[],services:ServiceLine[],accessories:AccessoryLine[]){
 const glassTotal=glass.reduce((s,x)=>s+areaM2(x.widthMm,x.heightMm,x.quantity)*x.pricePerM2,0),serviceTotal=services.reduce((s,x)=>s+lineTotal(x.quantity,x.unitPrice),0),accessoryTotal=accessories.reduce((s,x)=>s+lineTotal(x.quantity,x.unitPrice),0),ttc=glassTotal+serviceTotal+accessoryTotal,ht=ttc/1.2;
 return {glassTotal,serviceTotal,accessoryTotal,ttc,ht,tva:ttc-ht};
}
