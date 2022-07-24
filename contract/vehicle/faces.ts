export interface StateInterface {
    name: string;
    ticker: string;
    balances: {
        [addr: string]: number;                 // lessee wallet addr: number of seats leased
    };
    creator: string;                            // Wallet of creator of vehicle
    seats?: number;                             // Number of available seats in vehicle
    lockPeriod?: number;                        // Period of time in blocks that vehicle runs (lockPeriod can be renewed)
    pricePerSeat?: number;                      // Price per seat is customizable
    minLength?: number;                         // Minimum amount of blocks required to lease a seat
    maxLength?: number;                         // Maximum amount of blocks required to lease a seat (maximum can't exceed lockPeriod)
    ownership: 'single' | 'dao' | 'dmm';
    votingSystem?: 'equal' | 'weighted';        // Member votes count equally or weighted based on token balance
    status: 'stopped' | 'started' | 'expired';  // Vehicle status can be stopped (not accepting leases), started (running), or expired (lock period has expired without being renewed)
    tipsAr?: number;
    tipsMisc?: number;
    treasury?: number;
    dmm?: DmmInterface | {};                    // Supports members being added using Demand Modulated Model (DMM)
    vault: {
        [key: string]: [{
            balance: number;    // Positive integer
            end: number;        // At what block the lock ends.
            start: number       // At what block the lock starts.
        }]
    }  | {};
    votes: VoteInterface[]  | [];
    tokens?: [ TokenInterface ] | [];
    leases?: {
        [lessee: string]: [         // lessee wallet address
            {
                start: number;      // Leased seat start time in blocks
                end: number;        // Leased seat end time in blocks
            }
        ];
    };
    invocations: string[] | [];                 // Required for Foreign Call Protocol (FCP)
    foreignCalls: ForeignCallInterface[] | [];  // Required for Foreign Call Protocol (FCP)
    settings: Map<string, any>
}

export interface BalanceInterface {
    function: 'balance';
    target: string;
    balance?: number;
    ticker?: string;
}

export interface DmmInterface {
    txFee?: number;                 // Transaction fee if needed
    txBuyFee?: number;              // Transaction fee for buy side if needed
    txSellFee?: number;             // Transaction fee for sell side if needed
    startingPrice: 1;               // Use integers, for floating point, use the int as a factor
    price: number;                  // Tracks current price
    qty?: number;                   // Tracks number of purchasers if helpful
    buys?: number;                  // Tracks number bought if helpful
    sells?: number;                 // Tracks number sold if helpful
    history?: DmmTxInterface[];
}

export interface DmmTxInterface {
    txID: string;
    block: number;
    recipient: string;
    price: number;
}

export interface ActionInterface {
    input: any;
    caller: string;
}

export interface InputInterface {
    function: 'balance' | 'lease' | 'propose' | 'vote' | 'transfer' | 'withdrawal' | 'readOutbox' | 'multiInteraction' | 'evolve';
    type?: string;
    recipient?: string;
    target?: string;
    qty?: number;
    key?: string;
    value?: string;
    note?: string;
    actions?: InputInterface[]
}

export interface TransferInterface {
    function: 'transfer';
    target: string;
    qty: number;
}

export interface DepositInterface {
    function: 'deposit';
    txID: string;
    //*** The following information is to confirm the tx */
    source?: string;
    depositBlock?: number;
    tokenId?: string;
    target?: string;
    qty?: number;
    lockLength?: number;
}

/*** NO LONGER NEED STATUS CHANGE B/C EVERY CHANGE WILL PROCESS THROUGH THE VOTING SYSTEM */
// export interface StatusChangeInterface {
//     function: 'statusChange';
//     status: string;
// }

export interface TokenInterface {
    txID: string;
    tokenId: string;
    source: string;
    balance: number;
    start: number;          // Stamp when added
    lockLength?: number;    // Planning for temporary loaning of tokens to a vehicle
    withdrawals?: [];       // Array of transfer objects
}

export interface VoteInterface {
    status?: 'active' | 'quorumFailed' | 'passed' | 'failed';
    type?: 'mint' | 'burn' | 'indicative' | 'set' | 'addMember' | 'mintLocked' | 'removeMember' | 'assetDirective' | 'withdrawal' ;
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
    txID?: string;
    votingPower?: { [addr: string]: number };   // Copy of membership voting power for a specific vote
  }

  export interface ForeignCallInterface {
    txID: string;
    contract: string;
    input: InputInterface
  }