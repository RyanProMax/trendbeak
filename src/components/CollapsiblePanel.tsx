import {createContext,useContext,useId,useRef,useState,type ReactNode} from 'react';
import './collapsible-panel.css';
import './scrollbars.css';
const Visibility=createContext(true);
const Panels=createContext<{closed:Record<string,boolean>;toggle:(key:string)=>void}>({closed:{},toggle:()=>{}});
export const usePanelVisible=()=>useContext(Visibility);
// Layout preferences are shared across markets, not financial/date state.
export function PanelPreferences({children}:{children:ReactNode}){
 const [closed,setClosed]=useState<Record<string,boolean>>({});
 return <Panels.Provider value={{closed,toggle:key=>setClosed(old=>({...old,[key]:!old[key]}))}}>{children}</Panels.Provider>;
}
export default function CollapsiblePanel({panelKey,title,readout,className='',children}:{panelKey:string;title:string;readout?:ReactNode;className?:string;children:ReactNode}){
 const {closed,toggle}=useContext(Panels),expanded=!closed[panelKey],id=useId(),button=useRef<HTMLButtonElement>(null);
 const [animating,setAnimating]=useState(false);
 return <section className={`foldable-panel ${className}`} data-panel={panelKey} aria-labelledby={`${id}-title`}>
  <header className="panel-heading"><h2 id={`${id}-title`}><button ref={button} type="button" aria-expanded={expanded} aria-controls={`${id}-body`} onClick={()=>{button.current?.focus({preventScroll:true});setAnimating(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);toggle(panelKey);}}>{title}<svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4"/></svg></button></h2>{readout}</header>
  <div className="panel-body" id={`${id}-body`} inert={!expanded} aria-hidden={!expanded} data-collapsed={!expanded} data-animating={animating} onTransitionEnd={event=>{if(event.target===event.currentTarget&&event.propertyName==='grid-template-rows')setAnimating(false);}}><div className="panel-body-content"><Visibility.Provider value={expanded}>{children}</Visibility.Provider></div></div>
 </section>;
}
