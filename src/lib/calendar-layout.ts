export const CALENDAR_CELL=20,CALENDAR_GAP=3,CALENDAR_PITCH=23,CALENDAR_ROWS=5;
const day=(date:string,n:number)=>new Date(Date.parse(date)+n*86400000).toISOString().slice(0,10);
export const weekdayIndex=(date:string)=>(new Date(date+"T12:00:00Z").getUTCDay()+6)%7;
export function calendarLayout(start:string,count:number,width:number) {
 let firstIndex=0,lastIndex=count-1;while(firstIndex<count&&weekdayIndex(day(start,firstIndex))>4)firstIndex++;while(lastIndex>=firstIndex&&weekdayIndex(day(start,lastIndex))>4)lastIndex--;
 const offset=firstIndex<count?weekdayIndex(day(start,firstIndex)):0,weeks=lastIndex>=firstIndex?Math.floor((lastIndex-firstIndex+offset)/7)+1:0,logicalWidth=Math.max(0,weeks*CALENDAR_PITCH-CALENDAR_GAP);
 const gridWidth=Math.min(Math.max(1,width-28),logicalWidth),scale=logicalWidth?gridWidth/logicalWidth:1,gridHeight=weeks?(CALENDAR_PITCH*CALENDAR_ROWS-CALENDAR_GAP)*scale:0;
 return {offset,weeks,count,firstIndex,lastIndex,logicalWidth,gridWidth,scale,gridHeight};
}
export function calendarIndexAt(x:number,y:number,layout:ReturnType<typeof calendarLayout>):number|null {
 if(!layout.weeks||x<0||x>layout.gridWidth||y<0||y>layout.gridHeight)return null;
 const column=Math.max(0,Math.min(layout.weeks-1,Math.round((x/layout.scale-CALENDAR_CELL/2)/CALENDAR_PITCH))),row=Math.max(0,Math.min(4,Math.round((y/layout.scale-CALENDAR_CELL/2)/CALENDAR_PITCH)));
 const index=layout.firstIndex+column*7+row-layout.offset;
 return index>=layout.firstIndex&&index<=layout.lastIndex?index:null;
}
export function calendarMonthLabels(dates:string[],layout:ReturnType<typeof calendarLayout>) {
 const result:{x:number;label:string}[]=[];let right=-10,year="",previousMonth="";
 for(let i=layout.firstIndex;i<=layout.lastIndex;i++){
  const date=dates[i];if(weekdayIndex(date)>4)continue;const monthKey=date.slice(0,7);if(monthKey===previousMonth)continue;previousMonth=monthKey;
  const nextYear=date.slice(0,4),month=Number(date.slice(5,7)),label=nextYear!==year?nextYear.slice(2)+"年"+month+"月":month+"月",x=Math.floor((i-layout.firstIndex+layout.offset)/7)*CALENDAR_PITCH*layout.scale,estimated=nextYear!==year?50:month>=10?28:22;
  if(x>=right+10&&x+estimated<=layout.gridWidth+1){result.push({x,label});right=x+estimated;year=nextYear;}
 }
 return result;
}
