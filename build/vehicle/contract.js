// contract/vehicle/contract.ts
var multiLimit = 1e3;
var multiIteration = 0;
async function handle(state, action) {
  const balances = state.balances;
  const input = action.input;
  const caller = action.caller;
  const settings = new Map(state.settings);
  const votes = state.votes;
  let target = "";
  let balance = 0;
  const votingSystem = state.votingSystem ? state.votingSystem : "weighted";
  if (typeof input.iteration !== "undefined") {
    if (isNaN(input.iteration)) {
      throw new ContractError("Invalid value for iteration.");
    } else {
      multiIteration = input.iteration;
    }
  }
  const block = +SmartWeave.block.height;
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
  if (input.function === "propose") {
    const voteType = input.type;
    let note = input.note;
    let target2 = input.target;
    let qty = +input.qty;
    let key = input.key;
    let value = input.value;
    let voteLength = input.voteLength;
    let lockLength = input.lockLength;
    let start = input.start;
    let txID = input.txID;
    if (!(caller in balances) || !(balances[caller] > 0)) {
      let totalBalance = 0;
      if (state.vault[caller]) {
        for (let bal of state.vault[caller]) {
          totalBalance += bal.balance;
        }
      }
      if (totalBalance === 0) {
        throw new ContractError("Caller is not allowed to propose vote.");
      }
    }
    let totalWeight = 0;
    let votingPower = JSON.parse(JSON.stringify(balances));
    if (state.ownership === "single") {
      if (caller !== state.owner) {
        throw new ContractError("Caller is not the owner of the vehicle.");
      }
      votingPower = { [caller]: 1 };
      totalWeight = 1;
    } else if (votingSystem === "equal") {
      for (let addr in votingPower) {
        if (votingPower[addr] > 0) {
          votingPower[addr] = 1;
          totalWeight++;
        } else {
          delete votingPower[addr];
        }
      }
      for (let addr in state.vault) {
        if (!(addr in votingPower)) {
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
    } else if (votingSystem === "weighted") {
      for (let member in balances) {
        totalWeight += balances[member];
      }
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
    let recipient = "";
    if (state.ownership === "single") {
      voteLength = 0;
    } else if (!voteLength || typeof voteLength === "undefined") {
      voteLength = settings.get("voteLength");
    } else if (voteLength < 0) {
      throw new ContractError("Invalid Vote Length.");
    }
    if (lockLength || typeof lockLength !== "undefined") {
      if (lockLength < 0) {
        throw new ContractError("Invalid Lock Length.");
      }
    } else {
      lockLength = 0;
    }
    if (!start || typeof start === "undefined") {
      start = block;
    } else if (start < 0 || typeof start !== "number") {
      throw new ContractError("Invalid Start value.");
    }
    if (voteType === "evolve") {
      if (!input.value) {
        throw new ContractError("Error in input.  No value exists.");
      }
      const evolveSrcId = isArweaveAddress(input.value);
      note = "Evolve contract to " + evolveSrcId + ". Verify the new contract source here. https://aftr.market/latest-contract-source";
    } else if (voteType === "mint" || voteType === "burn" || voteType === "mintLocked" || voteType === "addMember" || voteType === "removeMember") {
      if (!input.recipient) {
        throw new ContractError("Error in input.  Recipient not supplied.");
      }
      recipient = isArweaveAddress(input.recipient);
      if (!qty || !(qty > 0)) {
        throw new ContractError("Error in input.  Quantity not supplied or is invalid.");
      }
      if (voteType === "mint" || voteType === "addMember" || voteType === "mintLocked") {
        let totalTokens = 0;
        for (let wallet in balances) {
          totalTokens += balances[wallet];
        }
        if (totalTokens + qty > Number.MAX_SAFE_INTEGER) {
          throw new ContractError("Proposed quantity is too large.");
        }
      }
      if (voteType === "burn") {
        if (!balances[recipient]) {
          throw new ContractError("Request to burn for recipient not in balances.");
        }
        if (qty > balances[recipient]) {
          throw new ContractError("Invalid quantity.  Can't burn more than recipient has.");
        }
        if (state.ownership === "single" && balances[recipient] - qty < 1 && recipient === state.owner) {
          throw new ContractError("Invalid quantity.  Can't burn all the owner's balance.  The owner must have at least a balance of 1 or the vehicle will be rendered useless.");
        }
      }
      if (voteType === "removeMember") {
        if (recipient === state.owner) {
          throw new ContractError("Can't remove owner from balances.");
        }
      }
      if (voteType === "addMember") {
        if (recipient === SmartWeave.contract.id) {
          throw new ContractError("Can't add the vehicle as a member.");
        }
      }
      if (!isProposedOwnershipValid(state, voteType, qty, recipient)) {
        throw new ContractError("The proposed change is not allowed as it would leave the ownership of the vehicle with no balance thus rendering the vehicle useless.");
      }
      if (voteType === "mint") {
        note = "Mint " + String(qty) + " tokens for " + recipient;
      } else if (voteType === "mintLocked") {
        note = "Mint and Lock " + String(qty) + " tokens for " + recipient;
      } else if (voteType === "burn") {
        note = "Burn " + String(qty) + " tokens for " + recipient;
      } else if (voteType === "addMember") {
        note = "Add new member, " + recipient + ", and mint " + String(qty) + " tokens";
      } else if (voteType === "removeMember") {
        note = "Remove member, " + recipient + ", and burn their " + String(qty) + " tokens";
      }
    } else if (voteType === "set") {
      if (!key || key === "") {
        throw new ContractError("Invalid Key.");
      }
      if (!value || value === "") {
        throw new ContractError("Invalid Value.");
      }
      const validationResponce = validateProperties(key, value);
      if (validationResponce !== "") {
        throw new ContractError(validationResponce);
      }
      if (key === "owner") {
        if (!isProposedOwnershipValid(state, voteType, qty, value)) {
          throw new ContractError("The proposed change is not allowed as it would leave the ownership of the vehicle with no balance thus rendering the vehicle useless.");
        }
      }
      let currentValue = String(getStateValue(state, key));
      note = "Change " + getStateProperty(key) + " from " + currentValue + " to " + String(value);
    } else if (voteType === "withdrawal") {
      if (!qty || !(qty > 0)) {
        throw new ContractError("Error in input.  Quantity not supplied or is invalid.");
      }
      if (!input.txID) {
        throw new ContractError("Error in input.  No Transaction ID found.");
      }
      txID = input.txID;
      if (!target2) {
        throw new ContractError("Error in input.  Target not supplied.");
      }
      target2 = isArweaveAddress(target2);
      const tokenObj = state.tokens?.find((token) => token.txID === txID);
      if (tokenObj && tokenObj.balance < qty) {
        throw new ContractError("Not enough " + tokenObj.tokenId + " tokens to withdrawal.");
      }
    } else {
      throw new ContractError("Vote Type not supported.");
    }
    let voteId = String(SmartWeave.block.height) + SmartWeave.transaction.id + String(multiIteration);
    let vote = {
      status: "active",
      type: voteType,
      id: voteId,
      totalWeight,
      votingPower,
      yays: 0,
      nays: 0,
      voted: [],
      start,
      lockLength,
      voteLength
    };
    if (recipient !== "") {
      vote.recipient = recipient;
    }
    if (target2 && target2 !== "") {
      vote.target = target2;
    }
    if (qty) {
      vote.qty = qty;
    }
    if (key && key !== "") {
      vote.key = key;
    }
    if (value && value !== "") {
      vote.value = value;
    }
    if (note && note !== "") {
      vote.note = note;
    }
    if (txID && txID !== "") {
      vote.txID = txID;
    }
    votes.push(vote);
  }
  if (input.function === "vote") {
    const voteId = input.voteId;
    const cast = input.cast;
    const vote = votes.find((vote2) => vote2.id === voteId);
    if (typeof vote === "undefined") {
      throw new ContractError("Vote does not exist.");
    }
    let voterBalance = 0;
    if (state.ownership === "single" && caller !== state.owner) {
      throw new ContractError("Caller is not the owner of the vehicle.");
    } else if (!(caller in vote.votingPower)) {
      throw new ContractError("Caller isn't a member of the vehicle and therefore isn't allowed to vote.");
    } else {
      voterBalance = vote.votingPower[caller];
    }
    if (voterBalance == 0) {
      throw new ContractError("Caller's balance is 0 and therefore isn't allowed to vote.");
    }
    if (vote.status !== "active") {
      throw new ContractError("Vote is not active.");
    }
    if (vote.voted.includes(caller)) {
      throw new ContractError("Caller has already voted.");
    }
    if (cast === "yay") {
      vote.yays += voterBalance;
    } else if (cast === "nay") {
      vote.nays += voterBalance;
    } else {
      throw new ContractError("Invalid vote cast.");
    }
    vote.voted.push(caller);
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
  if (input.function === "deposit") {
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
    const transferResult = await SmartWeave.contracts.write(input.tokenId, {
      function: "claim",
      txID: input.txID,
      qty: input.qty
    });
    if (transferResult.type !== "ok") {
      throw new ContractError("Unable to deposit token " + input.tokenId);
    }
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
      lockLength
    };
    if (!state.tokens) {
      state["tokens"] = [];
    }
    state.tokens.push(txObj);
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
    if (balances[caller] < quantity) {
      throw new ContractError("Caller balance not high enough to make claimable " + quantity + " token(s).");
    }
    balances[caller] -= quantity;
    if (balances[caller] === null || balances[caller] === void 0) {
      balances[caller] = 0;
    }
    state.claimable.push({
      from: caller,
      to: target,
      qty: quantity,
      txID: SmartWeave.transaction.id
    });
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
  }
  if (input.function === "multiInteraction") {
    if (typeof input.actions === "undefined") {
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
      if (nextAction.input.function === "multiInteraction") {
        throw new ContractError("Nested Multi-interactions are not allowed.");
      }
      nextAction.caller = caller;
      let result = await handle(updatedState, nextAction);
      updatedState = result.state;
      iteration++;
    }
    state = updatedState;
  }
  if (Array.isArray(votes)) {
    const concludedVotes = votes.filter((vote) => (block >= vote.start + vote.voteLength || state.ownership === "single" || vote.yays / vote.totalWeight > settings.get("support") || vote.nays / vote.totalWeight > settings.get("support")) && vote.status === "active");
    if (concludedVotes.length > 0) {
      await finalizeVotes(state, concludedVotes, settings.get("quorum"), settings.get("support"), block);
    }
  }
  if (multiIteration <= 1) {
    if (state.vault && typeof state.vault === "object") {
      scanVault(state, block);
    }
    if (state.tokens) {
      await returnLoanedTokens(state, block);
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
}
function isArweaveAddress(addy) {
  const address = addy.toString().trim();
  if (!/[a-z0-9_-]{43}/i.test(address)) {
    throw new ContractError("Invalid Arweave address.");
  }
  return address;
}
function scanVault(vehicle, block) {
  for (const [key, arr] of Object.entries(vehicle.vault)) {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].end <= block) {
        if (key in vehicle.balances) {
          vehicle.balances[key] += arr[i].balance;
        } else {
          vehicle.balances[key] = arr[i].balance;
        }
        vehicle.vault[key].splice(i, 1);
        i--;
      }
      if (vehicle.vault[key].length == 0) {
        delete vehicle.vault[key];
      }
    }
  }
}
async function returnLoanedTokens(vehicle, block) {
  if (Array.isArray(vehicle.tokens)) {
    const unlockedTokens = vehicle.tokens.filter((token) => token.lockLength !== 0 && token.start + token.lockLength <= block);
    for (let token of unlockedTokens) {
      const wdResult = await SmartWeave.contracts.write(token.tokenId, {
        function: "transfer",
        target: token.source,
        qty: token.balance
      });
    }
  }
}
function getStateProperty(key) {
  if (key.substring(0, 9) === "settings.") {
    key = key.substring(9);
  }
  return key;
}
function getStateValue(vehicle, key) {
  const settings = new Map(vehicle.settings);
  let value = "";
  if (key.substring(0, 9) === "settings.") {
    let setting = key.substring(9);
    value = settings.get(setting);
  } else {
    value = vehicle[key];
  }
  return value;
}
function validateProperties(key, value) {
  let response = "";
  if (key === "settings.quorum" && (value < 0 || value > 1)) {
    response = "Quorum must be between 0 and 1.";
  }
  if (key === "settings.support" && (value < 0 || value > 1)) {
    response = "Support must be between 0 and 1.";
  }
  if (key === "owner" && !/[a-z0-9_-]{43}/i.test(value)) {
    response = "Proposed owner is invalid.";
  }
  return response;
}
async function finalizeVotes(vehicle, concludedVotes, quorum, support, block) {
  for (let vote of concludedVotes) {
    let finalQuorum = 0;
    let finalSupport = 0;
    if (vehicle.ownership === "single" || vote.yays / vote.totalWeight > support) {
      vote.statusNote = vehicle.ownership === "single" ? "Single owner, no vote required." : "Total Support achieved before vote length timeline.";
      vote.status = "passed";
      await modifyVehicle(vehicle, vote);
    } else if (vote.nays / vote.totalWeight > support) {
      vote.statusNote = "No number of yays can exceed the total number of nays. The proposal fails before the vote length timeline.";
      vote.status = "failed";
    } else if (block > vote.start + vote.voteLength) {
      finalQuorum = (vote.yays + vote.nays) / vote.totalWeight;
      if (vote.totalWeight * quorum > vote.yays + vote.nays) {
        vote.status = "quorumFailed";
        vote.statusNote = "The proposal failed due to the Quorum not being met. The proposal's quorum was " + String(finalQuorum);
      } else if (vote.yays / (vote.yays + vote.nays) > support) {
        finalSupport = vote.yays / (vote.yays + vote.nays);
        vote.status = "passed";
        vote.statusNote = "The proposal passed with " + String(finalSupport) + " support of a " + String(finalQuorum) + " quorum.";
        await modifyVehicle(vehicle, vote);
      }
    } else {
      vote.status = "failed";
      finalQuorum = (vote.yays + vote.nays) / vote.totalWeight;
      finalSupport = vote.yays / (vote.yays + vote.nays);
      vote.statusNote = "The proposal achieved " + String(finalSupport) + " support of a " + String(finalQuorum) + " quorum which was not enough to pass the proposal.";
    }
  }
  ;
}
async function modifyVehicle(vehicle, vote) {
  if (vote.type === "mint" || vote.type === "addMember") {
    if (vote.recipient in vehicle.balances) {
      vehicle.balances[vote.recipient] += vote.qty;
    } else {
      vehicle.balances[vote.recipient] = vote.qty;
    }
  } else if (vote.type === "mintLocked") {
    let vaultObj = {
      balance: vote.qty,
      start: vote.start,
      end: vote.start + vote.lockLength
    };
    if (vote.recipient in vehicle.vault) {
      vehicle.vault[vote.recipient].push(vaultObj);
    } else {
      vehicle.vault[vote.recipient] = [vaultObj];
    }
  } else if (vote.type === "burn") {
    if (!isProposedOwnershipValid(vehicle, vote.type, vote.qty, vote.recipient)) {
      throw new ContractError("The proposed change is not allowed as it would leave the ownership of the vehicle with no balance thus rendering the vehicle useless.");
    }
    vehicle.balances[vote.recipient] -= vote.qty;
  } else if (vote.type === "removeMember") {
    if (!isProposedOwnershipValid(vehicle, vote.type, vote.qty, vote.recipient)) {
      throw new ContractError("The proposed change is not allowed as it would leave the ownership of the vehicle with no balance thus rendering the vehicle useless.");
    }
    delete vehicle.balances[vote.recipient];
  } else if (vote.type === "set") {
    if (vote.key.substring(0, 9) === "settings.") {
      let key = getStateProperty(vote.key);
      updateSetting(vehicle, key, vote.value);
    } else {
      if (vote.key === "owner" && !isProposedOwnershipValid(vehicle, vote.type, vote.qty, vote.value)) {
        throw new ContractError("The proposed change is not allowed as it would leave the ownership of the vehicle with no balance thus rendering the vehicle useless.");
      }
      vehicle[vote.key] = vote.value;
    }
  } else if (vote.type === "evolve") {
    vehicle.evolve = vote.value;
  } else if (vote.type === "withdrawal") {
    const tokenObj = vehicle.tokens.find((token) => token.txID === vote.txID);
    const contractId = tokenObj.tokenId;
    const wdResult = await SmartWeave.contracts.write(contractId, {
      function: "transfer",
      target: vote.target,
      qty: vote.qty
    });
    if (wdResult.type !== "ok") {
      throw new ContractError("Unable to withdrawal " + contractId + " for " + vote.target + ".");
    }
    tokenObj.balance -= vote.qty;
  }
}
function updateSetting(vehicle, key, value) {
  let found = false;
  for (let setting of vehicle.settings) {
    if (setting[0] === key) {
      setting[1] = value;
      found = true;
      break;
    }
  }
  if (!found) {
    vehicle.settings.push([key, value]);
  }
}
async function getTokenInfo(assetState) {
  const settings = new Map(assetState.settings);
  return {
    name: assetState.name,
    ticker: assetState.ticker,
    logo: settings.get("communityLogo")
  };
}
function isProposedOwnershipValid(vehicle, proposalType, qty, member) {
  let valid = true;
  if (proposalType === "burn" && !Number.isInteger(qty)) {
    valid = false;
  }
  if (proposalType === "removeMember") {
    if (vehicle.ownership === "single" && vehicle.owner === member) {
      valid = false;
    } else if (vehicle.ownership === "dao") {
      let newBalances = JSON.parse(JSON.stringify(vehicle.balances));
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
  } else if (proposalType === "burn") {
    if (vehicle.ownership === "single" && vehicle.owner === member && vehicle.balances[member] - qty < 1) {
      valid = false;
    }
    if (vehicle.ownership === "dao") {
      let newBalances = JSON.parse(JSON.stringify(vehicle.balances));
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
    if (vehicle.ownership === "single" && (vehicle.balances[member] < 1 || !vehicle.balances[member])) {
      valid = false;
    }
  }
  return valid;
}
