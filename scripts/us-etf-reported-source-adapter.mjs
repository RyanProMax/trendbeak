// Pinned, offline component-review intake. It does not fetch originals or grant
// a complete observation permission. All numbers remain decimal strings.
import {reportedHash,reportedCanonical,reportedBasketSkeleton} from './us-etf-reported-candidate.mjs';
import {reportedDecimal,REPORTED_RISKS} from './us-etf-reported-arithmetic.mjs';
import {reportedMethodDiagnostic,verifyReportedMethodArtifacts} from './us-etf-reported-method.mjs';
import {reportedEffectiveAvailability,verifyReportedAvailabilityReview,REPORTED_AVAILABILITY_REVIEW_SHA}from'./us-etf-reported-evidence.mjs';
import {verifyReportedCapitalRiskSemantics}from'./us-etf-reported-risk.mjs';
import {verifyReportedCarryingProof}from'./us-etf-reported-carrying.mjs';

const V5 = Object.freeze({
  bundle:'0e0776f9b3de8ae9704f9f4ed85b6a7cfd88935951522030d4eed3fd57b83927',
  manifest:'36932c5d3ba5b37ca581298f59a6fb28df31ebcd8d2f7cafbd5b35b90e491325',
  basket:'71d3b0eb4cbdc3393cede0d3ba44604b5dd94c30bb8cee42392b8a54a90291ef',
  componentSymbols:['NVDA','AAPL','MSFT','MU','AVGO','AMD','INTC','AMAT','LRCX','CSCO','KLAC','SNDK','PANW','TXN','PLTR','IBM','MRVL','ORCL','WDC','APH','APP','DDOG','WDAY'],
  pendingSymbols:['STX','GLW','QCOM','CRWD','ADI'],
  mrvlBridge:'7f3ebf9fb20607d5450580de5f77f31ff472f6626f03e4c26db9ed12cb0cf4d8',
});
const V6 = Object.freeze({
  ...V5,
  bundle:'6e99475cbdf056bb5b319fa93f7fc2f79b2e618c2ef8bace5a5f64e9d4337a1e',
  manifest:'a2d3c6bcaa3739cc31d80bebc89d129445d4b9f1450d7e8f7918a01696876dcd',
  componentSymbols:[...V5.componentSymbols,...V5.pendingSymbols],
  pendingSymbols:['ANET','CRM','DELL','CDNS','NOW'],
});
const V8 = Object.freeze({
  ...V6,
  bundle:'8bdb40e51e23ff9dcad1a2ed8d9848d7a15b278ee6fae9237f16c5b4cdc2ddbb',
  manifest:'db9e4ee2b1a3a0f91942afdafd1258b57e03f2c06148081aaab418a93f457e0c',
  componentSymbols:[...V6.componentSymbols,...V6.pendingSymbols,'FTNT','SNPS','ADBE','COHR','TER','ACN'],
  pendingSymbols:['INTU','NXPI','CIEN','MSI','MPWR','LITE','KEYS','HPE','FLEX'],
  structuredRisks:true,
  maxBundleBytes:650000,
});
// Superseded Q-risk packaging stays diagnostic only; never a release root.
const V9_R2 = Object.freeze({
 ...V8,
 bundle:'79f2ac15c649a9938541e833f60650856be4399d6956edfce70bd790b803bfb0',
 manifest:'bdf1236d9605fdad7917b13af205081112e480c6fe2f19677c3103270d8151f4',
 publicationEvidence:'7d77475063048a22a3d7d0ec8981cbc93ac59601d80b6c08b7699041c45de02a',
 componentSymbols:[...V8.componentSymbols,...V8.pendingSymbols,'TEL','MCHP','ADSK','JBL','ON','Q','ROP','TDY'],
 pendingSymbols:[],maxBundleBytes:850000,exactAvailability:true,
});
const V9_R3 = Object.freeze({
 ...V9_R2,
 bundle:'d340f0aab84a8c8739b2831cb9b0963919788c26b398ad8bda969c0c05277aab',
 manifest:'57cd8de0862315ac04bea4a08dea1738b795cd048b7dc6de0dc6aa1b467c5db3',
 riskReconciliation:'c78eed82e6158089567f222c54cbca8123c13cf7798a57b6bf944e0dcd449202',
 riskMapping:'11ec579132ce5197ea9ecc4cd74d0e27cdaaf26c369cd30ff07cde845d185790',
});
const V9_R4 = Object.freeze({...V9_R3,
 bundle:'dab579516f7ffbfe85b872267306ff786eedc5d573d289e99abdbdafe31d21b1',
 manifest:'a6895ba8ff45d5fd273b8fe2fad9366363fbdae9e95c56975c107817afa63bf3',
 riskReconciliation:'a117665f35f1b7f9245c249967457ff7d1bab1dda9fce2b46991905d7fb51f29',
 capitalRisk:'3692e2edc56885d7989db2e11764ce5eb71c4871f5b211476af47ca72a89f135',
});
const eq = (a,b) => {a=reportedDecimal(a);b=reportedDecimal(b);return a.n*b.d===b.n*a.d;};
const positive = value => reportedDecimal(value).n>0n;
const sum = values => values.reduce((a,v)=>{const b=reportedDecimal(v);return {n:a.n*b.d+b.n*a.d,d:a.d*b.d};},{n:0n,d:1n});
const sumEquals = (values,value) => {const a=sum(values),b=reportedDecimal(value);return a.n*b.d===b.n*a.d;};
const productEquals = (a,b,value) => {a=reportedDecimal(a);b=reportedDecimal(b);const v=reportedDecimal(value);return a.n*b.n*v.d===v.n*a.d*b.d;};
const day = value => typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const instant = value => typeof value==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
function exactBytes(bytes,sha,max=1800000){if(!Buffer.isBuffer(bytes)||bytes.length>max||reportedHash(bytes)!==sha)throw Error('Pinned reviewed artifact bytes required');return JSON.parse(bytes);}
function refs(value,out=[]){if(value&&typeof value==='object'){if(typeof value.sha256==='string'&&typeof value.path==='string')out.push(value);for(const v of Object.values(value))refs(v,out);}return out;}
function currentFactDate(value,cutoff){if(!day(value)||Date.parse(value)>Date.parse(cutoff))throw Error('Fact date must be explicit and before cutoff');}
function originalSource(source,cik,manifest){
  if(!source||typeof source.url!=='string'||!source.url.startsWith('https://www.sec.gov/Archives/edgar/data/'+Number(cik)+'/')||!manifest.has(source.sha256))throw Error('Original issuer filing/source hash binding absent');
}
function fiscalRevenue(issuer,manifest,cutoff){
  const revenue=issuer.revenue,terms=revenue.terms;
  currentFactDate(revenue.asOf,cutoff);
  if(!Array.isArray(terms)||![1,3].includes(terms.length))throw Error('Original annual or annual-plus-YTD-minus-prior terms required');
  for(const t of terms){if(![1,-1].includes(t.operator)||!day(t.start)||!day(t.end)||t.start>t.end||t.end>revenue.asOf)throw Error('Invalid fiscal term');originalSource(t.source,issuer.issuerId,manifest);}
  if(terms.length===1){if(terms[0].operator!==1||terms[0].end!==revenue.asOf)throw Error('Annual-only TTM mismatch');}
  else if(terms.map(t=>t.operator).join(',')!=='1,1,-1'||Date.parse(terms[1].start)-Date.parse(terms[0].end)!==86400000||terms[2].start!==terms[0].start||terms[2].end>=terms[0].end||terms[1].end!==revenue.asOf)throw Error('TTM periods/signs must form one continuous fiscal window');
  const start=terms.length===1?Date.parse(terms[0].start):Date.parse(terms[2].end)+86400000;
  const days=(Date.parse(revenue.asOf)-start)/86400000+1;
  if(days<350||days>380||!sumEquals(terms.map(t=>t.operator<0?(t.value.startsWith('-')?t.value.slice(1):'-'+t.value):t.value),revenue.value))throw Error('Reported fiscal TTM does not reconcile');
}
function publication(issuer,cutoff,manifest,normalized){
  if(normalized){
    if(reportedCanonical(normalized.issuers?.[issuer.symbol]?.publicationMetadata)!==reportedCanonical(issuer.publicationMetadata))throw Error('Exact normalized issuer publication evidence required');
    const sourceHashes=new Set();
    for(const p of issuer.publicationMetadata){
      const available=reportedEffectiveAvailability(p,{cutoff,sourceManifest:manifest});
      if(p.accession!==available.accession||p.originalDocumentsShareFilingAcceptance!==true||!Array.isArray(p.originalFinancialDocuments)||!p.originalFinancialDocuments.length)throw Error('Original financial documents must bind accepted filing');
      const e=p.officialSubmissions.entry;
      for(const source of p.originalFinancialDocuments){originalSource(source,issuer.issuerId,manifest);const expected='https://www.sec.gov/Archives/edgar/data/'+Number(issuer.issuerId)+'/'+e.accessionNumber.replaceAll('-','')+'/';if(!source.url.startsWith(expected)||!/^[-A-Za-z0-9_.]+\.html?$/.test(source.url.slice(expected.length)))throw Error('Accession/document acceptance binding mismatch');sourceHashes.add(source.sha256);}
    }
    for(const f of [...issuer.revenue.terms,...issuer.capitalization.classFacts])if(!sourceHashes.has(f.source.sha256))throw Error('Consumed financial source has no exact original acceptance binding');
    return;
  }
  if(!Array.isArray(issuer.publicationMetadata)||!issuer.publicationMetadata.length)throw Error('Original publication evidence required');
  for(const p of issuer.publicationMetadata){
    if(!instant(p.acceptedAt)||!instant(p.conservativeAvailableAt)||Date.parse(p.acceptedAt)>Date.parse(p.conservativeAvailableAt)||Date.parse(p.conservativeAvailableAt)>Date.parse(cutoff))throw Error('Financial source is not established before cutoff');
    const original=p.officialSubmissions?.entry?.acceptanceDateTime;
    if(original&&Date.parse(original)!==Date.parse(p.acceptedAt))throw Error('Original acceptance binding changed');
  }
}
/** A source-netting reconciliation is not a split, forecast issuance or a
 * later treasury update. Original-document meaning remains in the pinned audit. */
