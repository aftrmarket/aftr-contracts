import { StateInterface, ActionInterface, BalanceInterface, InputInterface, VoteInterface } from "./faces";

declare const ContractError: any;
declare const SmartWeave: any;

// Multi-interaction variables
const multiLimit = 1000;    // Limit recursive calls to 1000 (need to evaluate this)
let multiIteration = 0;

/*** Tip Constants */
const tipCreateVehicle = 0;
const tipProposeVote = 0;
const tipVote = 0;
const tipMemberMgmt = 0;
/*** */

export async function handle(state: StateInterface, action: ActionInterface) {
    const balances = state.balances;
    //const leases = state.leases;      /*** Leasing seats from vehicle is a future enhancement / use case */
    const input = action.input;
    const caller = action.caller;
    const settings: Map<string, any> = new Map(state.settings);
    const votes: VoteInterface[] = state.votes;
    let target = '';
    let balance = 0;

    const votingSystem = state.votingSystem ? state.votingSystem : "weighted";

    /*** MULTI-INTERACTION */
    /*** Multi-interactions allows for multiple contract interactions in a single transaction */
    /*** If multi is set to true on the action input, then the call is a multi-interaction and therefore the following applies: */
    /***    1. Tips should only be accrued once. */
    /***    2. Because multi-interactions are recursive, a maximum limit is set to protect the contract (not sure if this is necessary, but just in case :) */
    if (typeof input.iteration !== 'undefined') {
        if (isNaN(input.iteration)) {
            throw new ContractError("Invalid value for iteration.");
        } else {
            multiIteration = input.iteration;
        }
    }
    /*** */

    const block = +SmartWeave.block.height;


    if (input.function === "balance") {
        // View balance

        target = isArweaveAddress(input.target || caller);

        if (typeof target !== "string") {
            throw new ContractError("Must specificy target to get balance for.");
        }
        balance = 0;
        if (target in balances) {
            balance = balances[target];
        }
    }

    /*** FUNCTIONALITY NOT YET IMPLEMENTED
    if (input.function === "lease") {
        // Lease a seat, subtract balance from owner wallet, add to lessee
        const target = input.target;  // Address of lessee
        const qty = input.qty;        // Number of seats to lease

        if (!Number.isInteger(qty)) {
            throw new ContractError('Invalid value for "qty". Must be an integer.');
        }
        if (qty <= 0 || caller === target) {
            throw new ContractError("Invalid token lease.");
        }
        
        return { state };
    }
    ****/

    /******* BEGIN VOTING FUNCTIONS */
    if (input.function === "propose") {
        const voteType = input.type;
        let note = input.note;
        let target = input.target;
        let qty = +input.qty;
        let key = input.key;
        let value = input.value;
        let voteLength = input.voteLength;
        let lockLength = input.lockLength;
        let start = input.start;
        let txID = input.txID;
        

        // Check valid inputs, caller is member with balance or member in vault
        if (!(caller in balances) || !(balances[caller] > 0)) { 
            // Not in balances, now check vault
            let totalBalance = 0;
            if (state.vault[caller]) {
                for (let bal of state.vault[caller]) {
                    totalBalance += bal.balance;
                }
            }
            if (totalBalance === 0) {
                throw new ContractError("Caller is not allowed to propose vote.")
            }
        }

        // Determine weight of a vote
        // Default is weighted meaning votes are weighted by balance
        // If the votingSystem is equal (or distributed evenly):  all votes counted equally
        // Make sure to count the members in the balances object and the vault objects
        // Equal weighting can be dangerous if the balance holder decides to transfer tokens to many different people thus adding members to the vehicle. In this case, they could take over the vehicle.
        
        let totalWeight = 0;
        let votingPower = JSON.parse(JSON.stringify(balances));

        if (state.ownership === 'single') {
            // Validate - Single ownership, so caller must be creator
            if (caller !== state.creator) {
                throw new ContractError("Caller is not the creator of the vehicle.");
            }

            // votingPower and totalWeight is already known
            votingPower = { [caller] : 1 };
            totalWeight = 1;

        } else if (votingSystem === 'equal') {
            // Determine votingPower at the current time of this proposal
            // First, loop thru balances, remove anyone with a 0 balance
            for (let addr in votingPower) {
                if (votingPower[addr] > 0) {
                    votingPower[addr] = 1;
                    totalWeight++;
                } else {
                    delete votingPower[addr];
                }   
            }
        
            // Next, get any members that are in the vault, but not in the balances object
            for (let addr in state.vault) {
                if (!(addr in votingPower)) {
                    // Make sure a new address isn't in the vault and if it is, that its balance isn't 0
                    let totalLockedBalance = 0;
                    for (let bal of state.vault[addr]) {
                        totalLockedBalance += bal.balance;
                    }
                    if (totalLockedBalance > 0) {
                        totalWeight++;
                        votingPower[addr] = 1;
                    }
                }
            }
        } else if (votingSystem === 'weighted') {
            // Sum all the balances in balances object
            for (let member in balances) {
                totalWeight += balances[member];
            }
            
            // Sum all the rest of the balances in the vault object
            for (let addr in state.vault) {
                let totalLockedBalance = 0;
                for (let bal of state.vault[addr]) {
                    totalLockedBalance += bal.balance;
                    totalWeight += bal.balance;
                }
                if (votingPower[addr]) {
                    votingPower[addr] += totalLockedBalance;
                } else {
                    votingPower[addr] = totalLockedBalance;
                }
            }
        } else {
            throw new ContractError("Invalid voting system.");
        }     

        // Validate input for member and token management
        let recipient = '';

        // Determine start and voteLength
        if (state.ownership === 'single') {
            voteLength = 0;
        } else if (!voteLength || typeof voteLength === 'undefined') {
            voteLength = settings.get('voteLength');
        } else if (voteLength < 0) {
            throw new ContractError("Invalid Vote Length.");
        }

        if (lockLength || typeof lockLength !== 'undefined') {
            if (lockLength < 0) {
                throw new ContractError("Invalid Lock Length.");
            }
        } else {
            lockLength = 0;
        }

        if (!start || typeof start === 'undefined') {
            start = block;
        } else if (start < 0 || typeof start !== 'number') {
            throw new ContractError("Invalid Start value.");
        }

        if (voteType === 'mint' || voteType === 'burn' || voteType === 'mintLocked' || voteType === 'addMember' || voteType === 'removeMember') {
            if (!input.recipient) {
                throw new ContractError("Error in input.  Recipient not supplied.");
            }
            recipient = isArweaveAddress(input.recipient);
            
            if (!(qty) || !(qty > 0)) {
                throw new ContractError("Error in input.  Quantity not supplied or is invalid.");
            }

            // Check to see if qty is too big
            if (voteType === 'mint' || voteType === 'addMember' || voteType === 'mintLocked') {
                let totalTokens = 0;
                for (let wallet in balances) {
                    totalTokens += balances[wallet];
                }
                if (totalTokens + qty > Number.MAX_SAFE_INTEGER) {
                    throw new ContractError("Proposed quantity is too large.");
                }
            }

            // Check to see if trying to burn more than possible
            if (voteType === 'burn') {
                if (!balances[recipient]) {
                    throw new ContractError("Request to burn for recipient not in balances.");
                }
                if (qty > balances[recipient]) {
                    throw new ContractError("Invalid quantity.  Can't burn more than recipient has.");
                }
            }

            // Check for trying to remove creator
            if (voteType === 'removeMember') {
                if (recipient === state.creator) {
                    throw new ContractError("Can't remove creator from balances.");
                }
            }

            // Check for trying to add the vehicle to itself as a member
            if (voteType === 'addMember') {
                if (recipient === SmartWeave.contract.id) {
                    throw new ContractError("Can't add the vehicle as a member.");
                }
            }

            if (voteType === 'mint') {
                note = "Mint " + String(qty) + " tokens for " + recipient;
            } else if (voteType === 'mintLocked') {
                note = "Mint and Lock " + String(qty) + " tokens for " + recipient;
            } else if (voteType === 'burn') {
                note = "Burn " + String(qty) + " tokens for " + recipient;
            } else if (voteType === 'addMember') {
                note = "Add new member, " + recipient + ", and mint " + String(qty) + " tokens";
            } else if (voteType === 'removeMember') {
                note = "Remove member, " + recipient + ", and burn their " + String(qty) + " tokens";
            }
        } else if (voteType === 'set') {
            // Validate properties
            if (!key || key === '') {
                throw new ContractError("Invalid Key.");
            }
            if (!value || value === '') {
                throw new ContractError("Invalid Value.");
            }

            const validationResponce = validateProperties(key, value);
            if (validationResponce !== "") {
                throw new ContractError(validateProperties);
            }

            // Get current value for key in state
            let currentValue = String(getStateValue(state, key));
            
            note = "Change " + getStateProperty(key) + " from " + currentValue + " to " + String(value);
        } else if (voteType === 'assetDirective') {
            // A vote to direct assets
            /**** FUTURE ADD */
            
        } else if (voteType === 'withdrawal') {
            if (!(qty) || !(qty > 0)) {
                throw new ContractError("Error in input.  Quantity not supplied or is invalid.");
            }
            if (!input.txID) {
                throw new ContractError("Error in input.  No Transaction ID found.");
            }
            txID = input.txID;
            if (!target) {
                throw new ContractError("Error in input.  Target not supplied.");
            }
            target = isArweaveAddress(target);

            // Is this qty available for withdrawal?
            const tokenObj = state.tokens?.find( (token) => (token.txID === txID) );

            if (tokenObj && tokenObj.balance < qty) {
                throw new ContractError("Not enough " + tokenObj.tokenId + " tokens to withdrawal.");
            }

        } else {
            throw new ContractError("Vote Type not supported.");
        }

        // Create Vote ID
        let voteId = String(SmartWeave.block.height) + SmartWeave.transaction.id + String(multiIteration);


        let vote: VoteInterface = {
            status: 'active',
            type: voteType,
            id: voteId,
            totalWeight: totalWeight,
            votingPower: votingPower,
            yays: 0,
            nays: 0,
            voted: [],
            start: start,
            lockLength: lockLength,
            voteLength: voteLength
        }
        if (recipient !== '') {
            vote.recipient = recipient;
        }
        if (target && target !== '') {
            vote.target = target;
        }
        if (qty) {
            vote.qty = qty;
        }
        if (key && key !== '') {
            vote.key = key;
        }
        if (value && value !== '') {
            vote.value = value;
        }
        if (note && note !== '') {
            vote.note = note;
        }
        if (txID && txID !== '') {
            vote.txID = txID;
        }

        votes.push(vote);
    }

    if (input.function === "vote") {
        const voteId = input.voteId;
        const cast = input.cast;
        
        const vote = votes.find(vote => vote.id === voteId);

        if (typeof vote === 'undefined') {
            throw new ContractError("Vote does not exist.");
        }

        // Is caller allowed to vote?  Check votingPower for this vote
        let voterBalance = 0;

        if (state.ownership === 'single' && caller !== state.creator) {
            throw new ContractError("Caller is not the owner of the vehicle.");
        
        //@ts-expect-error
        } else if (!(caller in vote.votingPower)) {
        //if (!(caller in balances || caller in state.vault)) {
            throw new ContractError("Caller isn't a member of the vehicle and therefore isn't allowed to vote.");
        } else {
            // Get caller's votingPower
            //@ts-expect-error
            voterBalance = vote.votingPower[caller];
        }

        // Make sure caller's balance is not zero
        if (voterBalance == 0) {
            throw new ContractError("Caller's balance is 0 and therefore isn't allowed to vote.");
        }

        // Is vote over?
        if (vote.status !== 'active') {
            throw new ContractError("Vote is not active.");
        }

        // Has caller already voted?
        //@ts-expect-error
        if (vote.voted.includes(caller)) {
            throw new ContractError("Caller has already voted.");
        }
        
        // Record vote
        if (cast === 'yay') {
            //@ts-expect-error
            vote.yays += voterBalance;
        } else if (cast === 'nay') {
            //@ts-expect-error
            vote.nays += voterBalance;
        } else {
            throw new ContractError('Invalid vote cast.');
        }
        //@ts-expect-error
        vote.voted.push(caller);
    }
    /******* END VOTING FUNCTIONS */

    if (input.function === "transfer") {
        const target = input.target;
        const qty = input.qty;
        const callerAddress = isArweaveAddress(caller);
        const targetAddress = isArweaveAddress(target);

        if (!Number.isInteger(qty)) {
            throw new ContractError('Invalid value for "qty". Must be an integer.');
        }
        if (!targetAddress) {
            throw new ContractError("No target specified.");
        }
        if (qty <= 0 || callerAddress === targetAddress) {
            throw new ContractError("Invalid token transfer.");
        }
        if (!(callerAddress in balances)) {
            throw new ContractError("Caller doesn't own a balance in the Vehicle.");
        }
        if (balances[callerAddress] < qty) {
            throw new ContractError(`Caller balance not high enough to send ${qty} token(s)!`);
        }
        if (SmartWeave.contract.id === target) {
            throw new ContractError("A vehicle token cannot be transferred to itself because it would add itself the balances object of the vehicle, thus changing the membership of the vehicle without a vote.");
        }

        // if new qty is <= 0 and the caller is the creator of a single owner vehicle, the transfer is not allowed
        if ((state.ownership === "single") && (callerAddress === state.creator) && (balances[callerAddress] - qty <= 0)) {
            throw new ContractError("Invalid transfer because the creator's balance would be 0.");
        }

        balances[callerAddress] -= qty;
        if (targetAddress in balances) {
            balances[targetAddress] += qty;
        } else {
            balances[targetAddress] = qty;
        }
    }

    /*** This is the original w/d function that worked with FCP */
    // if (input.function === "withdrawal") {
    //     if (!state.tokens) {
    //         throw new ContractError("This vehicle has no tokens.")
    //     }

    //     if (!input.txID) {
    //         throw new ContractError("Missing Transaction ID.");
    //     }
    //     if (!input.voteId) {
    //         throw new ContractError("Missing Vote ID.")
    //     }

    //     // Is the transaction approved?
    //     //@ts-expect-error
    //     const tokenIndex = state.tokens.findIndex(token => token.txID === input.txID);
    //     if (tokenIndex !== -1) {
    //         //@ts-expect-error
    //         if (state.tokens[tokenIndex].withdrawals) {
    //             //@ts-expect-error
    //             const wdIndex = state.tokens[tokenIndex].withdrawals.findIndex( wd => wd.voteId === input.voteId);
                            
    //             if (wdIndex !== -1) {
    //                 //@ts-expect-error
    //                 let invokeInput = JSON.parse(JSON.stringify(state.tokens[tokenIndex].withdrawals[wdIndex]));
    //                 delete invokeInput.voteId;
    //                 delete invokeInput.txID;
    //                 delete invokeInput.processed;

    //                 // Add to foreignCalls array just like an invoke in a normal contract would
    //                 invoke(state, invokeInput);

    //                 // Update deposits
    //                 //@ts-expect-error
    //                 state.tokens[tokenIndex].balance -= invokeInput.invocation.qty;

    //                 // Remove withdrawals object from the token object
    //                 //@ts-expect-error
    //                 state.tokens[tokenIndex].withdrawals = state.tokens[tokenIndex].withdrawals.filter( wd => wd.voteId !== input.voteId);
    //         }
            
    //         } else {
    //             throw new ContractError("Withdrawal not found.");
    //         }
    //     } else {
    //         throw new ContractError("Invalid withdrawal transaction.");
    //     }
    // }

    if (input.function === 'deposit') {
        // Transfer tokens into vehicle
        if (!input.txID) {
            throw new ContractError("The transaction is not valid.  Tokens were not transferred to the vehicle.");
        }
        if (!input.tokenId) {
            throw new ContractError("No token supplied. Tokens were not transferred to the vehicle.");
        }
        if (input.tokenId === SmartWeave.contract.id) {
            throw new ContractError("Deposit not allowed because you can't deposit an asset of itself.");
        }
        if (!input.qty || typeof +input.qty !== "number" || +input.qty <= 0) {
            throw new ContractError("Qty is invalid.");
        }

        let lockLength = 0;
        if (input.lockLength) {
            lockLength = input.lockLength;
        }

        /*** Call the claim function on the depositing contract */
        const transferResult = await SmartWeave.contracts.write(input.tokenId, {
            function: "claim",
            txID: input.txID,
            qty: input.qty
        });

        if (transferResult.type !== "ok") {
            throw new ContractError("Unable to deposit token " + input.tokenId);
        }

        // Claimed is ok, so now update the AFTR vehicle's state token object to reflect the deposit
        const tokenInfo = await getTokenInfo(transferResult.state);
        const txObj = {
            txID: input.txID,
            tokenId: input.tokenId,
            source: caller,
            balance: input.qty,
            start: SmartWeave.block.height,
            name: tokenInfo.name,
            ticker: tokenInfo.ticker,
            logo: tokenInfo.logo,
            lockLength: lockLength
        };

        // Add to psts object
        if (!state.tokens) {
            // tokens array is not in vehicle
            state['tokens'] = [];
        }
        
        //@ts-expect-error
        state.tokens.push(txObj);
    }

    /*** BEGIN CROSS CONTRACT COMMUNICATION SUPPORT */

    if (input.function === "allow") {
        target = input.target;
        const quantity = input.qty;
    
        if (!Number.isInteger(quantity) || quantity === undefined) {
            throw new ContractError("Invalid value for quantity. Must be an integer.");
        }
        if (!target) {
            throw new ContractError("No target specified.");
        }
        if (target === SmartWeave.contract.id) {
            throw new ContractError("Can't setup claim to transfer a token to itself.");
        }
        if (quantity <= 0 || caller === target) {
            throw new ContractError("Invalid token transfer.");
        }
        if (balances[caller] < quantity) {
            throw new ContractError("Caller balance not high enough to make claimable " + quantity + " token(s).");
        }
    
        balances[caller] -= quantity;
        if (balances[caller] === null || balances[caller] === undefined) {
            balances[caller] = 0;
        }
        state.claimable.push({
            from: caller,
            to: target,
            qty: quantity,
            txID: SmartWeave.transaction.id,
        });
    }

    if (input.function === "claim") {
        // Claim input: txID
        const txID = input.txID;
        // Claim qty
        const qty = input.qty;
    
        if (!state.claimable.length) {
          throw new ContractError("Contract has no claims available.");
        }
        // Search for txID inside of `claimable`
        let obj, index;
        for (let i = 0; i < state.claimable.length; i++) {
            if (state.claimable[i].txID === txID) {
                index = i;
                obj = state.claimable[i];
            }
        }
        if (obj === undefined) {
            throw new ContractError("Unable to find claim.");
        }
        if (obj.to !== caller) {
            throw new ContractError("Claim not addressed to caller.");
        }
        if (obj.qty !== qty) {
            throw new ContractError("Claiming incorrect quantity of tokens.");
        }
        // Check to make sure it hasn't been claimed already
        for (let i = 0; i < state.claims.length; i++) {
            if (state.claims[i] === txID) {
                throw new ContractError("This claim has already been made.");
            }
        }
        // Not already claimed --> can claim
        if (!balances[caller]) {
            balances[caller] = 0;
        }
        balances[caller] += obj.qty;
    
        // remove from claimable
        state.claimable.splice(index, 1);
    
        // add txID to `claims`
        state.claims.push(txID);
    }

    /*** END  CROSS CONTRACT COMMUNICATION SUPPORT */

    if (input.function === "multiInteraction") {
        /*** A multi-interaction is being called.  
         * This allows multiple changes to be proposed at once.
         * It's a recursive call to the handle function.
         * The function expects an object of proposed changes
         * and will loop through calling the handle function recurrsively.
        */

        if (typeof input.actions === 'undefined') {
            throw new ContractError("Invalid Multi-interaction input.");
        }

        const multiActions = input.actions;
        
        if (multiActions.length > multiLimit) {
            throw new ContractError("The Multi-interactions call exceeds the maximum number of interations.");
        }

        let iteration = 1;
        let updatedState = state;

        for(let nextAction of multiActions) {
            nextAction.input.iteration = iteration;
            
            // Don't allow nested multiActions
            if (nextAction.input.function === 'multiInteraction') {
                throw new ContractError("Nested Multi-interactions are not allowed.");
            }

            // Add the caller to the action
            nextAction.caller = caller;

            let result =  await handle(updatedState, nextAction);
            //@ts-expect-error
            updatedState = result.state;

            iteration++;
        }
        state = updatedState;
    }

    // Find concluded votes in order to finalize
    /***
     * Look for
     * voteLength has passed OR single ownership vehicle (no voteLength required)
     * AND status of vote == 'active'
    ***/

    if (Array.isArray(votes)) {
        //@ts-expect-error
        const concludedVotes = votes.filter(vote => ((block >= vote.start + vote.voteLength || state.ownership === 'single' || vote.yays / vote.totalWeight > settings.get("support") || vote.nays / vote.totalWeight > settings.get("support")) && vote.status === 'active'));        
        if (concludedVotes.length > 0) {
            await finalizeVotes(state, concludedVotes, settings.get('quorum'), settings.get('support'), block);
        }
    }

    if (multiIteration <= 1) {
        // Only handle tips one time
        // Handle tips to vehicle balance holders
        /**** TODO */


        // Unlock tokens in vault
        if (state.vault && typeof state.vault === "object") {
            scanVault(state, block);
        }

        // Check for any expired loaned tokens
        if (state.tokens) {
            returnLoanedTokens(state, block);
        }
    }

    if (input.function === 'balance') {
        let vaultBal = 0;
        try {
            for (let bal of state.vault[caller]) {
                vaultBal += bal.balance;
            }
        } catch(e) {
            // Vault not iterable
        }
        return { result: { target, balance, vaultBal } };
    } else {
        return { state };
    }
}


