import approval from '../../data/us-dram-approved-inputs.json';
import codes from '../../data/us-dram-assumptions.json';
import {DRAM_METHOD,DRAM_SOURCE,day,validateAdmission,validatePrepared} from '../lib/dram-contract.mjs';
import {validDRAMEstimate,type DRAMEstimate} from '../lib/us-dram-estimate';
const defaultAdmissionValid=(()=>{try{validateAdmission(approval.entries,codes);return true;}catch{return false;}})();
export async function readDRAMEstimate(date:string,db:D1Database,approved:readonly {inputSha256:string;preparedJSON:string}[]=approval.entries):Promise<DRAMEstimate[]> {
 if(!day(date))throw Error('Invalid DRAM selected date');
 if(approved===approval.entries&&!defaultAdmissionValid)throw Error('Invalid DRAM admission');
 if(approved!==approval.entries)validateAdmission(approved,codes);
 if(!approved.length)return [];
 const result=await db.prepare(`WITH bounded AS MATERIALIZED (
   SELECT CASE WHEN length(CAST(payload AS BLOB))<=65536 AND json_valid(payload) THEN payload ELSE NULL END AS payload
   FROM market_snapshot WHERE key='valuation/US/holdings/DRAM/NCSRS-FED-v2' LIMIT 1
 ), checkpoint AS MATERIALIZED (
   SELECT payload FROM bounded WHERE json_extract(payload,'$.source')=? AND json_extract(payload,'$.methodVersion')=?
   AND json_extract(payload,'$.datasetKind')='real_source_bound' AND json_type(payload,'$.observations')='array' AND json_array_length(payload,'$.observations')<=40
 ), quarters AS MATERIALIZED (
   SELECT value AS observation FROM checkpoint,json_each(checkpoint.payload,'$.observations')
 ), selected AS (
   SELECT observation FROM quarters WHERE json_extract(observation,'$.reading.economicDate')<=?
   AND json_extract(observation,'$.reading.holdingsKnownAt')<=?
   AND ((json_extract(observation,'$.reading.metrics.pb.complete')=1 AND json_extract(observation,'$.reading.metrics.pb.knownAt')<=?)
     OR (json_extract(observation,'$.reading.metrics.ps.complete')=1 AND json_extract(observation,'$.reading.metrics.ps.knownAt')<=?))
   ORDER BY json_extract(observation,'$.reading.economicDate') DESC LIMIT 1
 ) SELECT CASE WHEN length(CAST(observation AS BLOB))<=16384 THEN observation ELSE NULL END AS observation,
   (SELECT count(*) FROM quarters q WHERE json_extract(q.observation,'$.reading.economicDate')=json_extract(selected.observation,'$.reading.economicDate')) AS quarterCount
   FROM selected LIMIT 1`).bind(DRAM_SOURCE,DRAM_METHOD,date,date,date,date).all<{observation:string|null;quarterCount:number}>();
 if(!result.success||result.results.length>1)throw Error('DRAM projection failed');
 if(!result.results.length)return [];
 const entry=result.results[0];if(entry.quarterCount!==1||!entry.observation)throw Error('Duplicate or oversized DRAM quarter');
 if(!approved.some(e=>e.preparedJSON===entry.observation))throw Error('Unapproved or modified DRAM projection');
 const prepared=validatePrepared(JSON.parse(entry.observation),codes);
 const r:DRAMEstimate=prepared.reading,metrics={...r.metrics};
 for(const k of ['pb','ps']as const)if(metrics[k].knownAt!==null&&metrics[k].knownAt!>date)metrics[k]={value:null,knownAt:null,complete:false};
 const projected={...r,metrics};if(!validDRAMEstimate(projected,date)||!Object.values(metrics).some(m=>m.complete))throw Error('Invalid DRAM date projection');
 return [projected];
}
