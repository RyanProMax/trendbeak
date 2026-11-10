// Explicit reviewed historical-carrying residuals, not a generic preferred-stock
// valuation model. Original meaning is supplied by exact independent proof roots.
import {reportedDecimal}from'./us-etf-reported-arithmetic.mjs';
import {reportedHash,reportedCanonical}from'./us-etf-reported-candidate.mjs';
export const REPORTED_CARRYING_PROOFS=Object.freeze({
 HPE:{cik:'1645590',asOf:'2026-04-30',parent:'25292000000',preferred:'1462000000',common:'23830000000',sha256:'11dfdad0c4939842974af9b328826c1a7adb2c6972b038be9fcace05fe5e8779',bytes:456110,tables:'equityRollforwardTables',bridges:'allAPICBridges',movements:'movements',preferredField:'preferredCarryingUSD',issuanceFact:'netPreferredAccountingContribution'},
 LITE:{cik:'1633978',asOf:'2026-03-28',parent:'2973400000',preferred:'1999700000',common:'973700000',sha256:'6e863648f62cc414b35b24a0798759dea59664afb20031beb88493438810069d',bytes:212674,tables:'completeEquityRollforwardTables',bridges:'completeAPICBridges',movements:'originalMovements',preferredField:'preferredNetAccountingContributionUSD',issuanceFact:'netIssuanceAPICFact'},
 MCHP:{cik:'827054',asOf:'2026-03-31',parent:'6432400000',preferred:'1449500000',common:'4982900000',sha256:'af028baa456ba74cf5e30a099db925718fd1d473d57a094d46d6f614a0dd0c04',bytes:204106,tables:'fullEquityRollforward',bridges:'completeAPICBridges',movements:'allOriginalAPICMovements',preferredField:'preferredHistoricalNetAccountingContributionUSD',issuanceFact:'netIssuanceOriginalFact'},
});
const eq=(a,b)=>{a=reportedDecimal(a);b=reportedDecimal(b);return a.n*b.d===b.n*a.d;};
const signed=(v,op)=>op===1?v:v.startsWith('-')?v.slice(1):'-'+v;
const sums=(values,target)=>{const a=values.map(reportedDecimal).reduce((a,b)=>({n:a.n*b.d+b.n*a.d,d:a.d*b.d}),{n:0n,d:1n}),b=reportedDecimal(target);return a.n*b.d===b.n*a.d;};
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const apic=f=>Array.isArray(f?.members)&&f.members.some(m=>m.axis==='us-gaap:StatementEquityComponentsAxis'&&m.member==='us-gaap:AdditionalPaidInCapitalMember');
const hash=x=>reportedHash(Buffer.from(reportedCanonical(x)));
function usdFact(f,cik,manifest){if(!f||Number(f.entityCIK)!==Number(cik)||!Array.isArray(f.unit)||f.unit.length!==1||f.unit[0]!=='iso4217:USD'||typeof f.url!=='string'||!f.url.startsWith('https://www.sec.gov/Archives/edgar/data/'+Number(cik)+'/')||!manifest.has(f.sha256)||typeof f.xpath!=='string'||!f.xpath||typeof f.factHTML!=='string'||!f.factHTML)throw Error('Exact original issuer USD fact required');reportedDecimal(f.value);}
/** A mechanical full-APIC inventory check; this does not approve proof meaning.
 * Signed original values are retained, including a negative reduction concept. */
