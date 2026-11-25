import test from "node:test";
import assert from "node:assert/strict";
import {areaM2,quoteTotals,serviceUnit,LINEAR_SERVICES,isValidQuote,serviceQuantity} from "./calculations";
test("converts millimetres to square metres and applies quantity",()=>assert.equal(areaM2(1000,2000,2),4));
test("recognizes all linear services and area services",()=>{
 assert.equal(LINEAR_SERVICES.length,12); for(const n of LINEAR_SERVICES)assert.equal(serviceUnit(n),"ml");
 for(const n of ["COULLAGE UV","SABLAGE","ASSEMBLAGE TRANSPARANT","ASSEMBLAGE OPAL","ASSEMBLAGE OPAC","ASSEMBLAGE NOIR","DESSIN"])assert.equal(serviceUnit(n),"m²");
 assert.equal(serviceUnit("ASSEMPLAGE NOIR"),"m²"); assert.equal(serviceUnit("VID 10"),"ml");
});
test("automatically calculates perimeter and RCT edges",()=>{
 assert.equal(serviceQuantity("BISAUTAGE",1200,1200,5),24);assert.equal(serviceQuantity("BP",1200,1200,5),24);assert.equal(serviceQuantity("VID 8",1200,1200,5),24);
 assert.equal(serviceQuantity("RCT 1 FACE",1200,1200,5),6);assert.equal(serviceQuantity("RCT 2 FACE",1200,1200,5),12);assert.equal(serviceQuantity("RCT 3 FACE",1200,1200,5),18);assert.equal(serviceQuantity("RTC TOTAL",1200,1200,5),24);
 assert.equal(serviceQuantity("ASSEMBLAGE NOIR",1200,1200,5),7.2);
});
test("calculates TTC totals, HT and TVA",()=>{
 const x=quoteTotals([{label:"Verre",widthMm:1000,heightMm:2000,quantity:1,pricePerM2:100}],[{name:"VID 6",unit:"ml",quantity:3,unitPrice:20}],[{label:"Poignée",quantity:2,unitPrice:15}]);
 assert.equal(x.glassTotal,200);assert.equal(x.serviceTotal,60);assert.equal(x.accessoryTotal,30);assert.equal(x.ttc,290);assert.equal(x.ht,290/1.2);assert.equal(x.tva,290-290/1.2);
});
test("accepts accessory-only and service-only quotes",()=>{
 assert.equal(isValidQuote([],[],[{label:"Poignée",quantity:2,unitPrice:15}]),true);assert.equal(isValidQuote([],[],[]),false);
 assert.equal(isValidQuote([{label:"Verre",widthMm:0,heightMm:1000,quantity:1,pricePerM2:100}],[],[]),false);assert.equal(isValidQuote([],[{name:"VID 6",unit:"ml",quantity:1,unitPrice:20}],[]),true);
});
