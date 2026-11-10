export const DRAM_METHOD:'dram-conditional-equity-risk-v2.0.0-ncsrs-fed-reference';
export const DRAM_SOURCE:'sec_ncsrs_fed_conditional_holdings';
export const DRAM_KEY:string;
export function day(v:unknown):v is string;
export function canonical(value:unknown):string;
export function validReading(r:unknown,selected:string,codes:Record<string,unknown>):boolean;
export function validatePrepared(p:any,codes:Record<string,unknown>,kind?:string,date?:string):any;
export function validateAdmission(entries:any,codes:Record<string,unknown>,kind?:string):void;
export function admitted(p:any,entries:any):boolean;
export function validateState(state:any,entries:any,codes:Record<string,unknown>,kind?:string):any;

export const DRAM_SOURCE_VERSION:'DRAM_20260630_NCSRS_000113322826012187_FED_H10_20260706_v1';
