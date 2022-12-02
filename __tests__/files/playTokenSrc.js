async function handle(state, action) {
  const balances = state.balances;
  const input = action.input;
  const caller = action.caller;
  let canEvolve = true;   // Assume true

  if (state.canEvolve) {
    canEvolve = state.canEvolve;
  }
  if (input.function === 'transfer') {
    const target = input.target;
    const qty = input.qty;

    if (!Number.isInteger(qty)) {
      throw new ContractError('Invalid value for "qty". Must be an integer.');
    }

    if (!target) {
      throw new ContractError('No target specified.');
    }

    if (qty <= 0 || caller === target) {
      throw new ContractError('Invalid token transfer.');
    }

    if (balances[caller] < qty) {
      throw new ContractError(`Caller balance not high enough to send ${qty} token(s)!`);
    }

    // Lower the token balance of the caller
    balances[caller] -= qty;
    if (target in balances) {
      // Wallet already exists in state, add new tokens
      balances[target] += qty;
    } else {
      // Wallet is new, set starting balance
      balances[target] = qty;
    }

    return { state };
  }

  if (input.function === 'mint') {
    if (!input.qty || input.qty <= 0) {
      throw new ContractError('Invalid qty for token mint.');
    }

    if (!Number.isInteger(input.qty)) {
      throw new ContractError('Invalid value for "qty". Must be an integer.');
    }

    if (caller in state.balances) {
      if (state.balances[caller] + input.qty < 100000) {
        // Don't mint more than 100,000 tokens per user
        balances[caller] += input.qty;
      }
    } else {
      if (input.qty > 100000) {
        balances[caller] = 100000;
      } else {
        balances[caller] = input.qty;
      }
    }

    return { state };
  }

  if (input.function === 'balance') {
    const target = input.target;
    const ticker = state.ticker;

    if (typeof target !== 'string') {
      throw new ContractError('Must specificy target to get balance for.');
    }

    if (typeof balances[target] !== 'number') {
      throw new ContractError('Cannnot get balance, target does not exist.');
    }

    return { result: { target, ticker, balance: balances[target] } };
  }

  if (input.function === 'evolve' && canEvolve) {
    if (state.owner !== caller) {
      throw new ContractError('Only the owner can evolve a contract.');
    }

    state.evolve = input.value;

    return { state };
  }

  if (input.function === "allow") {
    target = input.target;
    const quantity = input.qty;
    if (!Number.isInteger(quantity) || quantity === void 0) {
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
    if (balances[caller] < quantity || !balances[caller] || balances[caller] === null || isNaN(balances[caller]) || balances[caller] === undefined) {
      throw new ContractError("Caller balance not high enough to make claimable " + quantity + " token(s).");
    }
    balances[caller] -= quantity;
    state.claimable.push({
      from: caller,
      to: target,
      qty: quantity,
      txID: SmartWeave.transaction.id
    });

    return { state };
  }
  if (input.function === "claim") {
    const txID = input.txID;
    const qty = input.qty;
    if (!state.claimable.length) {
      throw new ContractError("Contract has no claims available.");
    }
    let obj, index;
    for (let i = 0; i < state.claimable.length; i++) {
      if (state.claimable[i].txID === txID) {
        index = i;
        obj = state.claimable[i];
      }
    }
    if (obj === void 0) {
      throw new ContractError("Unable to find claim.");
    }
    if (obj.to !== caller) {
      throw new ContractError("Claim not addressed to caller.");
    }
    if (obj.qty !== qty) {
      throw new ContractError("Claiming incorrect quantity of tokens.");
    }
    for (let i = 0; i < state.claims.length; i++) {
      if (state.claims[i] === txID) {
        throw new ContractError("This claim has already been made.");
      }
    }
    if (!balances[caller]) {
      balances[caller] = 0;
    }
    balances[caller] += obj.qty;
    state.claimable.splice(index, 1);
    state.claims.push(txID);

    return { state };
  }


  throw new ContractError(`No function supplied or function not recognised: "${input.function}"`)
}