export const DRAM_METHOD='dram-conditional-equity-risk-v2.0.0-ncsrs-fed-reference';
export const DRAM_SOURCE_VERSION='DRAM_20260630_NCSRS_000113322826012187_FED_H10_20260706_v1';
export const DRAM_SOURCE='sec_ncsrs_fed_conditional_holdings';
export const DRAM_KEY='valuation/US/holdings/DRAM/NCSRS-FED-v2';
export const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export function validReading(r,selected,codes){
 if(!day(selected)||r?.code!=='DRAM'||r.seriesId!=='S000102337'||r.methodVersion!==DRAM_METHOD||r.sourceVersion!==DRAM_SOURCE_VERSION||!day(r.economicDate)||r.economicDate>selected||!day(r.priceDate)||r.priceDate!==r.economicDate||!day(r.holdingsKnownAt)||r.holdingsKnownAt<r.economicDate||r.holdingsKnownAt>selected||r.assumptions?.swapCoefficient!==1)return false;
 const items=r.assumptions.items;if(!Array.isArray(items)||items.length===0||items.length>100||new Set(items.map(canonical)).size!==items.length)return false;
 for(const a of items){if(a?.code==='fund_fx_interpretation'||!Object.hasOwn(codes,a?.code)||!['fund','issuer'].includes(a.scope)||a.scope!==codes[a.code].scope||a.scope==='issuer'&&(typeof a.issuerIsin!=='string'||a.issuerIsin.length>32||!a.issuerIsin||typeof a.issuerName!=='string'||!a.issuerName||a.issuerName.length>160)||a.scope==='fund'&&(a.issuerIsin!==undefined||a.issuerName!==undefined)||Object.keys(a).some(k=>!['code','scope','issuerIsin','issuerName'].includes(k)))return false;}
 for(const k of ['pb','ps']){const m=r.metrics?.[k];if(!m||typeof m.complete!=='boolean'||!(m.value===null||typeof m.value==='number'&&Number.isFinite(m.value)&&m.value>0)||m.percentile!==undefined)return false;
 if(m.complete){if(!day(m.knownAt)||m.knownAt<r.holdingsKnownAt||m.knownAt>selected)return false;}else if(m.value!==null||m.knownAt!==null)return false;}
 return true;
}
export function validatePrepared(p,codes,kind='real_source_bound',date='9999-12-31'){
 if(p?.source!==DRAM_SOURCE||p.datasetKind!==kind||! /^[a-f0-9]{64}$/.test(p.inputSha256)||! /^[a-f0-9]{64}$/.test(p.assumptionsSha256)||!validReading(p.reading,date,codes)||BufferBytes(canonical(p))>16384)throw Error('Invalid prepared DRAM identity, dates or assumptions');
 return p;
}
const BufferBytes=s=>new TextEncoder().encode(s).byteLength;
export function validateAdmission(entries,codes,kind='real_source_bound'){
 if(!Array.isArray(entries)||entries.length>80)throw Error('Invalid DRAM admission');
 const seen=new Set();for(const e of entries){if(typeof e.preparedJSON!=='string'||BufferBytes(e.preparedJSON)>16384)throw Error('Invalid DRAM admission');const p=validatePrepared(JSON.parse(e.preparedJSON),codes,kind);if(canonical(p)!==e.preparedJSON||p.inputSha256!==e.inputSha256||seen.has(e.inputSha256))throw Error('Conflicting DRAM admission');seen.add(e.inputSha256);}
}
export function admitted(p,entries){return entries.some(e=>e.inputSha256===p.inputSha256&&e.preparedJSON===canonical(p));}
export function validateState(state,entries,codes,kind='real_source_bound'){
 if(state?.source!==DRAM_SOURCE||state.methodVersion!==DRAM_METHOD||state.datasetKind!==kind||!Array.isArray(state.observations)||state.observations.length>40||BufferBytes(canonical(state))>65536)throw Error('Invalid DRAM checkpoint');
 const dates=new Set();for(const p of state.observations){validatePrepared(p,codes,kind);if(dates.has(p.reading.economicDate))throw Error('Duplicate or conflicting DRAM quarter');dates.add(p.reading.economicDate);if(!admitted(p,entries))throw Error('Unapproved or modified DRAM projection');}
 return state;
}
