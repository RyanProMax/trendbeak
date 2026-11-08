import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import {createServer} from 'vite';
let vite,colors;
before(async()=>{vite=await createServer({configFile:false,appType:'custom',server:{middlewareMode:true,hmr:false}});colors=await vite.ssrLoadModule('/src/lib/heatmap-colors.ts');});
after(async()=>await vite?.close());
const rgb=c=>c.startsWith('#')?[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)):c.match(/[\d.]+/g).map(Number);
const luminance=c=>rgb(c).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
test('return text keeps its exact heatmap bucket family and meets small-text contrast on both themes',()=>{
 for(const scheme of ['light','dark'])for(const change of [-4,-2,-1,-.1,0,.1,1,2,4]){
  const fill=colors.heatColor(change,scheme),text=colors.changeTextColor(change,scheme),palette=scheme==='dark'?colors.DARK_COLORS:colors.COLORS;
  assert.equal(fill,palette[colors.level(change)+4]);
  const contrast=scheme==='dark'?(luminance(text)+.05)/.05:1.05/(luminance(text)+.05);assert.ok(contrast>=4.5,`${scheme} ${change}: ${contrast}`);
  const order=v=>rgb(v).map((x,i)=>({x,i})).sort((a,b)=>a.x-b.x).map(v=>v.i);assert.deepEqual(order(text),order(fill));
 }
});
test('already-readable heat tones are unchanged',()=>{
 assert.equal(colors.readableColor('#79b699','dark'),'#79b699');
 assert.equal(colors.readableColor('#3e7e65','light'),'#3e7e65');
});