function isArweaveAddress(addy: string) {
    const address = addy.toString().trim();
    if (!/[a-z0-9_-]{43}/i.test(address)) {
        throw new ContractError('Invalid Arweave address.');
    }

    return address;
}

function scanVault(vehicle, block) {
    /*** 
     * Scans the vault and unlocks any balances that have passed their required lock time. 
     * When it's time for a balance to be unlocked, the balance is moved from the vault to the balances object.
    */

    for (const [key, arr] of Object.entries(vehicle.vault)) {
        // @ts-expect-error
        for(let i=0; i < arr.length; i++) {
            //@ts-expect-error
            if (arr[i].end <= block) {
                // Transfer balance
                if (key in vehicle.balances) {
                    //@ts-expect-error
                    vehicle.balances[key] += arr[i].balance;
                } else {
                    //@ts-expect-error
                    vehicle.balances[key] = arr[i].balance;
                }
    
                // Remove object
                vehicle.vault[key].splice(i, 1);
                i--;
            }
            // Clean up empty objects
            if (vehicle.vault[key].length == 0) {
                delete vehicle.vault[key];
            }
        }
    }
}

function returnLoanedTokens(vehicle, block) {
    // Loaned tokens are locked for the value of the lockLength.  If the lockLength === 0, then the tokens aren't loaned.
    if (Array.isArray(vehicle.tokens)) {
        const unlockedTokens = vehicle.tokens.filter((token) => (token.lockLength !== 0 && token.start + token.lockLength <= block));
        unlockedTokens.forEach(token => processWithdrawalOld(vehicle, token));
    }
}

