// Mechanical risk semantics checks after exact reviewed source roots are bound.
// This is not independent source approval and never adjusts dated share counts.
export function verifyReportedCapitalRiskSemantics(bundle,addendum,reconciliation,proofSha){
 const rows=addendum?.allSevenPriorKnownCapitalRowsReviewed;
 if(addendum?.schema!=='actual-common-risk-semantics-correction-v1'||addendum.noFinancialValuesChanged!==true||!Array.isArray(rows)||rows.length!==7||bundle.capitalRiskSemanticsProof?.sha256!==proofSha||reconciliation.capitalRiskSemanticsAddendum?.sha256!==proofSha||bundle.knownCapitalLagDefinition!==addendum.knownCapitalLagFieldDefinition||reconciliation.knownCapitalLagDefinition!==addendum.knownCapitalLagFieldDefinition)throw Error('Exact capital-risk semantics binding required');
 const issuers=new Map(bundle.issuers.map(i=>[i.symbol,i])),seen=new Set();
 const classes=new Set(['observed_common_count_changing_event','contracted_common_settlement_unresolved','financing_structure_only_not_common_count_event']);
 for(const [index,row]of rows.entries()){
  const i=issuers.get(row.symbol),c=i?.capitalEventClassification;
  if(!i||seen.has(row.symbol)||!classes.has(row.eventEvidenceClass)||c?.eventEvidenceClass!==row.eventEvidenceClass||c.conclusion!==row.conclusion||c.evidenceRef?.sha256!==proofSha||c.evidenceRef?.jsonPointer!==`/allSevenPriorKnownCapitalRowsReviewed/${index}`||i.riskAssessment.knownCapitalLag.status!==row.finalKnownCapitalLagStatus)throw Error('Capital event must retain its reviewed subtype and evidence');
  seen.add(row.symbol);
  const expected=row.eventEvidenceClass==='financing_structure_only_not_common_count_event'?'unknown':'known';
  if(row.finalKnownCapitalLagStatus!==expected)throw Error('Potential financing claims are not issued common-count evidence');
 }
 if(bundle.issuers.filter(i=>i.capitalEventClassification).length!==seen.size)throw Error('Unreviewed capital event classification');
 const glw=issuers.get('GLW'),s=glw?.capitalStructureEventAssessment;
 if(glw?.riskAssessment.knownCapitalLag.status!=='unknown'||glw.riskAssessment.knownBookScopeLag.status!=='known'||s?.status!=='known'||s.eventType!=='issued_unexercised_warrants'||s.appliedDatedShareAdjustment!==0||s.futurePotentialNotCurrentCommon!==true||s.notPartOfCommonCountLagCoverage!==true||!s.evidenceRefs?.some(r=>r.sha256===proofSha&&r.jsonPointer==='/rows/0'))throw Error('Unexercised warrants must remain separate from dated common count');
 return {reviewedEventCount:seen.size,datedSharesAdjusted:false};
}
