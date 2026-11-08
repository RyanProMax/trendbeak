import {useLayoutEffect,useRef} from 'react';

/** State, URL and requests commit immediately. Only the newly rendered market
 * surface animates, so rapid reversals cannot publish a stale deferred update. */
export function useMarketMotion(contentKey:string,enabled:{current:boolean}){
 const element=useRef<HTMLElement>(null),previous=useRef(contentKey),animation=useRef<Animation|null>(null);
 useLayoutEffect(()=>{
  if(previous.current===contentKey)return;
  previous.current=contentKey;
  const node=element.current,interrupted=animation.current?.playState==='running';
  const current=node&&interrupted?getComputedStyle(node):null;
  const opacity=current?Number(current.opacity):.8,transform=current?.transform??'translateY(4px)';
  animation.current?.cancel();animation.current=null;
  if(!node||!enabled.current||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  animation.current=node.animate([
   {opacity,transform},
   {opacity:1,transform:'translateY(0)'},
  ],{duration:180,easing:'cubic-bezier(.23,1,.32,1)'});
 },[contentKey]);
 useLayoutEffect(()=>{
  const media=matchMedia('(prefers-reduced-motion: reduce)'),stop=()=>{if(media.matches)animation.current?.cancel();};
  media.addEventListener('change',stop);
  return()=>{media.removeEventListener('change',stop);animation.current?.cancel();};
 },[]);
 return element;
}
