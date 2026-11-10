import test from'node:test';import assert from'node:assert/strict';import{verifyReportedAPICRollforwards}from'../scripts/us-etf-reported-carrying.mjs';
const sha='a'.repeat(64),members=[{axis:'us-gaap:StatementEquityComponentsAxis',member:'us-gaap:AdditionalPaidInCapitalMember'}];
const fact=(value,start,end,id)=>({entityCIK:'123',unit:['iso4217:USD'],url:'https://www.sec.gov/Archives/edgar/data/123/x/a.htm',sha256:sha,xpath:'/table/'+id,factHTML:'<f>'+value+'</f>',value,start,end,members});
function fixture(){const flow=fact('-2','2026-01-01','2026-03-31','movement');return {bridges:[{start:'2026-01-01',end:'2026-03-31',openingAPIC:'100',closingAPIC:'102',movements:[{operator:-1,fact:flow}]}],tables:[{sha256:sha,originalFacts:[fact('100',null,'2025-12-31','open'),flow,fact('102',null,'2026-03-31','close')]}],movementKey:'movements',cik:'123',asOf:'2026-03-31',sourceManifest:new Map([[sha,{}]])};}
test('historical carrying rollforward retains original negative reduction sign',()=>{assert.equal(verifyReportedAPICRollforwards(fixture()).movements.length,1);});
test('omitted, duplicated, unsigned, foreign, unbounded or discontinuous APIC facts cannot form a bridge',()=>{for(const change of [
 f=>f.bridges[0].movements=[],f=>f.tables[0].originalFacts.push(f.tables[0].originalFacts[1]),f=>f.bridges[0].movements[0].operator=1,
 f=>f.tables[0].originalFacts[1].value='2',f=>f.tables[0].originalFacts[1].entityCIK='456',f=>f.tables[0].originalFacts[1].unit=['shares'],
 f=>f.sourceManifest.clear(),f=>f.bridges[0].openingAPIC='99',f=>f.bridges[0].closingAPIC='100',f=>f.asOf='2026-04-30',
 f=>f.tables[0].originalFacts.splice(0,1),f=>f.bridges.push({...f.bridges[0],start:'2026-04-02',end:'2026-06-30'}),
 ]){const f=fixture();change(f);assert.throws(()=>verifyReportedAPICRollforwards(f));}});
