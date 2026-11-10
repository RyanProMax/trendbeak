// Retired display/data family. Ordinary imports, backfills and rollbacks must
// never resurrect it. Exact recovery copies remain offline for separate review.
export const RETIRED_ETF_CODES=Object.freeze(['XLK']);
export function assertActiveETFCodes(codes){
 if(codes.some(code=>RETIRED_ETF_CODES.includes(code)))throw Error('XLK is retired; ordinary import, backfill, repair and restore are disabled');
}
