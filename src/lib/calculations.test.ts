import test from "node:test";
import assert from "node:assert/strict";
import {areaM2,quoteTotals,serviceUnit,LINEAR_SERVICES,isValidQuote,serviceQuantity,serviceQuantityForGlassLines} from "./calculations";
test("adds 20 mm to width and height for area pricing only",()=>{assert.equal(areaM2(1000,2000,2),4.1208);assert.equal(areaM2(1120,2065,4),9.5076);});
test("recognizes all linear services and area services",()=>{
 assert.equal(LINEAR_SERVICES.length,12); for(const n of LINEAR_SERVICES)assert.equal(serviceUnit(n),"ml");
 for(const n of ["COULLAGE UV","SABLAGE","ASSEMBLAGE TRANSPARANT","ASSEMBLAGE OPAL","ASSEMBLAGE OPAC","ASSEMBLAGE NOIR","DESSIN"])assert.equal(serviceUnit(n),"m²");
 assert.equal(serviceUnit("ASSEMPLAGE NOIR"),"m²"); assert.equal(serviceUnit("VID 10"),"ml");
});
test("automatically calculates perimeter and RCT edges",()=>{
 assert.equal(serviceQuantity("BISAUTAGE",1200,1200,5),24);assert.equal(serviceQuantity("BP",1200,1200,5),24);assert.equal(serviceQuantity("VID 8",1200,1200,5),24);
 assert.equal(serviceQuantity("RCT 1 FACE",1200,1200,5),6);assert.equal(serviceQuantity("RCT 2 FACE",1200,1200,5),12);assert.equal(serviceQuantity("RCT 3 FACE",1200,1200,5),18);assert.equal(serviceQuantity("RTC TOTAL",1200,1200,5),24);
 assert.equal(serviceQuantity("ASSEMBLAGE NOIR",1200,1200,5),7.442);
});
test("calculates TTC totals, HT and TVA",()=>{
 const x=quoteTotals([{label:"Verre",widthMm:1000,heightMm:2000,quantity:1,pricePerM2:100}],[{name:"VID 6",unit:"ml",quantity:3,unitPrice:20}],[{label:"Poignée",quantity:2,unitPrice:15}]);
 assert.equal(x.glassTotal,206.04);assert.equal(x.serviceTotal,60);assert.equal(x.accessoryTotal,30);assert.ok(Math.abs(x.ttc-296.04)<1e-9);assert.ok(Math.abs(x.ht-296.04/1.2)<1e-9);assert.ok(Math.abs(x.tva-(296.04-296.04/1.2))<1e-9);
});
test("accepts accessory-only and service-only quotes",()=>{
 assert.equal(isValidQuote([],[],[{label:"Poignée",quantity:2,unitPrice:15}]),true);assert.equal(isValidQuote([],[],[]),false);
 assert.equal(isValidQuote([{label:"Verre",widthMm:0,heightMm:1000,quantity:1,pricePerM2:100}],[],[]),false);assert.equal(isValidQuote([],[{name:"VID 6",unit:"ml",quantity:1,unitPrice:20}],[]),true);
});

test("aggregates service quantities across several sizes within one glass group",()=>{
 const lines=[{label:"CLAIR 4",widthMm:1200,heightMm:1500,quantity:5,pricePerM2:0,groupId:"clair"},{label:"CLAIR 4",widthMm:800,heightMm:800,quantity:10,pricePerM2:0,groupId:"clair"},{label:"CLAIR 4",widthMm:1500,heightMm:2100,quantity:12,pricePerM2:0,groupId:"clair"}];
 assert.ok(Math.abs(serviceQuantityForGlassLines("SABLAGE",lines)-(5*1.22*1.52+10*.82*.82+12*1.52*2.12))<1e-9);
 assert.ok(Math.abs(serviceQuantityForGlassLines("BP",lines)-(5*2*(1.2+1.5)+10*2*(.8+.8)+12*2*(1.5+2.1)))<1e-9);
 const trempe=[{label:"TREMPE 6",widthMm:900,heightMm:900,quantity:7,pricePerM2:0,groupId:"trempe"},{label:"TREMPE 6",widthMm:1200,heightMm:1300,quantity:10,pricePerM2:0,groupId:"trempe"}];
 assert.ok(Math.abs(serviceQuantityForGlassLines("SABLAGE",trempe)-(7*.92*.92+10*1.22*1.32))<1e-9);
});
