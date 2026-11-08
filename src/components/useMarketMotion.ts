import {useLayoutEffect,useRef} from 'react';

/** State, URL and requests commit immediately. Only the newly rendered market
 * surface fades in place. Moving a full dashboard reads as a layout jump;
 * rapid reversals continue from the current opacity without delaying state. */
export function useMarketMotion(contentKey:string,enabled:{current:boolean}){
 const element=useRef<HTMLElement>(null),previous=useRef(contentKey),animation=useRef<Animation|null>(null);
 useLayoutEffect(()=>{
  if(previous.current===contentKey)return;
  previous.current=contentKey;
  const node=element.current,interrupted=animation.current?.playState==='running';
  const current=node&&interrupted?getComputedStyle(node):null;
  const opacity=current?Number(current.opacity):.86;
  animation.current?.cancel();animation.current=null;
  if(!node||!enabled.current||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  animation.current=node.animate([
   {opacity},
   {opacity:1},
  ],{duration:160,easing:'cubic-bezier(.23,1,.32,1)'});
 },[contentKey]);
 useLayoutEffect(()=>{
  const media=matchMedia('(prefers-reduced-motion: reduce)'),stop=()=>{if(media.matches)animation.current?.cancel();};
  media.addEventListener('change',stop);
  return()=>{media.removeEventListener('change',stop);animation.current?.cancel();};
 },[]);
 return element;
}
