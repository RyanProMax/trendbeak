// Controlled offline arithmetic only. These functions neither identify a market
// universe nor reproduce a publisher's undisclosed methodology or percentiles.
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
export function relativeTurnover60(previous,current,basis){
 if(!['previous60','includingCurrent60'].includes(basis))throw new RangeError('Choose an explicit 60-session basis');
 if(!Array.isArray(previous)||previous.length!==60||!positive(current))return null;
 const sample=basis==='previous60'?previous:[...previous.slice(1),current];
 if(!sample.every(positive))return null;
 const sum=sample.reduce((total,value)=>total+value,0),result=current/(sum/60);
 return Number.isFinite(sum)&&Number.isFinite(result)?result:null;
}
export function combinedIndexAmountCny(sh,sz){
 if(sh?.code!=='000001'||sz?.code!=='399001'||sh.date!==sz.date||!/^\d{4}-\d{2}-\d{2}$/.test(sh.date)||!Number.isFinite(Date.parse(sh.date))||new Date(sh.date).toISOString().slice(0,10)!==sh.date||!positive(sh.amountCny)||!positive(sz.amountCny))return null;
 const result=(sh.amountCny+sz.amountCny)/1e8;
 return Number.isFinite(result)?result:null;
}
export function limitUpDownRatio(up,down){
 return Number.isSafeInteger(up)&&up>=0&&Number.isSafeInteger(down)&&down>0?up/down:null;
}
