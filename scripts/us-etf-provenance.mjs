// Bounded writer-only encoding. Readers never decode or traverse source evidence.
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const MAX_SOURCE_BYTES=12_000_000;
export const MAX_EXPANDED_PROVENANCE_BYTES=24_000_000;
const sha=text=>createHash('sha256').update(text).digest('hex');
export function provenanceText(value){
 let text;
 if(Array.isArray(value))text=JSON.stringify(value);
 else{
  if(!value||value.encoding!=='gzip-base64-v1'||typeof value.data!=='string'||value.data.length>1_500_000||!/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)||!Number.isInteger(value.bytes)||value.bytes<2||value.bytes>MAX_SOURCE_BYTES||!/^[a-f0-9]{64}$/.test(value.sha256))throw Error('Invalid compressed ETF provenance');
  const compressed=Buffer.from(value.data,'base64');
  if(compressed.toString('base64')!==value.data)throw Error('Noncanonical ETF provenance encoding');
  // Bound actual decompression by the verified declaration, not a large global
  // limit, so a small claimed record cannot expand as a compressed-data bomb.
  const raw=gunzipSync(compressed,{maxOutputLength:value.bytes});
  if(raw.byteLength!==value.bytes||sha(raw)!==value.sha256)throw Error('ETF provenance integrity mismatch');
  text=new TextDecoder('utf-8',{fatal:true}).decode(raw);
  if(!Array.isArray(JSON.parse(text)))throw Error('ETF provenance must be source references');
 }
 if(Buffer.byteLength(text)>MAX_SOURCE_BYTES)throw Error('Expanded ETF provenance exceeds byte budget');
 return text;
}
export function compactProvenance(history){
 let bytes=0;
 return Object.fromEntries(Object.entries(history).map(([date,value])=>{
  const text=provenanceText(value),length=Buffer.byteLength(text);bytes+=length;
  if(bytes>MAX_EXPANDED_PROVENANCE_BYTES)throw Error('Expanded ETF history provenance exceeds byte budget');
  return [date,Array.isArray(value)?{encoding:'gzip-base64-v1',bytes:length,sha256:sha(text),data:gzipSync(text).toString('base64')}:value];
 }));
}

/** Exact reviewed compressed input boundary, used only by the controlled CLI. */
export function reviewedHistoryInputs(bytes, { inputSha256, gzipSha256, expandedBytes }) {
 if (!Buffer.isBuffer(bytes) || !/^[a-f0-9]{64}$/.test(inputSha256 ?? '') || !Number.isInteger(expandedBytes) || expandedBytes < 2 || expandedBytes > 12_000_000) throw Error('Reviewed input SHA and exact expansion size required');
 let raw=bytes;
 if (gzipSha256 !== undefined) {
  if (!/^[a-f0-9]{64}$/.test(gzipSha256) || bytes.length > 2_000_000 || sha(bytes) !== gzipSha256) throw Error('Reviewed gzip input hash or size mismatch');
  raw=gunzipSync(bytes,{maxOutputLength:expandedBytes});
 }
 if (raw.length !== expandedBytes || sha(raw) !== inputSha256) throw Error('Reviewed expanded input hash or size mismatch');
 const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
 if (!Array.isArray(result) || result.length<1 || result.length>44) throw Error('Bounded reviewed history input array required');
 return result;
}