export function reportedSourceNetting(issuer,manifest){
  const c=issuer.capitalization,n=c.sourceNetting;
  // Only this exact independently audited cover/plain-text reconciliation is
  // admitted. This is a fact/date/source boundary, not an issuer exemption.
  if(issuer.issuerId!=='1467373'||c.asOf!=='2026-06-04'||!n||!eq(n.grossReportedCover,'667510210')||!eq(n.lessIssuerHeldSameDate,'55568101')||!eq(n.netExternalCommon,'611942109')||reportedHash(Buffer.from(reportedCanonical(n.proof)))!=='a61ad8e2b35701d6c1076b6d3e39d879b6e716e5540334a75fa47a7d0fd7af9b')throw Error('Exact reviewed net-outstanding fact/date/original proof required');
  if(!n||c.eventBridge||!day(n.asOf)||n.asOf!==c.asOf||!eq(n.grossReportedCover,c.originalReportedShares)||!positive(n.lessIssuerHeldSameDate)||!positive(n.netExternalCommon)||!eq(n.netExternalCommon,c.shares)||!sumEquals([n.lessIssuerHeldSameDate,n.netExternalCommon],n.grossReportedCover)||n.issuerHeldNumberIsPlainTextNotInlineXbrl!==true||typeof n.proof?.xpath!=='string'||!n.proof.xpath.length||typeof n.proof?.text!=='string'||!n.proof.text.length)throw Error('Source-bound same-date net outstanding reconciliation required');
  originalSource(n.proof.source,issuer.issuerId,manifest);
  if(c.classFacts.length!==1||c.classFacts[0].asOf!==n.asOf||!eq(c.classFacts[0].value,n.grossReportedCover)||n.proof.source.sha256!==c.classFacts[0].source.sha256)throw Error('Cover and issuer-held shares must bind the same dated reviewed original');
  return n.netExternalCommon;
}
function capital(issuer,manifest,cutoff,{structuredRisks=false}={}){
  const c=issuer.capitalization;currentFactDate(c.asOf,cutoff);
  if(c.netTreasuryOutstanding!==true||c.notCurrentShareRegister!==true||(!structuredRisks&&typeof c.knownCapitalLag!=='boolean')||typeof c.unlistedClassPriceProxy!=='boolean'||typeof c.unitScopePending!=='boolean'||!positive(c.shares)||!positive(c.price)||!Array.isArray(c.classFacts)||!c.classFacts.length)throw Error('Explicit dated net-treasury common capital required');
  for(const f of c.classFacts){if(f.asOf!==c.asOf||!positive(f.value))throw Error('Class counts do not share the declared snapshot');originalSource(f.source,issuer.issuerId,manifest);}
  if(!sumEquals(c.classFacts.map(f=>f.value),c.originalReportedShares))throw Error('Original actual common class count does not reconcile');
  if(c.eventBridge&&c.sourceNetting)throw Error('Combined unit bridge and source netting need a separately reviewed ordering');
  if(c.eventBridge){const b=c.eventBridge;if(!Number.isSafeInteger(b.numerator)||!Number.isSafeInteger(b.denominator)||b.numerator<=0||b.denominator<=0||!eq(b.originalReportedShares,c.originalReportedShares)||b.originalAsOf!==c.asOf||!instant(b.legalEffectiveAt)||!instant(b.confirmationAcceptedAt)||Date.parse(b.legalEffectiveAt)>Date.parse(cutoff)||Date.parse(b.confirmationAcceptedAt)>Date.parse(cutoff)||b.splitAppliedOnce!==true||b.TTMAndBookNotSplitAdjusted!==true)throw Error('Executed unit bridge is incomplete');const n=reportedDecimal(c.originalReportedShares),v=reportedDecimal(c.shares);if(n.n*BigInt(b.numerator)*v.d!==v.n*n.d*BigInt(b.denominator)||!eq(b.normalizedDatedCarryShares,c.shares))throw Error('Split must be applied exactly once');}
  else if(c.sourceNetting)reportedSourceNetting(issuer,manifest);
  else if(!eq(c.originalReportedShares,c.shares))throw Error('Unexplained partial count update');
  if(!productEquals(c.price,c.shares,c.capitalEstimate))throw Error('Capitalization arithmetic mismatch');
}
function commonBook(issuer,manifest,cutoff,mrvlBridge,carryingProofs={}){
  const b=issuer.commonBook;currentFactDate(b.asOf,cutoff);
  if(!b.audit||!manifest.has(b.audit.sha256)||b.treasuryTreatment!=='Already net in audited common book. Do not deduct twice.')throw Error('Common-book audit and treasury boundary required');
  reportedDecimal(b.value);
  if(b.parentEquity!==undefined){if(b.preferredCarryingDeducted===undefined||!sumEquals([b.value,b.preferredCarryingDeducted],b.parentEquity))throw Error('Parent common-book/preferred carrying reconciliation failed');}
  if(b.derivedHistoricalCarryingResidual){
    if(issuer.symbol!=='MRVL'){verifyReportedCarryingProof({issuer,proofBytes:carryingProofs[issuer.symbol],sourceManifest:manifest});return;}
    if(issuer.symbol!=='MRVL'||b.basis!=='derived_historical_carrying_residual'||!eq(b.parentEquity,'18215800000')||!eq(b.preferredCarryingDeducted,'1999600000')||!eq(b.value,'16216200000')||b.notFairValueOrLiquidationPreference!==true)throw Error('Exact reviewed historical-carrying residual required');
    if(!sumEquals(mrvlBridge.total_parent_rollforward_usd.map(t=>t.signed_usd),b.parentEquity)||!sumEquals(mrvlBridge.apic_rollforward_signed_terms_usd,'16877500000')||mrvlBridge.original_complete_rollforward.sha256!==issuer.capitalization.classFacts[0].source.sha256)throw Error('Complete original preferred carrying bridge did not reconcile');
  }
}

