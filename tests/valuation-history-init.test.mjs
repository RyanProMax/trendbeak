import{DatabaseSync}from'node:sqlite';
import test from'node:test';import assert from'node:assert/strict';import{mkdtemp,writeFile,readFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';
import{initializeValuationHistory}from'../scripts/valuation-history-init.mjs';import{initializeEfunds}from'../scripts/efunds-valuations.mjs';import{VALUATIONS}from'../scripts/overview-job.mjs';
test('dedicated migration validates all keys before one atomic CAS and requires backup',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'valuation-init-')),saved=new Map(),writes=[];try{
 for(const[code,name]of VALUATIONS){const rows=Array.from({length:80},(_,i)=>({trdCode:code,trdDt:new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),pBLf:1+i/100,pSTtm:2})),c=initializeEfunds({code,name,url:`https://cdn.efunds.com.cn/etf-net/index_valuation_percentile_${code}.json`},rows,'"x"','2026-11-08').checkpoint;await writeFile(`${directory}/${code}.json`,JSON.stringify(rows));await writeFile(`${directory}/valuation-${code}-state.json`,JSON.stringify(c));const old={...c};delete old.history;delete old.sourceStart;saved.set('valuation/'+code,{payload:JSON.stringify(old),updated_at:'2026-11-08T00:00:00.000Z'});}
 const db={prepare(sql){return{bind(...params){return{all:async()=>({success:true,results:[saved.get(params[0])]}),run:async()=>{writes.push({sql,params});return{success:true,meta:{changes:12}};}};}};}};
 const options={db,directory,today:'2026-11-08'};assert.equal((await initializeValuationHistory(options)).keys,12);assert.equal(writes.length,0);
 await assert.rejects(initializeValuationHistory({...options,dryRun:false}),/backup/);assert.equal(writes.length,0);
 const backup=join(directory,'backup.json');assert.equal((await initializeValuationHistory({...options,dryRun:false,backup})).writes,12);assert.equal(writes.length,1);assert.match(writes[0].sql,/AS MATERIALIZED/);assert.equal(JSON.parse(await readFile(backup)).length,12);
 const sqlite=new DatabaseSync(':memory:');try{sqlite.exec('CREATE TABLE market_snapshot(key TEXT PRIMARY KEY,payload TEXT,updated_at TEXT)');for(const[key,row]of saved)sqlite.prepare('INSERT INTO market_snapshot VALUES(?,?,?)').run(key,row.payload,row.updated_at);const statement=sqlite.prepare(writes[0].sql);assert.equal(statement.run(...writes[0].params).changes,12);assert.equal(statement.run(...writes[0].params).changes,0);for(const[key,row]of saved)sqlite.prepare('UPDATE market_snapshot SET payload=?,updated_at=? WHERE key=?').run(row.payload,row.updated_at,key);sqlite.prepare('UPDATE market_snapshot SET updated_at=? WHERE key=?').run('changed','valuation/399005');assert.equal(statement.run(...writes[0].params).changes,0);assert.equal(sqlite.prepare('SELECT payload FROM market_snapshot WHERE key=?').get('valuation/000300').payload,saved.get('valuation/000300').payload);}finally{sqlite.close();}
 const changed=JSON.parse(saved.get('valuation/399005').payload);changed.rows[0][1]=9;changed.pb=changed.rows.map(r=>r[1]).sort((a,b)=>a-b);saved.get('valuation/399005').payload=JSON.stringify(changed);await assert.rejects(initializeValuationHistory(options),/Source inconsistency/);assert.equal(writes.length,1);
 }finally{await rm(directory,{recursive:true});}
});
test('migration rejects a self-consistent candidate missing the eleventh year before any database access',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'valuation-truncated-'));try{
 const code='000300',raw=[];for(let t=Date.parse('2015-01-01');t<=Date.parse('2026-01-01');t+=86400000){const d=new Date(t);if(d.getUTCDay()%6===0)continue;raw.push({trdCode:code,trdDt:d.toISOString().slice(0,10),pBLf:1+raw.length/10000,pSTtm:2});}
 const detail={code,name:'Test',url:`https://cdn.efunds.com.cn/etf-net/index_valuation_percentile_${code}.json`},full=initializeEfunds(detail,raw,'"x"','2026-01-01').checkpoint,truncated=initializeEfunds(detail,raw.filter(r=>r.trdDt>='2016-01-01'),'"x"','2026-01-01').checkpoint;truncated.sourceStart=full.sourceStart;
 assert.deepEqual(full.pb,truncated.pb);assert.deepEqual(full.ps,truncated.ps);assert.notDeepEqual(full.history,truncated.history);
 await writeFile(`${directory}/${code}.json`,JSON.stringify(raw));await writeFile(`${directory}/valuation-${code}-state.json`,JSON.stringify(truncated));
 let reads=0;await assert.rejects(initializeValuationHistory({directory,today:'2026-01-01',db:{prepare(){reads++;throw Error('Must not query');}}}),/differs from saved full-source/);assert.equal(reads,0);
 }finally{await rm(directory,{recursive:true});}
});
