export interface StateInterface {
    name: string,
    ticker: string,
    balances: {
        [addr: string]: number,
    },
    vehicles: {
        [contractId: string]: number,               // contractId : block created
    },
    creator: string,                                // Wallet of creator of vehicle
    ownership: string,
    votingSystem?: 'equal' | 'weighted',             // Member votes count equally or weighted based on token balance
    status: 'stopped' | 'started' | 'expired',      // Vehicle status can be stopped (not accepting leases), started (running), or expired (lock period has expired without being renewed)
    tipsAr?: number,
    tipsMisc?: number,
    treasury?: number,
    vault: {
        [key: string]: [{
            balance: number, // Positive integer
            end: number, // At what block the lock ends.
            start: number // At what block the lock starts.
        }]
    }  | {},
    votes: VoteInterface[]  | [],
    tokens?: [
        TokenInterface,
    ] | [],
    invocations: string[],                          // Required for Foreign Call Protocol (FCP)
    foreignCalls: {                                 // Required for Foreign Call Protocol (FCP)
        contract: string,
        input: any
    }[],
    settings: Map<string, any>
}

export interface ActionInterface {
    input: any,
    caller: string,
}

export interface TokenInterface {
    txId: string,
    tokenId: string,
    source: string,
    balance: number,
    start: number,   // Stamp when added
    lockLength?: number,    // Planning for temporary loaning of tokens to a vehicle

}

export interface VoteInterface {
    status?: 'active' | 'quorumFailed' | 'passed' | 'failed';
    type?: 'mint' | 'burn' | 'indicative' | 'set' | 'addMember' | 'mintLocked' | 'removeMember' | 'assetDirective';
    id?: string;
    totalWeight?: number;
    recipient?: string;
    target?: string;
    qty?: number;
    key?: string;
    value?: any;
    note?: string;
    yays?: number;
    nays?: number;
    voted?: string[];
    start?: number;
    lockLength?: number;
  }