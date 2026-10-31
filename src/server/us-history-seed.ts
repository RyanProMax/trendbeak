import { createUSHistoryChain } from "./us-history-artifact";

// Deliberately no seed provider or admission: third-party redistribution is pending.
// Once a source is approved, bind its reviewed static JSON and exact digest here.
// The candidate bundle lives outside the repository and is never imported by glob.
export const usHistoryChain = createUSHistoryChain();