function getStateProperty(key: string) {
    if (key.substring(0, 9) === 'settings.') {
        // Key is in Settings map
        key = key.substring(9);
    }
    return key;
}

function getStateValue(vehicle: StateInterface, key) {
    const settings: Map<string, any> = new Map(vehicle.settings);
    let value = '';

    if (key.substring(0, 9) === 'settings.') {
        let setting = key.substring(9);
        value = settings.get(setting);
    } else {
        value = vehicle[key];
    }
    return value;
}
function validateProperties(key: string, value: any) {
    let response = "";

    // Validate Quorum and Support
    if (key === "settings.quorum" && (value < 0 || value > 1)) {
        response = "Quorum must be between 0 and 1.";
    }
    if (key === "settings.support" && (value < 0 || value > 1)) {
        response = "Support must be between 0 and 1."
    }

    // Make sure that owner is a valid value
    if (key === "creator" && !/[a-z0-9_-]{43}/i.test(value)) {
        response = "Proposed owner is invalid."
    }

    return response;
}

function processWithdrawalOld(vehicle, tokenObj) {
    // Utilize the Foreign Call Protocol to return tokens to orginal source
    /**** FOREIGN CALL PROTOCOL to call transfer function on token's smart contract */


    // Update state by finding txID if Withdrawal was successful
    if (Array.isArray(vehicle.tokens)) {
        vehicle.tokens = vehicle.tokens.filter(token => token.txID !== tokenObj.txID);
    }
}

