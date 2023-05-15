# The AFTR Protocol Contract

The AFTR state follows common practices established by early SmartWeave contracts such as CommunityXYZ. We call groups of assets or treasuries created using the protocol, AFTR repos. A repo's state is as follows:

```typescript
{
    name: string,
    ticker: string,
    balances: {
        [addr: string]: number,                     
    },
    owner: string,                                // Wallet of owner of repo
    ownership: 'single' | 'multi',                   // Owned by a single wallet or multiple owners
    votingSystem: 'equal' | 'weighted',             // Member votes count equally or weighted based on token balance
    status: 'stopped' | 'started' | 'expired',      // Repo status can be stopped, started, or expired (lock period has expired without being renewed) - CURRENTLY NOT USED
    vault: {                                        // Locked member tokens
        [key: string]: [{
            balance: number,                        // Positive integer
            end: number,                            // At what block the lock ends.
            start: number                           // At what block the lock starts.
        }]
    },
    votes: VoteInterface[],
    tokens?: [                                      // Assets stored in repo
        TokenInterface,
    ],
    claimable: ClaimableInterface[],                // Required for Internal Writes
    claims: string[],                               // Required for Internal Writes
    functions?: Array<'transfer' | 'deposit' | 'allow' | 'claim' | 'multiInteraction'> | [],
    evolve?: string,
    settings: Map<string, any>
}
```
## Function Privileges

There are several functions that can be turned off in a repo contract.  For these functions to be enabled, they must be listed in the state.functions array.  Valid values for the **functions** array include the following:
```typescript
["transfer", "deposit", "allow", "claim", "multiInteraction"] | []
```

- **Transfer** - Gives the repo the ability to transfer membership balances.
- **Deposit** - Allows anyone to deposit supported Arweave assets into the repo.
- **Allow** - Required for tradability protocols such as Verto Flex.
- **Claim** - Required for tradability protocols such as Verto Flex.
- **Multi-Interactions** - Gives the repo the ability to perform more than one change at a time.

Note that if the functions parameter is undefined or not an array on the state, then the contract defaults to allow all privileges to ensure backwards compatibility with older states.

## Settings
AFTR repos use the standard settings in SmartWeave contracts. Here are some of the standard ones:

```typescript
  settings: [                               // Array of a Map<string, any>
      ["quorum", number],                   // quorum is between 0.01 and 0.99
      ["support", number],                  // Between 0.01-0.99, how much % yays for a proposal to be approved
      ["voteLength", number],               // How many blocks to leave a proposal open
      ["lockMinLength", number],            // Minimum lockLength allowed
      ["lockMaxLength", number],            // Maximum lockLength allowed
      ["communityAppUrl", string],
      ["communityDiscussionLinks", string],
      ["communityDescription", string],
      ["communityLogo", string]
  ]
```


## Interfaces

### Input Interface
```typescript
InputInterface {
    function: 'balance' | 'lease' | 'propose' | 'vote' | 'multiInteraction' | 'allow' | 'claim';
    type?: string;
    recipient?: string;
    target?: string;
    qty?: number;
    key?: string;
    value?: string;
    note?: string;
    actions?: InputInterface[]  // For multi-interaction function
}
```


### Token Interface
```typescript
TokenInterface {
    txID: string,
    tokenId: string,
    source: string,
    balance: number,
    start: number,          // Stamp when added
    lockLength?: number,    // Tokens can be loaned to a repo. A 0 or undefined value indicates no loan.
}
```

### Vote Interface
The VoteInterface is similar to the vote interface in CommunityXYZ with a few additions.

```typescript
VoteInterface {
    status?: 'active' | 'quorumFailed' | 'passed' | 'failed';
    statusNote?: string;
    type?: 'addBalance' | 'subtractBalance' | 'set' | 'addMember' | 'addLocked' | 'removeMember' | 'withdrawal' | 'externalInteraction' | 'evolve';
    id?: string;
    totalWeight?: number;
    recipient?: string;
    target?: string;
    qty?: number;
    key?: string;
    value?: any;
    note?: string;
    votingPower?: {             // Saved snapshot of voting power during given vote
        [addr: string]: number 
    }
    yays?: number;
    nays?: number;
    voted?: string[];
    start?: number;
    voteLength?: number;        // Length of vote must be stored inside vote in case the settings.voteLength changes
    lockLength?: number;        // Length of blocks when minting locked tokens
    txID?: string;              // Used during withdrawal for validation
  }
```

All changes to the repo state with the exception of deposits are handled through the voting functions. When a vote is proposed, the contract checks to see if the repo is owned by single or multiple members. If the ownership is single, then the vote processes immediately without requiring passed votes. If the ownership is multiple, then the contract using the voting system settings (votingSystem, voteLength, and quorum) to process the vote. If the vote passes, then the contract makes the proposed change to the repo.

**Vote Types**
- addBalance - A vote to add voting power to a member's balance.
- subtractBalance - A vote to subtract voting power from a member's balance.
- set - A vote to set or add a state property or setting.
- addMember - A vote to add a member to the repo with a balance of the specifide quantity.
- addLocked - A vote to add a locked balance for a member of the repo (i.e. adding a member balance to the vault).
- removeMember - A vote to remove a member of the repo, thus removing all their voting power.
- withdrawal - A vote to withdrawal assets from the repo and transfer them to another wallet. This removes the balance from the repo's token object and transfers the balance from the repo to the wallet inside the asset's contract.
- externalInteraction - A vote to send an interaction to another contract.
- evolve - A vote to evolve the contract to a new source. Expects a new contract source ID in the value property.