export function verifyReportedAPICRollforwards({bridges,tables,movementKey,cik,asOf,sourceManifest}){
 if(!Array.isArray(bridges)||!bridges.length||bridges.length>8||!Array.isArray(tables)||!tables.length||tables.length>8)throw Error('Bounded complete rollforward sequence required');
 const all=tables.flatMap(t=>{if(!Array.isArray(t.originalFacts)||t.originalFacts.length>600||!sourceManifest.has(t.sha256))throw Error('Original complete equity table required');return t.originalFacts;});
 const movements=[];
 for(let i=0;i<bridges.length;i++){
  const b=bridges[i],flows=b[movementKey];
  if(!day(b.start)||!day(b.end)||b.start>b.end||!Array.isArray(flows)||!flows.length||flows.length>80||i&&(Date.parse(b.start)-Date.parse(bridges[i-1].end)!==86400000||!eq(b.openingAPIC,bridges[i-1].closingAPIC)))throw Error('Complete contiguous APIC periods required');
  const raw=all.filter(f=>apic(f)&&f.start===b.start&&f.end===b.end);
  if(raw.length!==flows.length)throw Error('Every original APIC movement must be included exactly once');
  const inventory=new Set(raw.map(hash));if(inventory.size!==raw.length)throw Error('Duplicate original APIC movement');
  for(const m of flows){if(![1,-1].includes(m.operator)||!inventory.delete(hash(m.fact)))throw Error('Movement missing, duplicated or changed from original table');usdFact(m.fact,cik,sourceManifest);movements.push(m);}
  if(inventory.size||!sums([b.openingAPIC,...flows.map(m=>signed(m.fact.value,m.operator))],b.closingAPIC))throw Error('Original signed APIC rollforward does not reconcile');
  const prior=new Date(Date.parse(b.start)-86400000).toISOString().slice(0,10);
  for(const [date,value]of [[prior,b.openingAPIC],[b.end,b.closingAPIC]]){const balances=all.filter(f=>apic(f)&&f.start===null&&f.end===date);if(!balances.length||balances.some(f=>!eq(f.value,value)))throw Error('Original opening or closing APIC balance mismatch');for(const f of balances)usdFact(f,cik,sourceManifest);}
 }
 if(bridges.at(-1).end!==asOf)throw Error('Historical preferred carrying bridge must reach the observed book date');
 return {movements,tableFacts:all};
}
export function verifyReportedCarryingProof({issuer,proofBytes,sourceManifest}){
 const expected=REPORTED_CARRYING_PROOFS[issuer?.symbol],b=issuer?.commonBook;
 if(!expected||issuer.issuerId!==expected.cik||!b||b.asOf!==expected.asOf||b.basis!=='derived_historical_carrying_residual'||b.derivedHistoricalCarryingResidual!==true||b.notFairValueOrLiquidationPreference!==true||!eq(b.parentEquity,expected.parent)||!eq(b.preferredCarryingDeducted,expected.preferred)||!eq(b.value,expected.common)||!sums([b.value,b.preferredCarryingDeducted],b.parentEquity)||b.historicalCarryingProofRef?.sha256!==expected.sha256||b.historicalCarryingProofRef.bytes!==expected.bytes||!sourceManifest.has(expected.sha256)||!Buffer.isBuffer(proofBytes)||proofBytes.length!==expected.bytes||reportedHash(proofBytes)!==expected.sha256)throw Error('Exact reviewed issuer/date/carrying proof required');
 const p=JSON.parse(proofBytes);
 if(p.kind!=='derived_historical_carrying_common_book'||!eq(p.reportedParentEquityUSD,b.parentEquity)||!eq(p[expected.preferredField],b.preferredCarryingDeducted)||!eq(p.derivedCommonBookUSD,b.value))throw Error('Historical carrying residual is inconsistent with its proof');
 const tables=Array.isArray(p[expected.tables])?p[expected.tables]:[p[expected.tables]];
 const {movements,tableFacts}=verifyReportedAPICRollforwards({bridges:p[expected.bridges],tables,movementKey:expected.movements,cik:expected.cik,asOf:b.asOf,sourceManifest});
 const issuance=p[expected.issuanceFact];usdFact(issuance,expected.cik,sourceManifest);
 if(!eq(issuance.value,b.preferredCarryingDeducted)||!movements.some(m=>m.operator===1&&hash(m.fact)===hash(issuance)))throw Error('Net preferred contribution must be the exact original APIC movement');
 const closing=tableFacts.filter(f=>f.start===null&&f.end===b.asOf&&(issuer.symbol==='HPE'?f.members?.some(m=>m.member==='us-gaap:ParentMember'):Array.isArray(f.members)&&f.members.length===0));
 if(!closing.length||closing.some(f=>!eq(f.value,b.parentEquity)))throw Error('Original closing parent book mismatch');for(const f of closing)usdFact(f,expected.cik,sourceManifest);
 if(issuer.symbol==='HPE'&&(p.noSecondDeductionForPreferredDividends!==true||p.preferredCashDividendsAlreadyReduceRetainedEarnings!==true||p.sourceIXConflict?.status===undefined))throw Error('HPE carrying/IX conflict boundary missing');
 if(issuer.symbol==='LITE'&&(p.historicalPreferredContributionUnchangedThroughClosing!==true||p.notGrossPurchasePrice2000000000!==true||p.notZeroBecauseParRoundsZero!==true))throw Error('LITE historical carrying boundary missing');
 if(issuer.symbol==='MCHP'&&(p.noPreferredConversionAddedToCommon!==true||p.noLiquidationPreference1485000000UsedAsCarrying!==true||p.cashDividendsAlreadyInRetainedNotDeductedAgain!==true||p.commonSecurityIsNotADROfPreferred!==true))throw Error('MCHP preferred/depositary/carrying boundary missing');
 return {proofSha256:expected.sha256,parentBook:b.parentEquity,preferredCarrying:b.preferredCarryingDeducted,commonBook:b.value,derived:true,sourceApprovalPerformed:false};
}