/*** USED FOR FCP - NO LONGER NEEDED */
// function invoke(state, input) {
//     /****
//      * There is no invoke condition in an AFTR Vehicle b/c votes have to be passed in order to transfer tokens out of a vehicle.
//      * So, this function must be called from within the AFTR Vehicle.
//      */

//     // Ensure that the interaction has an invocation object
//     if (!input.invocation) {
//         throw new ContractError("Missing function invocation.");
//     }

//     if (!input.invocation.function) {
//         throw new ContractError("Invalid invocation.");
//     }
    
//     // Ensure that the interaction has a foreign contract ID
//     if (!input.foreignContract) {
//         throw new ContractError("Missing Foreign Contract ID.");
//     }

//     if (typeof input.foreignContract !== 'string') {
//         throw new ContractError("Invalid Foreign Contract ID.");
//     }
    
//     if (typeof input.foreignContract !== 'string') {
//         throw new ContractError("Invalid input.");
//     }

//     // Prevent contract from calling itself
//     if (input.foreignContract === SmartWeave.contract.id) {
//         throw new ContractError("A Foreign Call cannot call itself.");
//     }

//     // Push call to foreignCalls
//     state.foreignCalls.push({
//         txID: SmartWeave.transaction.id,
//         contract: input.foreignContract,
//         input: input.invocation
//     });
// }

