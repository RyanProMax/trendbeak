// Both existing and current pages receive the same materialized snapshot contract.
export const DATA_VERSION = "snapshot-v1";
export function fetchQuote(url:string,init:RequestInit={}) {return fetch(url,init);}