/** Convert only structured, reviewed risk assessments. Old true capital flags
 * are known disclosures; false never proves absence. Free text is retained in
 * originalIssuerInputsPreserved, but does not manufacture a risk disposition. */
export function reportedRiskAssessment(issuer,manifest,{structuredRequired=false}={}) {
  const result={};
  for(const risk of REPORTED_RISKS){
    const assessed=issuer?.riskAssessment?.[risk];
    if(!assessed){
      if(structuredRequired)throw Error('Structured risk assessment required');
      result[risk]={status:risk==='knownCapitalLag'&&issuer?.capitalization?.knownCapitalLag===true?'known':'unknown',evidenceRefs:[],note:'Legacy pinned component: true capital lag is retained; no negative risk assessment is inferred.'};
      continue;
    }
    if(!['known','none','unknown'].includes(assessed.status)||!Array.isArray(assessed.evidenceRefs)||typeof assessed.note!=='string'||!assessed.note.trim())throw Error('Explicit structured risk status, evidence and note required');
    if(assessed.status!=='unknown'&&!assessed.evidenceRefs.length)throw Error('Known or absent risk needs reviewed evidence');
    for(const ref of assessed.evidenceRefs)if(typeof ref.path!=='string'||!manifest.has(ref.sha256))throw Error('Risk evidence is outside the reviewed source manifest');
    result[risk]=assessed;
  }
  return result;
}

