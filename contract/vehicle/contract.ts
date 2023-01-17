import { StateInterface, ActionInterface, BalanceInterface, InputInterface, VoteInterface } from "./faces";

declare const ContractError: any;
declare const SmartWeave: any;

// Multi-interaction variables
const multiLimit = 1000;    // Limit recursive calls to 1000 (need to evaluate this)
let multiIteration = 0;

export async function handle(state: StateInterface, action: ActionInterface) {
    const balances = state.balances;
    //const leases = state.leases;      /*** Leasing seats from repo is a future enhancement / use case */
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

        let totalWeight = 0;
        let votingPower = JSON.parse(JSON.stringify(balances));

        if (state.ownership === 'single') {
            // Validate - Single ownership, so caller must be owner
            if (caller !== state.owner) {
                throw new ContractError("Caller is not the owner of the repo.");
            }

            // votingPower and totalWeight is already known
            votingPower = { [caller]: 1 };
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

        if (voteType === "evolve") {
            if (!input.value) {
                throw new ContractError("Error in input.  No value exists.");
            }
            const evolveSrcId = isArweaveAddress(input.value);
            note = "Evolve contract to " + evolveSrcId + ". Verify the new contract source here. https://aftr.market/latest-contract-source";
        } else if (voteType === 'addBalance' || voteType === 'subtractBalance' || voteType === 'addLocked' || voteType === 'addMember' || voteType === 'removeMember') {
            if (!input.recipient) {
                throw new ContractError("Error in input.  Recipient not supplied.");
            }
            recipient = isArweaveAddress(input.recipient);

            if (!(qty) || !(qty > 0)) {
                throw new ContractError("Error in input.  Quantity not supplied or is invalid.");
            }

            // Check to see if qty is too big
            if (voteType === 'addBalance' || voteType === 'addMember' || voteType === 'addLocked') {
                let totalTokens = 0;
                for (let wallet in balances) {
                    totalTokens += balances[wallet];
                }
                if (totalTokens + qty > Number.MAX_SAFE_INTEGER) {
                    throw new ContractError("Proposed quantity is too large.");
                }
            }

            // Check to see if trying to decrease more than possible
            if (voteType === 'subtractBalance') {
                if (!balances[recipient]) {
                    throw new ContractError("Request to decrease for recipient not in balances.");
                }
                if (qty > balances[recipient]) {
                    throw new ContractError("Invalid quantity.  Can't decrease more than recipient has.");
                }
                if (state.ownership === 'single' && balances[recipient] - qty < 1 && recipient === state.owner) {
                    throw new ContractError("Invalid quantity.  Can't decrease all the owner's balance.  The owner must have at least a balance of 1 or the repo will be rendered useless.");
                }
            }

            // Check for trying to remove owner
            if (voteType === 'removeMember') {
                if (recipient === state.owner) {
                    throw new ContractError("Can't remove owner from balances.");
                }
            }

            // Check for trying to add the repo to itself as a member
            if (voteType === 'addMember') {
                if (recipient === SmartWeave.contract.id) {
                    throw new ContractError("Can't add the repo as a member.");
                }
            }

            if (!isProposedOwnershipValid(state, voteType, qty, recipient)) {
                throw new ContractError("The proposed change is not allowed as it would leave the ownership of the repo with no balance thus rendering the repo useless.");
            }

            if (voteType === 'addBalance') {
                note = "Add balance of " + String(qty) + " to " + recipient;
            } else if (voteType === 'addLocked') {
                note = "Add and Lock a balance of " + String(qty) + " for " + recipient;
            } else if (voteType === 'subtractBalance') {
                note = "Subtract balance of " + String(qty) + " for " + recipient;
            } else if (voteType === 'addMember') {
                note = "Add new member, " + recipient + ", with a balance of " + String(qty);
            } else if (voteType === 'removeMember') {
                note = "Remove member, " + recipient + ", with a balance of " + String(qty);
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
                throw new ContractError(validationResponce);
            }

            if (key === "owner") {
                if (!isProposedOwnershipValid(state, voteType, qty, value)) {
                    throw new ContractError("The proposed change is not allowed as it would leave the ownership of the repo with no balance thus rendering the repo useless.");
                }
            }

            // Get current value for key in state
            let currentValue = String(getStateValue(state, key));
            note = "Change " + getStateProperty(key) + " from " + currentValue + " to " + String(value);
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
            const tokenObj = state.tokens?.find((token) => (token.txID === txID));

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

        if (state.ownership === 'single' && caller !== state.owner) {
            throw new ContractError("Caller is not the owner of the repo.");

            //@ts-expect-error
        } else if (!(caller in vote.votingPower)) {
            //if (!(caller in balances || caller in state.vault)) {
            throw new ContractError("Caller isn't a member of the repo and therefore isn't allowed to vote.");
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

    if (input.function === "finalize") {
        /***
         * The purpose of this function is to provide an interaction that can be used so that finalize functions of the contract can be run.
         * For example, if a vote runs the entire vote length on a multiply owned repo, an interaction is required to finalize the vote and update the state.
         * This function allows for that interaction.  Not that, nothing is done; this function simply provides a way for callers to run the finalize functions
         * of the contract.
         *  */
        if (state.ownership !== "multi") {
            // Only allow multiply owned repos to call this function
            throw new ContractError('Only multi-owned repos can use the finalize function.');
        }
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
        if (!balances[callerAddress] || balances[callerAddress] == undefined || balances[callerAddress] == null || isNaN(balances[callerAddress])) {
            throw new ContractError("Caller doesn't own a balance in the Repo.");
        }
        if (balances[callerAddress] < qty) {
            throw new ContractError(`Caller balance not high enough to send ${qty} token(s)!`);
        }
        if (SmartWeave.contract.id === target) {
            throw new ContractError("A repo token cannot be transferred to itself because it would add itself the balances object of the repo, thus changing the membership of the repo without a vote.");
        }

        // if new qty is <= 0 and the caller is the owner of a single owner repo, the transfer is not allowed
        if ((state.ownership === "single") && (callerAddress === state.owner) && (balances[callerAddress] - qty <= 0)) {
            throw new ContractError("Invalid transfer because the owner's balance would be 0.");
        }

        balances[callerAddress] -= qty;
        if (targetAddress in balances) {
            balances[targetAddress] += qty;
        } else {
            balances[targetAddress] = qty;
        }
    }

    if (input.function === 'deposit') {
        // Transfer tokens into repo
        if (!input.txID) {
            throw new ContractError("The transaction is not valid.  Tokens were not transferred to the repo.");
        }
        if (!input.tokenId) {
            throw new ContractError("No token supplied. Tokens were not transferred to the repo.");
        }
        if (input.tokenId === SmartWeave.contract.id) {
            throw new ContractError("Deposit not allowed because you can't deposit an asset of itself.");
        }
        if (!input.qty || typeof +input.qty !== "number" || +input.qty <= 0) {
            throw new ContractError("Qty is invalid.");
        }

        let lockLength = input.lockLength ? input.lockLength : 0;

        /*** Call the claim function on the depositing contract */
        const transferResult = await SmartWeave.contracts.write(input.tokenId, {
            function: "claim",
            txID: input.txID,
            qty: input.qty
        });

        if (transferResult.type !== "ok") {
            throw new ContractError("Unable to deposit token " + input.tokenId);
        }

        // Claimed is ok, so now update the AFTR repo's state token object to reflect the deposit
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
            // tokens array is not in repo
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
            throw new ContractError("Can't setup claim to transfer a balance to itself.");
        }
        if (quantity <= 0 || caller === target) {
            throw new ContractError("Invalid balance transfer.");
        }
        if (balances[caller] < quantity || !balances[caller] || balances[caller] == undefined || balances[caller] == null || isNaN(balances[caller])) {
            throw new ContractError("Caller balance not high enough to make a balance of " + quantity + "claimable.");
        }

        balances[caller] -= quantity;

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

        for (let nextAction of multiActions) {
            nextAction.input.iteration = iteration;

            // Don't allow nested multiActions
            if (nextAction.input.function === 'multiInteraction') {
                throw new ContractError("Nested Multi-interactions are not allowed.");
            }

            // Add the caller to the action
            nextAction.caller = caller;

            let result = await handle(updatedState, nextAction);
            //@ts-expect-error
            updatedState = result.state;

            iteration++;
        }
        state = updatedState;
    }

    // Find concluded votes in order to finalize
    /***
     * Look for
     * voteLength has passed OR single ownership repo (no voteLength required)
     * AND status of vote == 'active'
    ***/

    if (Array.isArray(votes)) {
        //@ts-expect-error
        const concludedVotes = votes.filter(vote => ((block >= vote.start + vote.voteLength || state.ownership === 'single' || vote.yays / vote.totalWeight > settings.get("support") || vote.nays / vote.totalWeight > settings.get("support") || vote.totalWeight === vote.yays + vote.nays) && vote.status === 'active'));
        if (concludedVotes.length > 0) {
            await finalizeVotes(state, concludedVotes, settings.get('quorum'), settings.get('support'), block);
        }
    }

    if (multiIteration <= 1) {
        // Only handle tips one time
        // Handle tips to repo balance holders
        /**** TODO */


        // Unlock tokens in vault
        if (state.vault && typeof state.vault === "object") {
            scanVault(state, block);
        }

        // Check for any expired loaned tokens
        if (state.tokens) {
            await returnLoanedTokens(state, block);
        }
    }

    if (input.function === 'balance') {
        let vaultBal = 0;
        try {
            for (let bal of state.vault[caller]) {
                vaultBal += bal.balance;
            }
        } catch (e) {
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

function scanVault(repo, block) {
    /*** 
     * Scans the vault and unlocks any balances that have passed their required lock time. 
     * When it's time for a balance to be unlocked, the balance is moved from the vault to the balances object.
    */

    for (const [key, arr] of Object.entries(repo.vault)) {
        // @ts-expect-error
        for (let i = 0; i < arr.length; i++) {
            //@ts-expect-error
            if (arr[i].end <= block) {
                // Transfer balance
                if (key in repo.balances) {
                    //@ts-expect-error
                    repo.balances[key] += arr[i].balance;
                } else {
                    //@ts-expect-error
                    repo.balances[key] = arr[i].balance;
                }

                // Remove object
                repo.vault[key].splice(i, 1);
                i--;
            }
            // Clean up empty objects
            if (repo.vault[key].length == 0) {
                delete repo.vault[key];
            }
        }
    }
}

async function returnLoanedTokens(repo, block) {
    // Loaned tokens are locked for the value of the lockLength.  If the lockLength === 0, then the tokens aren't loaned.
    if (Array.isArray(repo.tokens)) {
        const unlockedTokens = repo.tokens.filter((token) => (token.lockLength !== 0 && token.start + token.lockLength <= block));
        for (let token of unlockedTokens) {
            const wdResult = await SmartWeave.contracts.write(token.tokenId, {
                function: "transfer",
                target: token.source,
                qty: token.balance
            });
        }
    }
}

function getStateProperty(key: string) {
    if (key.substring(0, 9) === 'settings.') {
        // Key is in Settings map
        key = key.substring(9);
    }
    return key;
}

function getStateValue(repo: StateInterface, key) {
    const settings: Map<string, any> = new Map(repo.settings);
    let value = '';

    if (key.substring(0, 9) === 'settings.') {
        let setting = key.substring(9);
        value = settings.get(setting);
    } else {
        value = repo[key];
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
    if (key === "owner" && !/[a-z0-9_-]{43}/i.test(value)) {
        response = "Proposed owner is invalid."
    }

    return response;
}

async function finalizeVotes(repo, concludedVotes, quorum, support, block) {
    // Loop thru all concluded votes
    for (let vote of concludedVotes) {
        let finalQuorum = 0.0;
        let finalSupport = 0.0;

        // If single owned or total support has been met, pass vote (voteLength doesn't matter)
        if (repo.ownership === 'single' || vote.yays / vote.totalWeight > support) {
            vote.statusNote = repo.ownership === "single" ? "Single owner, no vote required." : "Total Support achieved before vote length timeline.";
            vote.status = 'passed';
            await modifyRepo(repo, vote); 
        } else if (vote.nays / vote.totalWeight > support) {
            vote.statusNote = "No number of yays can exceed the total number of nays. The proposal fails before the vote length timeline.";
            vote.status = "failed";
        } else if (block > vote.start + vote.voteLength) {
            // Vote length has expired, so now check quorum and support
            finalQuorum = (vote.yays + vote.nays) / vote.totalWeight;
            if (vote.totalWeight * quorum > vote.yays + vote.nays) {
                // Must pass quorum
                vote.status = 'quorumFailed';
                vote.statusNote = "The proposal failed due to the Quorum not being met. The proposal's quorum was " + String(finalQuorum) + ".";
            } else if (vote.yays / (vote.yays + vote.nays) > support) {
                // Must pass support
                finalSupport = vote.yays / (vote.yays + vote.nays);
                vote.status = 'passed';
                vote.statusNote = "The proposal passed with " + String(finalSupport) + " support of a " + String(finalQuorum) + " quorum.";
                await modifyRepo(repo, vote);
            } else {
              // Vote failed on support
              vote.status = 'failed';
              finalSupport = vote.yays / (vote.yays + vote.nays);
              vote.statusNote = "The proposal failed due to lack of support. The proposal's support was " + String(finalSupport) + ".";
            }
        } else {
            // Vote failed
            vote.status = 'failed';
            finalQuorum = (vote.yays + vote.nays) / vote.totalWeight;
            finalSupport = vote.yays / (vote.yays + vote.nays);
            vote.statusNote = "The proposal achieved " + String(finalSupport) + " support of a " + String(finalQuorum) + " quorum which was not enough to pass the proposal.";
        }
    }
}

async function modifyRepo(repo, vote) {
    if (vote.type === 'addBalance' || vote.type === 'addMember') {
        if (vote.recipient in repo.balances) {
            // Wallet already exists in state, add balance
            repo.balances[vote.recipient] += vote.qty;
        } else {
            // Wallet is new
            repo.balances[vote.recipient] = vote.qty;
        }
    } else if (vote.type === 'addLocked') {
        let vaultObj = {
            balance: vote.qty,
            start: vote.start,
            end: vote.start + vote.lockLength
        }
        if (vote.recipient in repo.vault) {
            // Add to existing
            repo.vault[vote.recipient].push(vaultObj);
        } else {
            // Add new
            repo.vault[vote.recipient] = [vaultObj];
        }
    } else if (vote.type === 'subtractBalance') {
        if (!isProposedOwnershipValid(repo, vote.type, vote.qty, vote.recipient)) {
            throw new ContractError("The proposed change is not allowed as it would leave the ownership of the repo with no balance thus rendering the repo useless.");
        }
        repo.balances[vote.recipient] -= vote.qty;
    } else if (vote.type === 'removeMember') {
        if (!isProposedOwnershipValid(repo, vote.type, vote.qty, vote.recipient)) {
            throw new ContractError("The proposed change is not allowed as it would leave the ownership of the repo with no balance thus rendering the repo useless.");
        }
        delete repo.balances[vote.recipient];
    } else if (vote.type === 'set') {
        if (vote.key.substring(0, 9) === 'settings.') {
            // key is a setting
            let key = getStateProperty(vote.key);
            updateSetting(repo, key, vote.value);
        } else {
            if (vote.key === "owner" && !isProposedOwnershipValid(repo, vote.type, vote.qty, vote.value)) {
                throw new ContractError("The proposed change is not allowed as it would leave the ownership of the repo with no balance thus rendering the repo useless.");
            }
            repo[vote.key] = vote.value;
        }
    } else if (vote.type === 'evolve') {
        repo.evolve = vote.value;
    } else if (vote.type === 'withdrawal') {
        // Find the token object that is to be w/d
        const tokenObj = repo.tokens.find((token) => (token.txID === vote.txID));
        const contractId = tokenObj.tokenId;
        const wdResult = await SmartWeave.contracts.write(contractId, {
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

function updateSetting(repo, key, value) {
    let found = false;
    for (let setting of repo.settings) {
        if (setting[0] === key) {
            // Found, so update existing setting
            setting[1] = value;
            found = true;
            break;
        }
    }
    if (!found) {
        // Not found, so add new setting
        repo.settings.push([key, value]);
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

function isProposedOwnershipValid(repo: StateInterface, proposalType: string, qty: number, member: string) {
    let valid = true;
    if (proposalType === "subtractBalance" && !Number.isInteger(qty)) {
        valid = false;
    }

    if (proposalType === "removeMember") {
        if (repo.ownership === "single" && repo.owner === member) {
            valid = false;
        } else if (repo.ownership === "multi") {
            // Loop through proposed balances and determine is anyone will have a balance left
            let newBalances = JSON.parse(JSON.stringify(repo.balances));
            delete newBalances[member];

            for (let addr in newBalances) {
                if (newBalances[addr] > 0 && Number.isInteger(newBalances[addr])) {
                    valid = true;
                    break;
                } else {
                    valid = false;
                }
            }
        }
    } else if (proposalType === "subtractBalance") {
        if (repo.ownership === "single" && repo.owner === member && repo.balances[member] - qty < 1) {
            valid = false;
        }
        if (repo.ownership === "multi") {
            // Loop through proposed balances and determine is anyone will have a balance left
            let newBalances = JSON.parse(JSON.stringify(repo.balances));
            newBalances[member] -= qty;

            for (let addr in newBalances) {
                if (newBalances[addr] > 0 && Number.isInteger(newBalances[addr])) {
                    valid = true;
                    break;
                } else {
                    valid = false;
                }
            }
        }
    } else if (proposalType === "set") {
        if (repo.ownership === "single" && (repo.balances[member] < 1 || !repo.balances[member])) {
            valid = false;
        }
    }
    return valid;
}
