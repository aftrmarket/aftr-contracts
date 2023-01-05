export interface StateInterface {
    name: string,
    ticker: string,
    balances: {
        [addr: string]: number;                 // lessee wallet addr: number of seats leased
    };
    owner: string;                            // Wallet of owner of repo
    ownership: 'single' | 'multi';
    votingSystem: 'equal' | 'weighted';        // Member votes count equally or weighted based on token balance
    status: 'stopped' | 'started' | 'expired';  // Current not used.  Repo status can be stopped (not accepting leases), started (running), or expired (lock period has expired without being renewed)
    ///dmm?: DmmInterface | {};                    // Supports members being added using Demand Modulated Model (DMM) - POTENTIAL FUTURE ADD
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
    claimable: ClaimableInterface[],                // Required for supporting Internal Writes
    claims: string[],                               // Required for supporting Internal Writes
    evolve?: string,
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
    function: 'balance' | 'lease' | 'propose' | 'vote' | 'transfer' | 'multiInteraction' | 'allow' | 'claim' | 'evolve',
    type?: string,
    recipient?: string,
    target?: string,
    qty?: number,
    key?: string,
    value?: string,
    note?: string,
    actions?: InputInterface[]
}
/*
export interface TransferInterface {
    function: 'transfer',
    target: string,
    qty: number,
}
*/
export interface DepositInterface {
    function: 'deposit',
    txID: string,
    tokenId: string,
    qty: number,
    lockLength?: number,
}

export interface TokenInterface {
    txID: string,
    tokenId: string,
    source: string,
    balance: number,
    start: number,          // Stamp when added
    lockLength?: number,    // Planning for temporary loaning of tokens to a repo
}

export interface VoteInterface {
    status?: 'active' | 'quorumFailed' | 'passed' | 'failed';
    statusNote?: string;
    type?: 'addBalance' | 'subractBalance' | 'indicative' | 'set' | 'addMember' | 'incLocked' | 'removeMember' | 'withdrawal' | 'externalInteraction' | 'evolve';
    id?: string;
    totalWeight?: number;
    recipient?: string;
    target?: string;
    qty?: number;
    key?: string;
    value?: any;
    note?: string;
    votingPower?: {
        [addr: string]: number  // Saved snapshot of voting power during a given vote
    };
    yays?: number;
    nays?: number;
    voted?: string[];
    start?: number;
    voteLength?: number;        // Length of vote must be stored inside vote in case the settings.voteLength changes
    lockLength?: number;        // Length of blocks when incing locked tokens
    txID?: string;              // Used during withdrawal for validation
  }

  export interface ClaimableInterface {
    from: string;
    to: string;
    qty: number;
    txID: string;
  }