/** Compare each metric against the trusted review inventory independently. */
export function reportedFieldAdmissions(issuer,expected,{independentRequired=false}={}){
  const result={};
  for(const [metric,field]of [['pb','commonBook'],['ps','revenue']]){
    if(typeof expected?.[metric]!=='boolean')throw Error('Separate trusted metric inventories required');
    const fact=issuer[field],audited=independentRequired?fact?.independentAuditVerified:fact?.verifiedInput;
    if(audited!==expected[metric]||fact?.verifiedInput!==expected[metric])throw Error('Exact independently reviewed field disposition required');
    result[metric]=expected[metric];
  }
  return result;
}

/** Row projection AFTER separate source/field admission. This is not a source
 * auditor and must never accept caller booleans as a release permission. */
export function reportedMetricRows(positions,components,metric,{issuerInputs=[]}={}){
  const field=metric==='pb'?'commonBook':metric==='ps'?'revenue':null;
  if(!field||!Array.isArray(positions)||!(components instanceof Map))throw Error('Explicit metric and admitted component map required');
  const inputs=new Map(issuerInputs.map(i=>[i.securityId,i]));
  return positions.map(p=>{
    const component=components.get(p.securityId),i=component?.issuer;
    if(component&&(typeof component.admissions?.pb!=='boolean'||typeof component.admissions?.ps!=='boolean'||i?.securityId!==p.securityId||i?.issuerId!==p.issuerId))throw Error('Separate field admissions and exact issuer holding required');
    const admitted=component?.admissions[metric]===true;
    const unknown=Object.fromEntries(REPORTED_RISKS.map(r=>[r,{status:'unknown',evidenceRefs:[],note:'Metric or identity has not been independently admitted.'}]));
    return {securityId:p.securityId,issuerId:p.issuerId||null,weight:p.originalFundWeight,capitalization:admitted?(i.capitalization?.capitalEstimate??null):null,denominator:admitted?(i[field]?.value??null):null,identityAdmitted:!!component,denominatorAdmitted:admitted,riskAssessment:admitted?component.riskAssessment:unknown,commonClassPriceProxy:admitted?(i.capitalization?.unlistedClassPriceProxy??false):false,unitBridgeUnresolved:inputs.get(p.securityId)?.capitalization?.unitScopePending??false};
  });
}