### ClaimableInterface
The ClaimableInterface is used when an Allow interaction is called. When an Allow interaction is called on a repo, a Claimable object is pushed onto the Claimable array telling the repo that another contract will come to claim these tokens in the object.
```typescript
ClaimableInterface {
    from: string;
    to: string;
    qty: number;
    txID: string;
  }
```

## Functions in the AFTR Smart Contract

### Evolve
The evolve function allows the repo to be updated to a new source contract. 
```typescript
const evolveAction = {
    input: {
        function: 'evolve',
        value: '<NEW-CONTRACT-SOURCE-ID>',
    }
};
```

### Balance
The balance function is used to view a balance of a repo member. If a target is not supplied in the input, then the balance of the caller is returned.

The return value is an object containing the target, balance, and locked balance.
```json
{ "result": { "target": "abd7DMW1A8-XiGUVn5qxHLseNhkJ5C1Cxjjbj6XC3M8", "balance": 10000, "vaultBal": 1000 } }
```

#### Sample Balance Action
```typescript
const balAction = {
    input: { 
        function: 'balance',
        target: 'abd7DMW1A8-XiGUVn5qxHLseNhkJ5C1Cxjjbj6XC3M8'
    }
};
```

### Transfer
The transfer function works just like in other SmartWeave contracts; it transfers the balance from the caller to the target.

#### Sample Transfer Action
```typescript
const txAction = {
    input: {
        function: 'transfer',
        target: 'Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I',
        qty: 300
    }
};
```


### Deposit
The deposit function transfers Arweave assets into the repo. In order to do this, 2 interactions must be called on 2 contracts:
- First, a claim must be setup on the the asset being deposited into the repo.  To do this, you must call the allow function on the asset and your wallet must own the number of assets being deposited:
```javascript
const inputAllow = {
    function: "allow",
    target: "<VEHICLE CONTRACT ID>"",
    qty: quantity
};
const allowTxId = await warpWrite(assetId, inputAllow);  // warpWrite is a function that calls the writeInteraction function in Warp
```
- Next, you call the deposit interaction on the repo using the transaction ID of the claim.  When the interaction runs, the AFTR repo internally writes to the deposited asset contract claiming the transaction that was setup in the previous interaction.
```javascript
const inputDep = {
    function: "deposit",
    tokenId: assetId,
    qty: quantity,
    txID: allowTxId // TX ID from the first interaction
};
const allowDepId = await warpWrite(repoId, inputDep);
```

### Withdrawal
In an AFTR Contract, a withdrawal is proposed and then the repo contract determines when to process the withdrawal based on a successful vote result (If the repo is a single owner repo, the vote is passed immediately).  Once a withdrawal vote is passed, the repo contract calls the transfer function on the withdrawn asset's contract using an internal write.  Once that interaction completes successfully, the repo contract then subtracts the withdrawn balance from the token object in the repo.

#### Sample Withdrawal Action
```typescript
const wdAction = { 
    input: {
        function: "propose",
        type: "withdrawal",
        txID: "<TX IN TOKEN OBJECT>",
        target: "<ADDR OF WALLET BEING TRANSFERRED TO>",
        qty: 10,
        note: "<DESCRIPTION OF WITHDRAWAL>"
    }
};
```

### Propose
The propose function is how most changes to the repo are proposed. For single ownership repos, changes are sent to the contract as proposals, but then the proposals are passed during the next contract read event. By implementing changes to single and multiple owned repos the same way, consistency is maintained.

When a proposal is submitted, the contract adds an VoteInterface object to the votes array in the state.  An unique ID is created using the block concatenated with the SmartWeave Transaction ID.

#### Sample Propose Action
```typescript
const proposeVoteAction = {
    input: {
        function: 'propose',
        type: 'set',
        key: 'settings.quorum',
        value: .01
    }
};
```

### Vote
The vote function accepts the vote being cast. Using the votingSystem, the function determines if the votes needs to be weighted or not and then applies the amount to the yay or nay value. It also adds the caller's address to the voted array to track voting history.

#### Sample Vote Action
```typescript
const voteCastAction = {
    input: {
        function: 'vote',
        voteId: '130tx12033012',    // ID for the vote being cast
        cast: 'yay'
    }
};
```

## Multi-Interaction

Multi-interactions allows multiple contract actions to be bundled together in one call to the handle function in the AFTR contract. By setting the input function to 'multiInteraction' and adding an actions array containing all the specific calls separately, the contract will process each of those calls recursively. Please note the folowing regarding multi-interaction calls:
- Multiple changes to the repo can be processed in one call.
- Tips, token unlocking, and returning loaned tokens are handled only once in the first iteration of the multi-interaction.
- The contract limits the number of actions inside of a multi-interaction to 1000, which should be more than enough.
- If a multi-interaction is called from a multi-owned repo, then the number of proposed votes will be equal to the number of actions bundled into the call.

### Sample Multi-Interaction Action
```typescript
const actions = [
    {
        input: {
            function: 'propose',
            type: 'set',
            key: 'name',
            value: 'Alquip'
        }
    },
    {
        input: {
            function: 'propose',
            type: 'set',
            key: 'ticker',
            value: 'AFTR-ALQP'
        }
    },
    {
        input: {
            function: 'propose',
            type: 'set',
            key: 'status',
            value: 'started'
        }
    },
    {
        input: {
            function: 'propose',
            type: 'set',
            key: 'votingSystem',
            value: 'equal'
        }
    },
    {
        input: {
            function: 'propose',
            type: 'set',
            key: 'settings.voteLength', // Note how to propose changes to the settings Map
            value: 200
        }
    },
];

const input =  {
    function: 'multiInteraction',
    type: 'set',
    actions: actions
};
```

## Testing
See the [Testing Documentation](https://github.com/aftrmarket/aftr-contracts/tree/main/tests) to setup a local testing environment using Arlocal.