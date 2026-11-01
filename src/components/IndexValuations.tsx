import {displayDate,number} from '../lib/market-format';
import './market-overview.css';
export interface IndexValuation {name:string;code:string;date:string;pb:{value:number|null;percentile:number|null};ps:{value:number|null;percentile:number|null}}
/** Source, period and dates are supplied with the prepared view. No fetching or
 * historical percentile calculation belongs in this display component. */
export default function IndexValuations({rows,source,period}:{rows:IndexValuation[];source:{name:string;url:string};period:string}){
 const metric=(reading:IndexValuation['pb'])=>{const p=reading.percentile,valid=p!==null&&Number.isFinite(p)&&p>=0&&p<=100;return <div className="valuation-reading"><b>{valid?`${number(p,1)}%`:'—'}</b><span className="valuation-track" aria-hidden="true">{valid&&<i style={{width:`${p}%`}}/>}</span><small>{reading.value===null?'—':`${number(reading.value)}倍`}</small></div>;};
 return <section className="index-valuations" aria-label="指数估值"><header className="overview-heading"><h3>指数估值</h3><span>{period}</span></header><table><colgroup><col className="valuation-name-column"/><col/><col/></colgroup><thead><tr><th scope="col">指数</th><th scope="col">PB 分位</th><th scope="col">PS 分位</th></tr></thead><tbody>{rows.map(row=><tr key={row.code}><th scope="row"><strong>{row.name}</strong><small>{row.code}</small><time dateTime={row.date}>{displayDate(row.date,true)}</time></th><td>{metric(row.pb)}</td><td>{metric(row.ps)}</td></tr>)}</tbody></table><footer><a href={source.url} target="_blank" rel="noreferrer">{source.name}</a></footer></section>;
}
