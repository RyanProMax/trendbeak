// Controlled preparation only; never loaded by an HTTP reader.
import{validUSOverview,type USOverview}from'../lib/us-overview';
export interface USInput{date:string;values:number[]}
export interface USCheckpoint{rows:USInput[];history:USOverview['history']}
export function updateUSOverview(delta:USInput[],today:string,old?:USCheckpoint){
 if(!delta.length||delta.length>(old?32:640))throw Error('US factor input exceeds controlled bound');
 let last='';for(const r of delta){if(r.date<=last||!validUSOverview({sourceId:'cnn_whit3rabbit',history:{[r.date]:[r.values,Array(6).fill(null),0]}},today))throw Error('Invalid CNN dated factor input');last=r.date;}
 const byDate=new Map(old?.rows.map(r=>[r.date,r])??[]);let changed:string|undefined;
 for(const r of delta){const before=byDate.get(r.date);if(!before||r.values.some((v,i)=>v!==before.values[i])){if(old&&r.date<old.rows.at(-32)!.date)throw Error('Older factor correction requires controlled repair');changed=changed&&changed<r.date?changed:r.date;byDate.set(r.date,r);}}
 const rows=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-640),history={...old?.history};let processed=0;
 if(changed){const start=rows.findIndex(r=>r.date>=changed);if(rows.length-start> (old?32:640))throw Error('US correction suffix exceeds 32 dates');
 for(let i=start;i<rows.length;i++){const prev=rows.slice(Math.max(0,i-252),i),values=rows[i].values,ranks=values.map((v,k)=>{if(prev.length<60)return null;const rank=100*(prev.filter(r=>r.values[k]<v).length+prev.filter(r=>r.values[k]===v).length/2)/prev.length;return Math.round((k>=3?100-rank:rank)*10000)/10000;});history[rows[i].date]=[values,ranks,prev.length];processed++;}}
 const from=new Date(Date.parse(today)-364*86400000).toISOString().slice(0,10),visible=Object.fromEntries(Object.entries(history).filter(([d])=>d>=from&&d<=today));
 const view:USOverview={sourceId:'cnn_whit3rabbit',history:visible};if(!validUSOverview(view,today))throw Error('Invalid US overview result');return{checkpoint:{rows,history:visible},view,processed};
}
