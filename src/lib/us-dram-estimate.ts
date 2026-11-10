import codes from '../../data/us-dram-assumptions.json';
import {validReading,DRAM_METHOD,DRAM_SOURCE_VERSION} from './dram-contract.mjs';
export {DRAM_METHOD};
export const DRAM_ASSUMPTIONS=codes;
export type DRAMAssumption={code:keyof typeof codes;scope:'fund'|'issuer';issuerIsin?:string;issuerName?:string};
export type DRAMMetric = {value:number|null; knownAt:string|null; complete:boolean};
export type DRAMEstimate = {code:'DRAM';seriesId:'S000102337';methodVersion:typeof DRAM_METHOD;sourceVersion:typeof DRAM_SOURCE_VERSION;economicDate:string;priceDate:string;holdingsKnownAt:string;metrics:{pb:DRAMMetric;ps:DRAMMetric};assumptions:{swapCoefficient:1;items:DRAMAssumption[]}};
export function validDRAMEstimate(r:unknown,selected:string):r is DRAMEstimate{return validReading(r,selected,codes);}