function adaptReportedSource({bundleBytes,proofManifestBytes,basketBytes,reviewBytes,computationBytes,mrvlBridgeBytes,carryingProofs,availabilityReviewBytes,publicationEvidenceBytes,riskReconciliationBytes,riskMappingBytes,capitalRiskBytes},review,version){
  const method=verifyReportedMethodArtifacts({reviewBytes,computationBytes}),bundle=exactBytes(bundleBytes,review.bundle,review.maxBundleBytes??500000),proof=exactBytes(proofManifestBytes,review.manifest,500000),mrvlBridge=exactBytes(mrvlBridgeBytes,review.mrvlBridge,50000);
  let normalized=null;
  if(review.exactAvailability){const policy=verifyReportedAvailabilityReview(availabilityReviewBytes);normalized=exactBytes(publicationEvidenceBytes,review.publicationEvidence,250000);if(policy.schema!=='sec_source_availability_revision_v1'||Date.parse(policy.observationClose)!==Date.parse('2026-06-30T20:00:00Z')||normalized.schema!=='normalized_source_publication_evidence_v1'||normalized.sourceAvailabilityRevision.sha256!==REPORTED_AVAILABILITY_REVIEW_SHA||bundle.sourceAvailabilityPolicy.sha256!==REPORTED_AVAILABILITY_REVIEW_SHA||bundle.publicationNormalizationProof.sha256!==review.publicationEvidence)throw Error('Exact availability revision must bind normalized input');}
  let resolvedRisks=null;
  if(review.riskReconciliation){
    const r=exactBytes(riskReconciliationBytes,review.riskReconciliation,250000),a=exactBytes(riskMappingBytes,review.riskMapping,20000);
    if(r.schema!==(review.capitalRisk?'risk_reconciliation_final_v2':'whole_point_risk_reconciliation_v1')||r.status!=='FINAL_RISK_MAPPING_FOR_R3'||r.rows.length!==56||r.capitalRecommendationDispositions.length!==30||r.all56IssuerRiskRowsResolved!==true||r.allExplicitTrueFindingsReconciled!==true||r.allFinancialValuesUnchanged!==true||r.independentRiskAddendum.sha256!==review.riskMapping||bundle.riskReconciliationProof.sha256!==review.riskReconciliation||a.financialNumbersUnchanged!==true||a.riskNoneNotInferredFromAbsence!==true)throw Error('Exact completed risk reconciliation required');
    if(review.capitalRisk)verifyReportedCapitalRiskSemantics(bundle,exactBytes(capitalRiskBytes,review.capitalRisk,40000),r,review.capitalRisk);
    resolvedRisks=new Map(r.rows.map(row=>[row.symbol,row.resolvedRisk]));if(resolvedRisks.size!==56)throw Error('Risk issuer inventory changed');
    for(const row of a.rows)for(const risk of REPORTED_RISKS)if(row[risk]?.status==='known'&&resolvedRisks.get(row.symbol)?.[risk]?.status!=='known')throw Error('Known independent risk finding was dropped');
  }
  const basket=reportedBasketSkeleton(basketBytes,{code:'XLK',date:'2026-06-30',checkpointSha256:review.basket});
  if(bundle.schema!=='source_backed_common_inputs_v1'||bundle.date!==basket.date||bundle.methodVersion!==method.scopeRevision||bundle.methodProof.sha256!==method.methodReviewSha256||bundle.wholePointAdmitted!==false||!eq(bundle.stockWeight,String(basket.originalStockWeight))||bundle.positions.length!==74||bundle.issuers.length!==review.componentSymbols.length+review.pendingSymbols.length||proof.offlineOnly!==true||proof.bundle.sha256!==review.bundle)throw Error('Exact offline component review scope required');
  const sourceManifest=new Map(proof.files.map(f=>[f.sha256,f]));sourceManifest.set(proof.ledger.sha256,proof.ledger);
  const missingRefs=[...new Map(refs(bundle).filter(r=>!sourceManifest.has(r.sha256)).map(r=>[r.sha256,{sha256:r.sha256,path:r.path}])).values()];
  const originals=new Map(basket.positions.map(p=>[p.securityId,p])),positions=new Map();
  for(const p of bundle.positions){const old=originals.get(p.securityId);if(!old||positions.has(p.securityId)||old.symbol!==p.symbol||!eq(p.originalFundWeight,String(old.originalFundWeight))||!eq(p.fundMark.unitPrice,String(old.fundMark.value))||p.fundMark.observationDate!==basket.date||p.fundMark.publicAt!==basket.holdingsAvailableAt||p.fundMark.retrospectiveReconstruction!==true||!productEquals(p.fundMark.unitPrice,p.fundMark.holdingUnits,p.fundMark.fairValueUSD))throw Error('Original full basket weight/mark/identity changed');positions.set(p.securityId,p);}
  // The fixed review root lists field admissions separately. Legacy v5/v6
  // happen to approve both fields for the same names; that is not an AND gate.
  const metricSymbols=review.metricSymbols??{pb:review.componentSymbols,ps:review.componentSymbols};
  const expectedFields={pb:new Set(metricSymbols.pb),ps:new Set(metricSymbols.ps)};
  const expected=new Set([...metricSymbols.pb,...metricSymbols.ps]),pending=new Set(review.pendingSymbols),components=new Map();
  const seenIssuers=new Set();
  for(const issuer of bundle.issuers){
    const p=positions.get(issuer.securityId);
    if(!p||seenIssuers.has(issuer.securityId)||p.symbol!==issuer.symbol||p.issuerId!==issuer.issuerId||issuer.methodVersion!==method.scopeRevision||issuer.wholePointAdmitted!==false||!eq(issuer.originalFundWeight,p.originalFundWeight))throw Error('Issuer must bind exact holding and independent method');
    seenIssuers.add(issuer.securityId);
    if(resolvedRisks&&reportedCanonical(resolvedRisks.get(issuer.symbol))!==reportedCanonical(issuer.riskAssessment))throw Error('Issuer risk must match exact completed reconciliation');
    const admissions=reportedFieldAdmissions(issuer,{pb:expectedFields.pb.has(issuer.symbol),ps:expectedFields.ps.has(issuer.symbol)},{independentRequired:review.structuredRisks===true});
    if(review.structuredRisks)for(const [metric,field]of [['pb','commonBook'],['ps','revenue']]){
      const auditRefs=issuer[field].independentAuditRefs;
      if(!Array.isArray(auditRefs)||admissions[metric]&&!auditRefs.length||auditRefs.some(ref=>typeof ref.path!=='string'||!sourceManifest.has(ref.sha256)))throw Error('Metric audit references must bind reviewed source manifest');
      if(admissions[metric]&&!auditRefs.some(ref=>ref.sha256===issuer[field].audit?.sha256))throw Error('Primary metric audit is not in its independent evidence');
    }
    if(admissions.pb||admissions.ps){
      if(!expected.delete(issuer.symbol))throw Error('Unexpected reviewed component');
      publication(issuer,basket.financialCutoff,sourceManifest,normalized);
      if(admissions.ps){if(!sourceManifest.has(issuer.revenue.audit?.sha256))throw Error('Revenue independent audit binding required');fiscalRevenue(issuer,sourceManifest,basket.financialCutoff);}
      if(admissions.pb)commonBook(issuer,sourceManifest,basket.financialCutoff,mrvlBridge,carryingProofs);
      // Nonpositive financial classification does not consume unused capital.
      if(admissions.ps&&positive(issuer.revenue.value)||admissions.pb&&positive(issuer.commonBook.value)){
        capital(issuer,sourceManifest,basket.financialCutoff,{structuredRisks:review.structuredRisks===true});
        if(!eq(issuer.capitalization.price,p.fundMark.unitPrice))throw Error('Issuer price is not the held NPORT unit mark');
      }
      const riskAssessment=reportedRiskAssessment(issuer,sourceManifest,{structuredRequired:review.structuredRisks===true});
      components.set(issuer.securityId,{issuer,admissions,riskAssessment});
    }else if(!pending.delete(issuer.symbol))throw Error('Unreviewed issuer cannot promote itself');
  }
  if(expected.size||pending.size)throw Error('Reviewed and pending component inventory changed');
  const metrics={};
  for(const metric of ['pb','ps'])metrics[metric]=reportedMethodDiagnostic(reportedMetricRows([...positions.values()],components,metric,{issuerInputs:bundle.issuers}),{fullEquityWeight:bundle.stockWeight,reviewBytes,computationBytes});

  return {schema:'reported-source-adapter-diagnostic-'+version,...method,code:'XLK',date:basket.date,financialCutoff:basket.financialCutoff,publicAvailableAt:basket.holdingsAvailableAt,retrospectiveReconstruction:true,mayRepresentContemporaneousTradableSignal:false,sourceBundleSha256:review.bundle,proofManifestSha256:review.manifest,basketRootSha256:review.basket,positions:bundle.positions,reviewedComponentCount:components.size,reviewedMetricComponentCounts:{pb:metricSymbols.pb.length,ps:metricSymbols.ps.length},pendingComponentSymbols:review.pendingSymbols,metrics,sourceDocumentsLocallyVerified:false,componentAuditBindingsChecked:true,referenceClosureComplete:missingRefs.length===0,missingManifestReferences:missingRefs,currentPerimeterComparableCoverage:null,perimeterNotAsserted:true,commonBookDerivedSymbols:[...components.values()].filter(c=>c.admissions.pb&&c.issuer.commonBook.derivedHistoricalCarryingResidual).map(c=>c.issuer.symbol),originalIssuerInputsPreserved:[...components.values()].map(c=>c.issuer),wholeObservationApproved:false,publishable:false};
}

export function adaptReportedSourceV5(args){return adaptReportedSource(args,V5,'v5');}
export function adaptReportedSourceV6(args){return adaptReportedSource(args,V6,'v6');}

export function adaptReportedSourceV8(args){return adaptReportedSource(args,V8,'v8');}

export function adaptReportedSourceV9R2(args){return adaptReportedSource(args,V9_R2,'v9-r2');}

export function adaptReportedSourceV9R3(args){return adaptReportedSource(args,V9_R3,'v9-r3');}

export function adaptReportedSourceV9R4(args){return adaptReportedSource(args,V9_R4,'v9-r4');}
