import test,{before,after}from'node:test';import assert from'node:assert/strict';import{createServer}from'vite';import{reportedReadingFixture as fixture}from'./fixtures/reported-common-reading.mjs';
let vite,valid,forView;const now=Date.parse('2026-11-10T13:00:00Z');
before(async()=>{vite=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false,ws:false}});const m=await vite.ssrLoadModule('/src/lib/us-etf-reported.ts');valid=m.validReportedETFReading;forView=m.reportedETFForView;});after(async()=>vite?.close());
test('separate reported estimate accepts a dated value without any historical rank',()=>{const r=fixture();assert(valid(r));assert.equal(forView(r,{mode:'historical',date:'2026-06-30'},now),r);assert.equal(forView(r,{mode:'latest',date:'2026-11-09'},now),r);});
test('historical November selection never relabels the June point or a future prepared result',()=>{const r=fixture();assert.equal(forView(r,{mode:'historical',date:'2026-11-09'},now),null);assert.equal(forView(r,{mode:'latest',date:'2027-01-01'},now),null);assert.equal(forView(r,{mode:'latest',date:'2026-11-09'},Date.parse('2026-11-10T11:00Z')),null);});
test('legacy methods, fake percentiles and contemporaneous-tradable/current claims are rejected',()=>{
 for(const mutate of [r=>r.methodVersion='common-equity-harmonic-v1',r=>r.scopeRevision='other',r=>r.metrics.pb.percentile=50,r=>r.metrics.ps.rank=1,r=>r.isCurrentFundNAV=true,r=>r.isCurrentFundHoldings=true,r=>r.mayRepresentContemporaneousTradableSignal=true,r=>r.historicalRankEligible=true]){const r=fixture();mutate(r);assert.equal(valid(r),false);}
});
test('exact subthreshold, negative/missing values and empty point cannot masquerade as a release',()=>{
 const r=fixture();r.metrics.pb.verifiedCoverageExact={numerator:'979999999999999999999',denominator:'1000000000000000000000'};r.metrics.pb.verifiedCoverage=.98;r.metrics.pb.positiveCoverage=.97;r.metrics.pb.missingCoverage=.02;assert.equal(valid(r),false);
 for(const mutate of [r=>r.metrics.pb.value=-1,r=>r.metrics.pb.value=NaN,r=>r.metrics.pb.positiveCoverage=0,r=>r.metrics.pb.risks.bookScopeLag.unknown=2,r=>{r.metrics.pb.value=null;r.metrics.ps.value=null;}]){const x=fixture();mutate(x);assert.equal(valid(x),false);}
 const single=fixture();single.metrics.pb.value=null;assert(valid(single));
});
