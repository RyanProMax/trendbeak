export type CurrentBasketMetric={value:number|null;estimated:true;unknownWeight:number;verifiedCoverage:number;excludedWeight:number;percentile:null;rank:null;sourceComparison:null;fieldExceptions:{symbol:string;definition:string;methodVersion:string;weight:number}[]};
export type CurrentBasketReading={code:'XLI';methodVersion:string;priceAsOf:string;financialCutoff:string;priceCloseAt?:string;financialAnchorExpiresOn?:string;sharesMeaning?:string;observedAt:string;preparedAt:string;holdingsAsOf:string;holdingsAvailableAt:string;holdingsLagDays:number;scope:string;isCurrentFundNAV:false;isCurrentFundHoldings:false;historicalRankEligible:false;metrics:{pb:CurrentBasketMetric;ps:CurrentBasketMetric}};
export const DATED_PRICE_ROLL_METHOD='dated-verified-fundamentals-basket-price-revaluation-v1';
const instant=(x:unknown):x is string=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const weight=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
/** A new price day requires new reviewed inputs. This first release is never
 * silently relabelled to the user's selected historical or later date. */
export function validCurrentBasket(r:any,selectedDate:string):r is CurrentBasketReading{
 if(!r||!day(selectedDate)||r.priceAsOf!==selectedDate||r.code!=='XLI'||r.financialCutoff!=='2026-11-06T21:00:00.000Z'||r.holdingsAsOf!=='2026-06-30'||r.holdingsLagDays!==(Date.parse(selectedDate)-Date.parse(r.holdingsAsOf))/86400000||r.isCurrentFundNAV!==false||r.isCurrentFundHoldings!==false||r.historicalRankEligible!==false||r.scope!=='marked_disclosed_equity_basket_excludes_unknown_current_cash_and_liabilities'||!instant(r.observedAt)||!instant(r.preparedAt)||!instant(r.holdingsAvailableAt)||r.observedAt>r.preparedAt||r.holdingsAvailableAt>r.financialCutoff||r.observedAt<r.financialCutoff)return false;
 if(r.methodVersion==='latest-public-holdings-marked-equity-basket-v1'){if(selectedDate!=='2026-11-06'||r.priceCloseAt!==undefined||r.financialAnchorExpiresOn!==undefined||r.sharesMeaning!==undefined)return false;}
 else if(r.methodVersion===DATED_PRICE_ROLL_METHOD){
  if(selectedDate<='2026-11-06'||selectedDate>'2026-11-20'||r.financialAnchorExpiresOn!=='2026-11-20'||r.sharesMeaning!=='dated_actual_reported_shares_estimate_not_current_outstanding'||!instant(r.priceCloseAt)||r.priceCloseAt>r.observedAt)return false;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(r.priceCloseAt)).map(p=>[p.type,p.value]));
  if(`${parts.year}-${parts.month}-${parts.day}`!==selectedDate||`${parts.hour}:${parts.minute}:${parts.second}`!=='16:00:00'||[0,6].includes(new Date(selectedDate+'T12:00Z').getUTCDay()))return false;
 }else return false;
 for(const k of ['pb','ps']as const){const m=r.metrics?.[k];if(!m||m.estimated!==true||m.percentile!==null||m.rank!==null||m.sourceComparison!==null||!weight(m.unknownWeight)||!weight(m.verifiedCoverage)||!weight(m.excludedWeight)||Math.abs(m.verifiedCoverage+m.unknownWeight-1)>1e-12||m.excludedWeight>m.verifiedCoverage||m.value!==null&&(!Number.isFinite(m.value)||m.value<=0||m.unknownWeight>=.02-1e-12)||!Array.isArray(m.fieldExceptions)||m.fieldExceptions.length>2)return false;
  const seen=new Set();for(const e of m.fieldExceptions){if(!e||seen.has(e.symbol)||!weight(e.weight))return false;seen.add(e.symbol);if(e.symbol==='AOS'){if(e.definition!=='one_for_one_conversion_value'||e.methodVersion!=='current-one-for-one-conversion-value-estimate-v1')return false;}else if(k==='ps'&&e.symbol==='DE'){if(e.definition!=='segment_external_revenue_excluding_corporate_other'||e.methodVersion!=='current-segment-external-revenue-estimate-v1')return false;}else return false;}
 }
 return true;
}

export type CurrentBasketView = {mode:'latest'|'historical';date:string};
const day=(v:string)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00.000Z'))&&new Date(v+'T00:00:00.000Z').toISOString().slice(0,10)===v;
/** Display-only carry. This never approves a new price date, source or method.
 * Historical selection stays exact; latest view can retain a reviewed as-of for
 * at most seven calendar days, bounded by both market date and the real clock. */
export function currentBasketForView(r:unknown,view:CurrentBasketView,now=Date.now()):CurrentBasketReading|null{
 if(!view||!['latest','historical'].includes(view.mode)||!day(view.date)||!Number.isFinite(now))return null;
 const row=r as CurrentBasketReading;
 if(!row||!validCurrentBasket(row,row.priceAsOf)||Date.parse(row.preparedAt)>now)return null;
 if(view.mode==='historical')return row.priceAsOf===view.date?row:null;
 const today=new Date(now).toISOString().slice(0,10);
 if(view.date>today||row.priceAsOf>today||row.methodVersion!==DATED_PRICE_ROLL_METHOD&&row.priceAsOf>view.date)return null;
 const age=(Date.parse(today+'T00:00:00Z')-Date.parse(row.priceAsOf+'T00:00:00Z'))/86400000;
 const marketAge=(Date.parse(view.date+'T00:00:00Z')-Date.parse(row.priceAsOf+'T00:00:00Z'))/86400000;
 return age>=0&&age<=7&&(row.methodVersion===DATED_PRICE_ROLL_METHOD||marketAge<=7)?row:null;
}
