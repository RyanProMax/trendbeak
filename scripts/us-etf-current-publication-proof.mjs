// Explicit read-only D1 verification. Creates a local proof, never writes D1.
import{createHash}from'node:crypto';import{writeFile}from'node:fs/promises';import{pathToFileURL}from'node:url';
import approved from'../data/us-etf-current-approved-inputs.json' with {type:'json'};
import{prepareCurrentSnapshot,CURRENT_BASKET_KEY}from'./us-etf-current-snapshot.mjs';import{connectD1}from'./d1-client.mjs';
export async function proveCurrentPublication({db,expectedPayloadSha256,allowlist=approved,now=Date.now()}){
 if(!/^[a-f0-9]{64}$/.test(expectedPayloadSha256??'')||!Number.isFinite(now))throw Error('Exact reviewed payload hash required');
 const result=await db.prepare('SELECT payload,updated_at FROM market_snapshot WHERE key=? LIMIT 1').bind(CURRENT_BASKET_KEY).all();
 if(!result.success||result.results.length!==1)throw Error('Current publication not found');const r=result.results[0];
 if(typeof r.payload!=='string'||Buffer.byteLength(r.payload)>1_800_000||createHash('sha256').update(r.payload).digest('hex')!==expectedPayloadSha256||!Number.isFinite(Date.parse(r.updated_at))||Date.parse(r.updated_at)>now)throw Error('Current readback does not match reviewed payload/version');
 const stored=JSON.parse(r.payload),reproduced=prepareCurrentSnapshot({input:stored.consumed?.input,registry:stored.consumed?.registry,approved:allowlist,now});
 if(reproduced.payload!==r.payload)throw Error('Consumed current input does not reproduce exact checkpoint');
 return{schema:'verified-current-basket-publication-v1',entry:{version:r.updated_at,payloadSha256:expectedPayloadSha256,preparedReading:reproduced.preparedReading,verifiedAt:new Date(now).toISOString()}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const args=process.argv.slice(2),take=k=>{const i=args.indexOf(k);if(i<0)return;const v=args[i+1];args.splice(i,2);return v;};const expectedPayloadSha256=take('--expected-payload-hash'),output=take('--output'),remote=args.includes('--remote');if(!output||args.some(a=>a!=='--remote'))throw Error('Use --expected-payload-hash HASH --output NEWFILE [--remote]');const c=await connectD1(remote);try{const proof=await proveCurrentPublication({db:c.db,expectedPayloadSha256});await writeFile(output,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({output,key:CURRENT_BASKET_KEY,version:proof.entry.version,sourceCalls:0,writes:0,exactReadback:true}));}finally{await c.close();}}
