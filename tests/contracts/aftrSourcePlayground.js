// contract/vehicle/contract.ts
var mode = "PROD";
function ThrowError(msg) {
  if (mode === "TEST") {
    throw "ERROR: " + msg;
  } else {
    throw new ContractError(msg);
  }
}
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
      ThrowError("Invalid value for iteration.");
    } else {
      multiIteration = input.iteration;
    }
  }
  let block = 0;
  if (mode === "TEST") {
    block = 210;
  } else {
    block = +SmartWeave.block.height;
  }
  if (input.function === "balance") {
    target = isArweaveAddress(input.target || caller);
    if (typeof target !== "string") {
      ThrowError("Must specificy target to get balance for.");
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
        ThrowError("Caller is not allowed to propose vote.");
      }
    }
    let totalWeight = 0;
    let votingPower = JSON.parse(JSON.stringify(balances));
    if (state.ownership === "single") {
      if (caller !== state.owner) {
        throw new ContractError("Caller is not the owner of the repo.");
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
      ThrowError("Invalid voting system.");
    }
    let recipient = "";
    if (state.ownership === "single") {
      voteLength = 0;
    } else if (!voteLength || typeof voteLength === "undefined") {
      voteLength = settings.get("voteLength");
    } else if (voteLength < 0) {
      ThrowError("Invalid Vote Length.");
    }
    if (lockLength || typeof lockLength !== "undefined") {
      if (lockLength < 0) {
        ThrowError("Invalid Lock Length.");
      }
    } else {
      lockLength = 0;
    }
    if (!start || typeof start === "undefined") {
      start = block;
    } else if (start < 0 || typeof start !== "number") {
      ThrowError("Invalid Start value.");
    }
    if (voteType === "evolve") {
      if (!input.value) {
        throw new ContractError("Error in input.  No value exists.");
      }
      const evolveSrcId = isArweaveAddress(input.value);
      note = "Evolve contract to " + evolveSrcId + ". Verify the new contract source here. https://aftr.market/latest-contract-source";
    } else if (voteType === "addBalance" || voteType === "subtractBalance" || voteType === "addLocked" || voteType === "addMember" || voteType === "removeMember") {
      if (!input.recipient) {
        throw new ContractError("Error in input.  Recipient not supplied.");
      }
      recipient = isArweaveAddress(input.recipient);
      if (!qty || !(qty > 0)) {
        throw new ContractError("Error in input.  Quantity not supplied or is invalid.");
      }
      if (voteType === "addBalance" || voteType === "addMember" || voteType === "addLocked") {
        let totalTokens = 0;
        for (let wallet in balances) {
          totalTokens += balances[wallet];
        }
        if (totalTokens + qty > Number.MAX_SAFE_INTEGER) {
          throw new ContractError("Proposed quantity is too large.");
        }
      }
      if (voteType === "subtractBalance") {
        if (!balances[recipient]) {
          throw new ContractError("Request to decrease for recipient not in balances.");
        }
        if (qty > balances[recipient]) {
          throw new ContractError("Invalid quantity.  Can't decrease more than recipient has.");
        }
        if (state.ownership === "single" && balances[recipient] - qty < 1 && recipient === state.owner) {
          throw new ContractError("Invalid quantity.  Can't decrease all the owner's balance.  The owner must have at least a balance of 1 or the repo will be rendered useless.");
        }
      }
      if (voteType === "removeMember") {
        if (recipient === state.owner) {
          throw new ContractError("Can't remove owner from balances.");
        }
      }
      if (voteType === "addMember") {
        if (recipient === SmartWeave.contract.id) {
          throw new ContractError("Can't add the repo as a member.");
        }
      }
      if (!isProposedOwnershipValid(state, voteType, qty, recipient)) {
        throw new ContractError("The proposed change is not allowed as it would leave the ownership of the repo with no balance thus rendering the repo useless.");
      }
      if (voteType === "addBalance") {
        note = "Add balance of " + String(qty) + " to " + recipient;
      } else if (voteType === "addLocked") {
        note = "Add and Lock a balance of " + String(qty) + " for " + recipient;
      } else if (voteType === "subtractBalance") {
        note = "Subtract balance of " + String(qty) + " for " + recipient;
      } else if (voteType === "addMember") {
        note = "Add new member, " + recipient + ", with a balance of " + String(qty);
      } else if (voteType === "removeMember") {
        note = "Remove member, " + recipient + ", with a balance of " + String(qty);
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
          throw new ContractError("The proposed change is not allowed as it would leave the ownership of the repo with no balance thus rendering the repo useless.");
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
      throw new ContractError("Caller is not the owner of the repo.");
    } else if (!(caller in vote.votingPower)) {
      throw new ContractError("Caller isn't a member of the repo and therefore isn't allowed to vote.");
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
    if (!balances[callerAddress] || balances[callerAddress] == void 0 || balances[callerAddress] == null || isNaN(balances[callerAddress])) {
      throw new ContractError("Caller doesn't own a balance in the Repo.");
    }
    if (balances[callerAddress] < qty) {
      throw new ContractError(`Caller balance not high enough to send ${qty} token(s)!`);
    }
    if (SmartWeave.contract.id === target2) {
      throw new ContractError("A repo token cannot be transferred to itself because it would add itself the balances object of the repo, thus changing the membership of the repo without a vote.");
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
      throw new ContractError("Can't setup claim to transfer a balance to itself.");
    }
    if (quantity <= 0 || caller === target) {
      throw new ContractError("Invalid balance transfer.");
    }
    if (balances[caller] < quantity || !balances[caller] || balances[caller] == void 0 || balances[caller] == null || isNaN(balances[caller])) {
      throw new ContractError("Caller balance not high enough to make a balance of " + quantity + "claimable.");
    }
    balances[caller] -= quantity;
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

  /*** PLAYGROUND FUNCTIONS - NOT FOR PRODUCTION */
  /*** ADDED MINT FUNCTION FOR THE TEST GATEWAY - NOT FOR PRODUCTION */
  if (input.function === 'plygnd-mint') {
    if (!input.qty) {
      ThrowError("Missing qty.");
    }
    if (!(caller in state.balances)) {
      balances[caller] = input.qty;
    }
  }
  /*** ADDED ADDLOGO FUNCTION TO EASILY ADD LOGO ON TEST GATEWAY - NOT FOR PRODUCTION */
  if (input.function === "plygnd-addLogo") {
    if (!input.logo) {
      ThrowError("Missing logo");
    }

    // Add logo
    updateSetting(state, "communityLogo", input.logo);
  }

  /*** ADDED UPDATETOKENS FUNCTION TO UPDATE THE TOKEN OBJECT'S LOGOS ON INIT - NOT FOR PRODUCTION */
  if (input.function === 'plygnd-updateTokens') {
    if (!input.logoVint) {
      ThrowError("Missing Vint logo");
    }

    if (!input.logoArhd) {
      ThrowError("Missing arHD logo");
    }

    // Update logo in tokens[] if aftr vehicle
    if (state.tokens) {
      // Find tokens that == ticker and update their logos
      const updatedTokens = state.tokens.filter((token) => (token.ticker === "VINT" || token.ticker === "ARHD"));
      updatedTokens.forEach((token) => {
        if (token.ticker === "VINT") {
          token.logo = input.logoVint;
        } else if (token.ticker === "ARHD") {
          token.logo = input.logoArhd;
        }
      });
    }
  }
  /*** PLAYGROUND FUNCTIONS END */



  if (input.function === "multiInteraction") {
    if (typeof input.actions === "undefined") {
      ThrowError("Invalid Multi-interaction input.");
    }
    const multiActions = input.actions;
    if (multiActions.length > multiLimit) {
      ThrowError("The Multi-interactions call exceeds the maximum number of interations.");
    }
    let iteration = 1;
    let updatedState = state;
    for (let nextAction of multiActions) {
      nextAction.input.iteration = iteration;
      if (nextAction.input.function === "multiInteraction") {
        ThrowError("Nested Multi-interactions are not allowed.");
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
      finalizeVotes(state, concludedVotes, settings.get("quorum"), settings.get("support"), block);
    }
  }
  if (multiIteration <= 1) {
    if (state.vault && typeof state.vault === "object") {
      scanVault(state, block);
    }
    if (state.tokens) {
      returnLoanedTokens(state, block);
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
    ThrowError("Invalid Arweave address.");
  }
  return address;
}
function scanVault(repo, block) {
  for (const [key, arr] of Object.entries(repo.vault)) {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].end <= block) {
        if (key in repo.balances) {
          repo.balances[key] += arr[i].balance;
        } else {
          repo.balances[key] = arr[i].balance;
        }
        repo.vault[key].splice(i, 1);
        i--;
      }
      if (repo.vault[key].length == 0) {
        delete repo.vault[key];
      }
    }
  }
}
function returnLoanedTokens(repo, block) {
  if (Array.isArray(repo.tokens)) {
    const unlockedTokens = repo.tokens.filter((token) => token.lockLength !== 0 && token.start + token.lockLength <= block);
    unlockedTokens.forEach((token) => processWithdrawal(vehicle, token));
  }
}
function getStateProperty(key) {
  if (key.substring(0, 9) === "settings.") {
    key = key.substring(9);
  }
  return key;
}
function getStateValue(repo, key) {
  const settings = new Map(repo.settings);
  let value = "";
  if (key.substring(0, 9) === "settings.") {
    let setting = key.substring(9);
    value = settings.get(setting);
  } else {
    value = repo[key];
  }
  return value;
}
function processWithdrawal(repo, tokenObj) {
  if (Array.isArray(repo.tokens)) {
    repo.tokens = repo.tokens.filter((token) => token.txID !== tokenObj.txID);
  }
}
if (key === "owner" && !/[a-z0-9_-]{43}/i.test(value)) {
  response = "Proposed owner is invalid.";
}
return response;
}
async function finalizeVotes(repo, concludedVotes, quorum, support, block) {
  for (let vote of concludedVotes) {
    let finalQuorum = 0;
    let finalSupport = 0;
    if (repo.ownership === "single" || vote.yays / vote.totalWeight > support) {
      vote.statusNote = repo.ownership === "single" ? "Single owner, no vote required." : "Total Support achieved before vote length timeline.";
      vote.status = "passed";
      await modifyRepo(repo, vote);
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
        await modifyRepo(repo, vote);
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
async function modifyRepo(repo, vote) {
  if (vote.type === "addBalance" || vote.type === "addMember") {
    if (vote.recipient in repo.balances) {
      repo.balances[vote.recipient] += vote.qty;
    } else {
      repo.balances[vote.recipient] = vote.qty;
    }
  } else if (vote.type === "addLocked") {
    let vaultObj = {
      balance: vote.qty,
      start: vote.start,
      end: vote.start + vote.lockLength
    };
    if (vote.recipient in repo.vault) {
      repo.vault[vote.recipient].push(vaultObj);
    } else {
      repo.vault[vote.recipient] = [vaultObj];
    }
  } else if (vote.type === "subtractBalance") {
    if (!isProposedOwnershipValid(repo, vote.type, vote.qty, vote.recipient)) {
      throw new ContractError("The proposed change is not allowed as it would leave the ownership of the repo with no balance thus rendering the repo useless.");
    }
    repo.balances[vote.recipient] -= vote.qty;
  } else if (vote.type === "removeMember") {
    if (!isProposedOwnershipValid(repo, vote.type, vote.qty, vote.recipient)) {
      throw new ContractError("The proposed change is not allowed as it would leave the ownership of the repo with no balance thus rendering the repo useless.");
    }
    delete repo.balances[vote.recipient];
  } else if (vote.type === "set") {
    if (vote.key.substring(0, 9) === "settings.") {
      let key = getStateProperty(vote.key);
      updateSetting(repo, key, vote.value);
    } else {
      if (vote.key === "owner" && !isProposedOwnershipValid(repo, vote.type, vote.qty, vote.value)) {
        throw new ContractError("The proposed change is not allowed as it would leave the ownership of the repo with no balance thus rendering the repo useless.");
      }
      repo[vote.key] = vote.value;
    }
  } else if (vote.type === "evolve") {
    repo.evolve = vote.value;
  } else if (vote.type === "withdrawal") {
    const tokenObj = repo.tokens.find((token) => token.txID === vote.txID);
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
function updateSetting(repo, key, value) {
  let found = false;
  for (let setting of repo.settings) {
    if (setting[0] === key) {
      setting[1] = value;
      found = true;
      break;
    }
  }
  if (!found) {
    repo.settings.push([key, value]);
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
function isProposedOwnershipValid(repo, proposalType, qty, member) {
  let valid = true;
  if (proposalType === "subtractBalance" && !Number.isInteger(qty)) {
    valid = false;
  }
  if (proposalType === "removeMember") {
    if (repo.ownership === "single" && repo.owner === member) {
      valid = false;
    } else if (repo.ownership === "multi") {
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
