export interface StateInterface {
    name: string,
    ticker: string,
    balances: {
        [addr: string]: number,                       // lessee wallet addr: number of seats leased
    },
    creator: string,                                // Wallet of creator of vehicle
    seats?: number,                                  // Number of available seats in vehicle
    lockPeriod?: number,                             // Period of time in blocks that vehicle runs (lockPeriod can be renewed)
    pricePerSeat?: number,                           // Price per seat is customizable
    minLength?: number,                              // Minimum amount of blocks required to lease a seat
    maxLength?: number,                              // Maximum amount of blocks required to lease a seat (maximum can't exceed lockPeriod)
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
    leases?: {
        [lessee: string]: [                           // lessee wallet address
            {
                start: number,                            // Leased seat start time in blocks
                end: number,                              // Leased seat end time in blocks
            }
        ],
    },
    settings: Map<string, any>
}

export interface BalanceInterface {
    function: 'balance',
    target: string,
    balance?: number,
    ticker?: string,
}

export interface ActionInterface {
    input: any,
    caller: string,
}

export interface InputInterface {
    function: 'lease' | 'withdrawal',
    target?: string,
    qty?: number,
    multi?: boolean
}

export interface TransferInterface {
    function: 'transfer',
    target: string,
    qty: number,
}

export interface DepositInterface {
    function: 'deposit',
    txId: string,
    //*** The following information is to confirm the tx */
    source?: string,
    depositBlock?: number,
    tokenId?: string,
    target?: string,
    qty?: number,
    lockLength?: number,
}

/*** NO LONGER NEED STATUS CHANGE B/C EVERY CHANGE WILL PROCESS THROUGH THE VOTING SYSTEM */
// export interface StatusChangeInterface {
//     function: 'statusChange',
//     status: string,
// }

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