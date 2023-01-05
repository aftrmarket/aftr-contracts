async function handle(state, action) {
  const balances = state.balances;
  const input = action.input;
  const caller = action.caller;
  let target = "";
  let balance = 0;

  if (input.function === "balance") {
    target = isArweaveAddress(input.target || caller);
    if (typeof target !== "string") {
      throw new ContractError("Must specificy target to get balance for.");
    }
    balance = 0;
    if (target in balances) {
      balance = balances[target];
    }
  }

  if (input.function === "evolve") {
    if (!input.value || typeof input.value !== "string") {
        throw new ContractError("Invalid value.");
    }
    state.evolve = input.value;
  }

  if (input.function === "transfer") {
    const target2 = input.target;
    const qty = input.qty;
    const callerAddress = isArweaveAddress(caller);
    const targetAddress = isArweaveAddress(target2);
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
    if (SmartWeave.contract.id === target2) {
      throw new ContractError("A vehicle token cannot be transferred to itself because it would add itself the balances object of the vehicle, thus changing the membership of the vehicle without a vote.");
    }
    if (state.ownership === "single" && callerAddress === state.owner && balances[callerAddress] - qty <= 0) {
      throw new ContractError("Invalid transfer because the owner's balance would be 0.");
    }
    balances[callerAddress] -= qty;
    if (targetAddress in balances) {
      balances[targetAddress] += qty;
    } else {
      balances[targetAddress] = qty;
    }
  }
  if (input.function === "mint") {
    if (!input.qty) {
        throw new ContractError("Missing qty.");
    }
    if (!(caller in state.balances)) {
        balances[caller] = input.qty;
    }
}
if (input.function === "balance") {
    let vaultBal = 0;
    try {
      for (let bal of state.vault[caller]) {
        vaultBal += bal.balance;
      }
    } catch (e) {
    }
    return { result: { target, balance, vaultBal } };
  } else {
    return { state };
  }
function isArweaveAddress(addy) {
  const address = addy.toString().trim();
  if (!/[a-z0-9_-]{43}/i.test(address)) {
    throw new ContractError("Invalid Arweave address.");
  }
  return address;
}
}
