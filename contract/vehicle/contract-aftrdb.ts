import { StateInterface, ActionInterface, VoteInterface } from "./faces-aftrdb";

const mode = 'PROD';    // If TEST, SmartWeave not used & messages print to console.

function ThrowError(msg: string) {
    // @ts-expect-error
    if (mode === 'TEST') {
        throw('ERROR: ' + msg);
    } else {
        throw new ContractError(msg);
    }
}
declare const ContractError: any;
declare const SmartWeave: any;

export async function handle(state: StateInterface, action: ActionInterface) {
    const balances = state.balances;
    const input = action.input;
    const caller = action.caller;
    const settings: Map<string, any> = new Map(state.settings);
    const votes: VoteInterface[] = state.votes;
    let target = '';
    let balance = 0;
    

    let block = 0;
    // @ts-expect-error
    if (mode === 'TEST') {
        block = 210;
    } else {
        block = +SmartWeave.block.height;
    }

    if (input.function === "balance") {
        // View balance

        target = isArweaveAddress(input.target || caller);

        if (typeof target !== "string") {
            ThrowError("Must specificy target to get balance for.");
        }
        balance = 0;
        if (target in balances) {
            balance = balances[target];
        }

        return { result: { target, balance } };
    }

    if (input.function === 'validate') {
        // Check to see if contract is in DB
        const vehicles = state.vehicles;

        if (typeof input.contractId !== "string") {
            ThrowError("contractId is invalid.");
        }
        const contractId = isArweaveAddress(input.contractId);

        let isInContract = false;
        let depBlock = 0;
        if (contractId in vehicles) {
            depBlock = vehicles[contractId];
            isInContract = true;
        }

        return { result: { contractId, depBlock, isInContract } };
    }

    if (input.function === "transfer") {
        const target = input.target;
        const qty = input.qty;
        const callerAddress = isArweaveAddress(caller);
        const targetAddress = isArweaveAddress(target);

        if (!Number.isInteger(qty)) {
            ThrowError('Invalid value for "qty". Must be an integer.');
        }
        if (!targetAddress) {
            ThrowError("No target specified.");
        }
        if (qty <= 0 || callerAddress === targetAddress) {
            ThrowError("Invalid token transfer.");
        }
        if (!(callerAddress in balances)) {
            ThrowError("Caller doesn't own a balance in the Vehicle.");
        }
        if (balances[callerAddress] < qty) {
            ThrowError(`Caller balance not high enough to send ${qty} token(s)!`);
        }
        balances[callerAddress] -= qty;
        if (targetAddress in balances) {
            balances[targetAddress] += qty;
        } else {
            balances[targetAddress] = qty;
        }

        return { state };
    }

    if (input.function === "deposit") {
        // Add a new contract to the aftrContracts object

        // Validate contractId
        if (typeof input.contractId !== "string") {
            ThrowError("contractId is invalid.");
        }
        const contractId = isArweaveAddress(input.contractId);

        // Validate that this is coming from AFTR
        /*** How do I do that?? */

        // { contractId : block when created }
        // Only deposit if contract is not there already
        if (!state.vehicles[contractId]) {
            state.vehicles[contractId] = block;
        }
        
        return { state };
    }
}

function isArweaveAddress(addy: string) {
    const address = addy.toString().trim();
    if (!/[a-z0-9_-]{43}/i.test(address)) {
        ThrowError('Invalid Arweave address.');
    }

    return address;
}
