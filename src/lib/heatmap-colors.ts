export const COLORS = [
  "#3e7e65",
  "#6ba18a",
  "#9bbca9",
  "#d1e0d5",
  "#eef0eb",
  "#f0dbd2",
  "#ddb1a1",
  "#cc8e7f",
  "#b96e63",
];
export const DARK_COLORS = ["#79b699", "#548b70", "#3a6551", "#293f32", "#26302b", "#4a342c", "#74503f", "#a56d57", "#d3977e"];
export function level(change: number | null) {
  if (change === null || change === 0) return 0;
  return (
    Math.sign(change) *
    (Math.abs(change) >= 3
      ? 4
      : Math.abs(change) >= 1.5
        ? 3
        : Math.abs(change) >= 0.5
          ? 2
          : 1)
  );
}

export function heatColor(change:number,scheme:'light'|'dark') {
  return (scheme==='dark'?DARK_COLORS:COLORS)[level(change)+4];
}
const channels=(color:string)=>color.startsWith('#')?[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)):(color.match(/[\d.]+/g)??[]).slice(0,3).map(Number);
const luminance=(rgb:number[])=>rgb.map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
/** Preserve the heat hue, adjusting only as much as needed for small text. */
export function readableColor(color:string,scheme:'light'|'dark') {
  const rgb=channels(color),target=scheme==='dark'?255:0;
  const contrast=(c:number[])=>scheme==='dark'?(luminance(c)+.05)/.05:1.05/(luminance(c)+.05);
  if(contrast(rgb)>=4.5)return color;
  let low=0,high=1;
  for(let i=0;i<16;i++){const mix=(low+high)/2,c=rgb.map(v=>Math.round(v+(target-v)*mix));if(contrast(c)>=4.5)high=mix;else low=mix;}
  return `rgb(${rgb.map(v=>Math.round(v+(target-v)*high)).join(', ')})`;
}
export const changeTextColor=(change:number,scheme:'light'|'dark')=>readableColor(heatColor(change,scheme),scheme);