async function finalizeVotes(vehicle, concludedVotes, quorum, support, block) {
    // Loop thru all concluded votes
    // concludedVotes.forEach( vote => {
    for (let vote of concludedVotes) {
        let finalQuorum = 0.0;
        let finalSupport = 0.0;

        // If single owned or total support has been met, pass vote (voteLength doesn't matter)
        if (vehicle.ownership === 'single' || vote.yays / vote.totalWeight > support) {
                vote.statusNote = vehicle.ownership === "single" ? "Single owner, no vote required." : "Total Support achieved before vote length timeline.";
                vote.status = 'passed';
                await modifyVehicle(vehicle, vote);
        } else if (vote.nays / vote.totalWeight > support) {
            vote.statusNote = "No number of yays can exceed the total number of nays. The proposal fails before the vote length timeline.";
            vote.status = "failed";
        } else if (block > vote.start + vote.voteLength) {
            // Vote length has expired, so now check quorum and support
            finalQuorum = (vote.yays + vote.nays) / vote.totalWeight;
            if (vote.totalWeight * quorum > vote.yays + vote.nays) {
                // Must pass quorum
                vote.status = 'quorumFailed';
                vote.statusNote = "The proposal failed due to the Quorum not being met. The proposal's quorum was " + String(finalQuorum);
            } else if (vote.yays / (vote.yays + vote.nays) > support) {
                // Must pass support
                finalSupport = vote.yays / (vote.yays + vote.nays);
                vote.status = 'passed';
                vote.statusNote = "The proposal passed with " + String(finalSupport) + " support of a " + String(finalQuorum) + " quorum.";
                await modifyVehicle(vehicle, vote);
            }
        } else {
            // Vote failed
            vote.status = 'failed';
            finalQuorum = (vote.yays + vote.nays) / vote.totalWeight;
            finalSupport = vote.yays / (vote.yays + vote.nays);
            vote.statusNote = "The proposal achieved " + String(finalSupport) + " support of a " + String(finalQuorum) + " quorum which was not enough to pass the proposal.";
        }
    };
}

