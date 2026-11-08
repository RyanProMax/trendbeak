import {useRef,useState} from 'react';
import type {Market} from '../market-types';

/** The native range owns keyboard/drag semantics; the decorative thumb can
 * interpolate interrupted changes instead of jumping between native stops. */
export default function MarketSwitch({market,onChange}:{market:Market;onChange:(market:Market,animate:boolean)=>void}){
 const keyboard=useRef(false),[immediate,setImmediate]=useState(false);
 return <div className="market-switch" data-market={market} data-immediate={immediate||undefined}>
  <span aria-hidden="true">CN</span><span aria-hidden="true">US</span>
  <i className="market-switch-thumb" aria-hidden="true"/>
  <input type="range" min="0" max="1" step="1" value={market==='CN'?0:1} aria-label="切换市场" aria-valuetext={market==='CN'?'A股':'美股'}
   onPointerDown={()=>{keyboard.current=false;setImmediate(false);}}
   onKeyDown={()=>{keyboard.current=true;setImmediate(true);}}
   onChange={event=>onChange(event.currentTarget.value==='0'?'CN':'US',!keyboard.current)}/>
 </div>;
}
