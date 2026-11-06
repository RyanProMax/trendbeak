// Both existing and current pages receive the same materialized snapshot contract.
export const DATA_VERSION = "market-overview-v3";
export function fetchQuote(url:string,init:RequestInit={}) {return fetch(url,init);}
