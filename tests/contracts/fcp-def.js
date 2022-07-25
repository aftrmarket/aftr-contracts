export async function handle (state, action) {
    const balances = state.balances;
    const invocations = state.invocations;
    const input = action.input;
    const caller = action.caller;
  
    if (input.function == "transfer") {
      const target = input.target;
      const qty = input.qty;
  
      if (!Number.isInteger(qty)) {
        throw new ContractError(`Invalid value for "qty". Must be an integer`);
      }
  
      if (!target) {
        throw new ContractError(`No target specified`);
      }
  
      if (qty <= 0 || caller == target) {
        throw new ContractError("Invalid token transfer");
      }
  
      if (balances[caller] < qty) {
        throw new ContractError(`Caller balance not high enough to send ${qty} token(s)!`);
      }
  
      balances[caller] -= qty;
      if (target in balances) {
        balances[target] += qty;
      } else {
        balances[target] = qty;
      }
  
      return { state };
    }
  
    if (input.function == "balance") {
      const target = input.target;
      const ticker = state.ticker;
      
      if (typeof target !== "string") {
        throw new ContractError(`Must specificy target to get balance for`);
      }
  
      if (typeof balances[target] !== "number") {
        throw new ContractError(`Cannnot get balance, target does not exist`);
      }
  
      return { result: { target, ticker, balance: balances[target] } };
    }
  
    if (input.function === "invoke") {
      if (!input.invocation) {
        throw new ContractError(`Missing function invocation`);
      }
  
      if (!input.foreignContract) {
        throw new ContractError(`Missing foreign contract`);
      }
  
      state.foreignCalls.push({
        contract: input.foreignContract,
        input: input.invocation
      });
      return { state };
    }
  
    if (input.function === "readOutbox") {
      if (!input.contract) {
        throw new ContractError(`Missing contract to invoke`);
      }
      const foreignState = await SmartWeave.contracts.readContractState(input.contract);
      console.log("FOREIGN STATE:");
      console.log(foreignState);
      
      if (!foreignState.foreignCalls) {
        throw new ContractError(`Contract is missing support for foreign calls`);
      }
  
      if (foreignState.foreignCalls[parseInt(input.id)].contract !== SmartWeave.contract.id) {
        throw new ContractError(`This contract is not the target contract chosen in the invocation`);
      }
      const invocation = foreignState.foreignCalls[input.id].input;
      const foreignCall = SmartWeave.transaction.id;
  
      if (invocations.includes(foreignCall)) {
        throw new ContractError(`Contract invocation already exists`);
      }
      const foreignAction = action;
      foreignAction.caller = input.contract;
      foreignAction.input = invocation;
  
      const resultState = await handle(state, foreignAction);
      invocations.push(foreignCall);
      return resultState;
    }
  
    throw new ContractError(`No function supplied or function not recognised: "${input.function}"`);
  }