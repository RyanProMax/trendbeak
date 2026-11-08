import test from'node:test';import assert from'node:assert/strict';import{compactProvenance,provenanceText}from'../scripts/us-etf-provenance.mjs';
test('writer provenance compaction preserves exact Unicode evidence and original bytes on repeated runs',()=>{
 const source=[{id:'test',url:'https://example.invalid/filing',evidence:'财报原文 '.repeat(500)}],old={'2026-06-30':source};
 const compressed=compactProvenance(old);assert.equal(provenanceText(compressed['2026-06-30']),JSON.stringify(source));assert.ok(JSON.stringify(compressed).length<JSON.stringify(old).length/5);assert.deepEqual(compactProvenance(compressed),compressed);assert.equal(provenanceText(source),JSON.stringify(source));
});
test('corrupt hash, length, format and compressed bytes are rejected before source use',()=>{
 const base=compactProvenance({'2026-06-30':[{id:'test',url:'https://example.invalid'}]})['2026-06-30'];
 for(const mutate of [x=>x.sha256='0'.repeat(64),x=>x.bytes++,x=>x.encoding='other',x=>x.data='garbage',x=>x.bytes=12_000_001]){const bad=structuredClone(base);mutate(bad);assert.throws(()=>provenanceText(bad));}
});

test('declared decompressed byte limit is enforced before decoding; invalid UTF-8 and aggregate evidence overflow fail closed',async()=>{
 const{gzipSync}=await import('node:zlib'),{createHash}=await import('node:crypto');
 const encode=raw=>({encoding:'gzip-base64-v1',bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex'),data:gzipSync(raw).toString('base64')});
 const bomb=encode(Buffer.from(JSON.stringify(['a'.repeat(100000)])));bomb.bytes=10;assert.throws(()=>provenanceText(bomb));
 const badUTF8=encode(Buffer.from([91,34,255,34,93]));assert.throws(()=>provenanceText(badUTF8));
 const source=[{id:'test',url:'https://example.invalid',evidence:'x'.repeat(8000000)}],one=compactProvenance({'2026-06-30':source})['2026-06-30'];
 assert.throws(()=>compactProvenance({'2025-12-31':one,'2026-03-31':one,'2026-06-30':one}),/history provenance exceeds/);
});

test('reviewed gzip history input verifies compressed SHA, actual expansion bound, exact raw SHA and count',async()=>{
 const {reviewedHistoryInputs}=await import('../scripts/us-etf-provenance.mjs'),{gzipSync}=await import('node:zlib'),{createHash}=await import('node:crypto'),hash=x=>createHash('sha256').update(x).digest('hex'),raw=Buffer.from('[{"code":"XLU"}]'),z=gzipSync(raw),opts={inputSha256:hash(raw),gzipSha256:hash(z),expandedBytes:raw.length};
 assert.deepEqual(reviewedHistoryInputs(z,opts),[{code:'XLU'}]);for(const change of[{expandedBytes:2},{inputSha256:'a'.repeat(64)},{gzipSha256:'b'.repeat(64)},{expandedBytes:12_000_001}])assert.throws(()=>reviewedHistoryInputs(z,{...opts,...change}));
});
