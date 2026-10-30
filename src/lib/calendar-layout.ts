export const CALENDAR_CELL = 20, CALENDAR_GAP = 3, CALENDAR_PITCH = CALENDAR_CELL + CALENDAR_GAP;
export function calendarLayout(start:string,count:number,width:number) {
 const offset=(new Date(start+"T12:00:00Z").getUTCDay()+6)%7,weeks=Math.ceil((offset+count)/7),logicalWidth=weeks*CALENDAR_PITCH-CALENDAR_GAP;
 const gridWidth=Math.min(Math.max(1,width-28),logicalWidth),scale=gridWidth/logicalWidth;
 return {offset,weeks,count,logicalWidth,gridWidth,scale};
}
/** Map a broad pointer target to its closest real date, including narrow cells
 * and the gaps between them. Padding before/after the interval stays empty. */
export function calendarIndexAt(x:number,y:number,layout:ReturnType<typeof calendarLayout>):number|null {
 if(x<0||x>layout.gridWidth||y<0||y>CALENDAR_PITCH*7-CALENDAR_GAP)return null;
 const column=Math.max(0,Math.min(layout.weeks-1,Math.round((x/layout.scale-CALENDAR_CELL/2)/CALENDAR_PITCH)));
 const row=Math.max(0,Math.min(6,Math.round((y-CALENDAR_CELL/2)/CALENDAR_PITCH))),index=column*7+row-layout.offset;
 return index>=0&&index<layout.count?index:null;
}
export function calendarMonthLabels(dates:string[],layout:ReturnType<typeof calendarLayout>) {
 const result:{x:number;label:string}[]=[];let right=-10,year="";
 for(let i=0;i<dates.length;i++){
  const date=dates[i];if(i&&date.slice(0,7)===dates[i-1].slice(0,7))continue;
  const nextYear=date.slice(0,4),month=Number(date.slice(5,7)),label=nextYear!==year?nextYear.slice(2)+"年"+month+"月":month+"月";
  const x=Math.floor((i+layout.offset)/7)*CALENDAR_PITCH*layout.scale,estimated=nextYear!==year?50:month>=10?28:22;
  if(x>=right+10&&x+estimated<=layout.gridWidth+1){result.push({x,label});right=x+estimated;year=nextYear;}
 }
 return result;
}

