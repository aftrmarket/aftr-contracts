# The AFTR Protocol Contract

The AFTR state follows common practices established by early SmartWeave contracts such as CommunityXYZ. We call treasuries created using the protocol, AFTR vehicles. A vehicle's state is as follows:

```typescript
{
    name: string,
    ticker: string,
    balances: {
        [addr: string]: number,                     
    },
    creator: string,                                // Wallet of creator of vehicle
    seats?: number,                                 // Number of available seats in vehicle
    ownership: 'single' | 'dao',                    // Owned by a single wallet or a DAO
    votingSystem: 'equal' | 'weighted',            // Member votes count equally or weighted based on token balance
    status: 'stopped' | 'started' | 'expired',      // Vehicle status can be stopped, started, or expired (lock period has expired without being renewed)
    vault: {                                        // Locked member tokens
        [key: string]: [{
            balance: number,    // Positive integer
            end: number,        // At what block the lock ends.
            start: number       // At what block the lock starts.
        }]
    },
    votes: VoteInterface[],
    invocations: string[],                          // Required for Foreign Call Protocol (FCP)
    foreignCalls: {                                 // Required for Foreign Call Protocol (FCP)
        contract: string,
        input: InputInterface
    }[],
    tokens?: [                                      // Tokens stored in vehicle
        TokenInterface,
    ],
    settings: Map<string, any>
}
```
## Settings
AFTR vehicles use the standard settings in SmartWeave contracts. Here are some of the standard ones:

```typescript
  settings: [   // Array of a Map<string, any>
      ["quorum", number],                   // quorum is between 0.01 and 0.99
      ["support", number],                  // Between 0.01-0.99, how much % yays for a proposal to be approved
      ["voteLength", number],               // How many blocks to leave a proposal open
      ["lockMinLength", number],            // Minimum lockLength allowed
      ["lockMaxLength", number],            // Maximum lockLength allowed
      ["communityAppUrl", string],
      ["communityDiscussionLinks", string],
      ["communityDescription", string],
      ["communityLogo", string],
      ["evolve", string]
  ]
```


## Interfaces

### Input Interface
```typescript
InputInterface {
    function: 'balance' | 'lease' | 'propose' | 'vote' | 'transfer' | 'withdrawal' | 'multiInteraction';
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
    txId: string,
    tokenId: string,
    name: string,
    ticker: string,
    logo: string,
    source: string,
    balance: number,
    start: number,          // Stamp when added
    lockLength?: number,    // Tokens can be loaned to a vehicle. A 0 value indicates no loan.
}
```

### Vote Interface
The VoteInterface is similar to the vote interface in CommunityXYZ with a few additions.

```typescript
VoteInterface {
    status?: 'active' | 'quorumFailed' | 'passed' | 'failed';
    statusNote?: string;
    type?: 'mint' | 'burn' | 'indicative' | 'set' | 'addMember' | 'mintLocked' | 'removeMember' | 'assetDirective';
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
    voteLength?: number;    // Length of vote must be stored inside vote in case the settings.voteLength changes
    lockLength?: number;    // Length of blocks when minting locked tokens
    txID?: string;          // Used during withdrawal for validation
  }
```

All changes to the vehicle state with the exception of deposits are handled through the voting functions. When a vote is proposed, the contract checks to see if the vehicle is owned by a single member or a DAO. If the ownership is single, then the vote processes immediately without requiring passed votes. If the ownership is DAO, then the contract using the voting system settings (votingSystem, voteLength, and quorum) to process the vote. If the vote passes, then the contract makes the proposed change to the vehicle.

### Contract Interaction Interface
```typescript
ContractInteractionInterface {
    function: 'invoke';
    foreignContract: string;
    invocation: InputInterface
}
```
For more information on the Foreign Call Protocol (FCP), see the [FCP Spec](https://www.notion.so/Foreign-Call-Protocol-Specification-61e221e5118a40b980fcaade35a2a718).

## Functions in the AFTR Smart Contract

### Balance
The balance function is used to view a balance of a vehicle member. If a target is not supplied in the input, then the balance of the caller is returned.

The return value is an object containing the target, balance, and locked balance.
```json
{ "abd7DMW1A8-XiGUVn5qxHLseNhkJ5C1Cxjjbj6XC3M8", 10000, 1000 }
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
The deposit function transfers Arweave assets into the vehicle. The caller must supply the Token ID and Transaction ID in order for the AFTR contract to verify the token transfer. Once verified, the vehicle state is updated to show the assets in the token array of objects.

#### Sample Deposit Action
```typescript
const depAction = {
    input: {
        function: 'deposit',
        tokenId: 'ggDeF2IFS7mcun_utV-e6ZY9SNu1UhhWuvo7zNbUhRg',
        txId: 'BoRZeKy5kudTtI1TS2CMri8XNC4MPqMnBkCm2BV9i4F'
    }
};
```

### Withdrawal
The withdrawal function utilizes the [Foreign Call Protocol (FCP)](https://www.notion.so/Foreign-Call-Protocol-Specification-61e221e5118a40b980fcaade35a2a718) to transfers tokens out of the vehicle. Arweave PSTs or assets must support the FCP in order for this to work.

In an AFTR Contract, a withdrawal is proposed and then the vehicle contract determines when to process the withdrawal based on a successful vote result (If the vehicle is a single owner vehicle, the vote is passed immediately).  Once a withdrawal vote is passed, then the AFTR contract calls an invoke function within the contract to initiate the invoke stage of the FCP.

Next, another interaction needs to be sent to the AFTR contract to read its outbox object to complete the 2nd stage of the FCP.

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

const readOutboxAction = {
    input: {
        function: "readOutbox",
        contract: "<AFTR VEHICLE CONTRACT ID>"
    }
};
```

### Propose
The propose function is how most changes to the vehicle are proposed. For single ownership vehicles, changes are sent to the contract as proposals, but then the proposals are passed during the next contract read event. By implementing changes to single ownership and DAO ownership vehicles the same way, consistency is maintained.

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
- Multiple changes to the vehicle can be processed in one call.
- Tips, token unlocking, and returning loaned tokens are handled only once in the first iteration of the multi-interaction.
- The contract limits the number of actions inside of a multi-interaction to 1000, which should be more than enough.
- If a multi-interaction is called from a DAO owned vehicle, then the number of proposed votes will be equal to the number of actions bundled into the call.

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