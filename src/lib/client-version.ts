// Both existing and current pages receive the same materialized snapshot contract.
export const DATA_VERSION = "market-overview-v23";
export function fetchQuote(url:string,init:RequestInit={}) {return fetch(url+(url.includes('?')?'&':'?')+'view=sentiment-v1',init);}