async function modifyVehicle(vehicle, vote) {
    if (vote.type === 'mint' || vote.type === 'addMember') {
        if (vote.recipient in vehicle.balances) {
            // Wallet already exists in state, add tokens
            vehicle.balances[vote.recipient] += vote.qty;
        } else {
            // Wallet is new
            vehicle.balances[vote.recipient] = vote.qty;
        }
    } else if (vote.type === 'mintLocked') {
        let vaultObj = {
            balance: vote.qty,
            start: vote.start,
            end: vote.start + vote.lockLength
        }
        if (vote.recipient in vehicle.vault) {
            // Add to existing
            vehicle.vault[vote.recipient].push(vaultObj);
        } else {
            // Add new
            vehicle.vault[vote.recipient] = [ vaultObj ];
        }
    } else if (vote.type === 'burn') {
        vehicle.balances[vote.recipient] -= vote.qty;
    } else if (vote.type === 'removeMember') {
        delete vehicle.balances[vote.recipient];
    } else if (vote.type === 'set') {
        if (vote.key.substring(0, 9) === 'settings.') {
            // key is a setting
            let key = getStateProperty(vote.key);
            updateSetting(vehicle, key, vote.value);
        } else {
            vehicle[vote.key] = vote.value;
        }
    // } else if (vote.type === 'withdrawal') {
    //     // Find the token object that is to be w/d
    //     const tokenObj = vehicle.tokens.find( (token) => (token.txID === vote.txID) );
    //     let input = {
    //         function: "withdrawal",
    //         foreignContract: tokenObj.tokenId,
    //         invocation: {
    //             function: "transfer",
    //             target: vote.target,
    //             qty: vote.qty
    //         }
    //     };
    //     if (vehicle.ownership === "single") {
    //         // Vehicle can change now, proceed with FCP by calling invoke immediately
    //         invoke(vehicle, input);

    //         // Update deposits
    //         /*** Is there a way to validate this amount at a later time if the transfer fails? */
    //         tokenObj.balance -= vote.qty;
    //     } else {
    //         // Votes will be required to process the withdrawal, so add to the withdrawals array of the token object until the vote is passed
    //         input["voteId"] = vote.id;
    //         input["processed"] = false;
    //         input["txID"] = vote.txID;
    //         if (!tokenObj.withdrawals) {
    //             tokenObj["withdrawals"] = [];
    //         }
    //         tokenObj.withdrawals.push(input);
    //     }
    } else if (vote.type === 'withdrawal') {
        // Find the token object that is to be w/d
        const tokenObj = vehicle.tokens.find( (token) => (token.txID === vote.txID) );
        const contractId = tokenObj.tokenId;
        const wdResult = await SmartWeave.contracts.write(contractId , {
            function: "transfer",
            target: vote.target,
            qty: vote.qty
        });

        if (wdResult.type !== "ok") {
            throw new ContractError("Unable to withdrawal " + contractId + " for " + vote.target + ".");
        }

        // Update tokens object to reflect w/d
        tokenObj.balance -= vote.qty;
    }
}

function updateSetting(vehicle, key, value) {
    let found = false;
    for (let setting of vehicle.settings) {
        if (setting[0] === key) {
            // Found, so update existing setting
            setting[1] = value;
            found = true;
            break;
        }
    }
    if (!found) {
        // Not found, so add new setting
        vehicle.settings.push([key, value]);
    }
}

async function getTokenInfo(assetState: object) {
    //@ts-expect-error
    const settings: Map<string, any> = new Map(assetState.settings);
    
    return {
        //@ts-expect-error
        name: assetState.name,
        //@ts-expect-error
        ticker: assetState.ticker,
        logo: settings.get("communityLogo")
    };
}
