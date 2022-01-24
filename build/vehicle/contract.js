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
    let qty = input.qty;
    let key = input.key;
    let value = input.value;
    let lockLength = input.lockLength;
    let start = input.start;
    if (state.ownership === "single") {
      if (caller !== state.creator) {
        ThrowError("Caller is not the creator of the vehicle.");
      }
    }
    if (!(caller in balances) || !(balances[caller] > 0)) {
      ThrowError("Caller is not allowed to propose vote.");
    }
    let votingSystem = "equal";
    let totalWeight = 0;
    if (state.votingSystem) {
      votingSystem = state.votingSystem;
    }
    if (votingSystem === "equal") {
      totalWeight = Object.keys(balances).length;
    } else if (votingSystem === "weighted") {
      for (let member in balances) {
        totalWeight += balances[member];
      }
    } else {
      ThrowError("Invalid voting system.");
    }
    let recipient = "";
    if (state.ownership === "single") {
      lockLength = 0;
    } else if (!lockLength || typeof lockLength === "undefined") {
      lockLength = settings.get("voteLength");
    } else if (lockLength < 0) {
      ThrowError("Invalid Lock Length.");
    }
    if (!start || typeof start === "undefined") {
      start = block;
    } else if (start < 0 || typeof start !== "number") {
      ThrowError("Invalid Start value.");
    }
    if (voteType === "mint" || voteType === "burn" || voteType === "mintLocked" || voteType === "addMember" || voteType === "removeMember") {
      if (!input.recipient) {
        ThrowError("Error in input.  Recipient not supplied.");
      }
      if (!qty || !(qty > 0)) {
        ThrowError("Error in input.  Quantity not supplied or is invalid.");
      }
      if (voteType === "mint" || voteType === "addMember" || voteType === "mintLocked") {
        let totalTokens = 0;
        for (let wallet in balances) {
          totalTokens += balances[wallet];
        }
        if (totalTokens + qty > Number.MAX_SAFE_INTEGER) {
          ThrowError("Proposed quantity is too large.");
        }
      }
      if (voteType === "burn") {
        if (!balances[recipient]) {
          ThrowError("Request to burn for recipient not in balances.");
        }
        if (qty > balances[recipient]) {
          ThrowError("Invalid quantity.  Can't burn more than recipient has.");
        }
      }
      if (voteType === "removeMember") {
        if (recipient === state.creator) {
          ThrowError("Can't remove creator from balances.");
        }
      }
      recipient = isArweaveAddress(input.recipient);
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
        ThrowError("Invalid Key.");
      }
      if (!value || value === "") {
        ThrowError("Invalid Value.");
      }
      let currentValue = String(getStateValue(state, key));
      note = "Change " + getStateProperty(key) + " from " + currentValue + " to " + String(value);
    } else if (voteType === "assetDirective") {
    } else {
      ThrowError("Vote Type not supported.");
    }
    let voteId = String(block) + "txTEST";
    if (mode !== "TEST") {
      voteId = String(SmartWeave.block.height) + SmartWeave.transaction.id + String(multiIteration);
    }
    let vote = {
      status: "active",
      type: voteType,
      id: voteId,
      totalWeight,
      yays: 0,
      nays: 0,
      voted: [],
      start,
      lockLength
    };
    if (recipient !== "") {
      vote.recipient = recipient;
    }
    if (target2 && target2 !== "") {
      vote.target = target2;
    }
    if (!qty) {
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
    votes.push(vote);
  }
  if (input.function === "vote") {
    const voteId = input.voteId;
    const cast = input.cast;
    const vote = votes.find((vote2) => vote2.id === voteId);
    if (typeof vote === "undefined") {
      ThrowError("Vote does not exist.");
    }
    if (!(caller in balances)) {
      ThrowError("Caller isn't a member of the vehicle and therefore isn't allowed to vote.");
    } else if (state.ownership === "single" && caller !== state.creator) {
      ThrowError("Caller is not the owner of the vehicle.");
    }
    if (vote.status !== "active") {
      ThrowError("Vote is not active.");
    }
    if (vote.voted.includes(caller)) {
      ThrowError("Caller has already voted.");
    }
    let weightedVote = 1;
    if (state.votingSystem === "weighted") {
      weightedVote = balances[caller];
    }
    if (cast === "yay") {
      vote.yays += weightedVote;
    } else if (cast === "nay") {
      vote.nays += weightedVote;
    } else {
      ThrowError("Invalid vote cast.");
    }
    vote.voted.push(caller);
  }
  if (input.function === "transfer") {
    const target2 = input.target;
    const qty = input.qty;
    const callerAddress = isArweaveAddress(caller);
    const targetAddress = isArweaveAddress(target2);
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
  }
  if (input.function === "withdrawal") {
  }
  if (input.function === "deposit") {
    ContractAssert(input.txId, "The transaction is not valid.  Tokens were not transferred to vehicle.");
    let lockLength = 0;
    if (input.lockLength) {
      lockLength = input.lockLength;
    }
    const validatedTx = await validateTransfer(input.tokenId, input.txId);
    const txObj = {
      txId: input.txId,
      tokenId: validatedTx.tokenId,
      source: caller,
      balance: validatedTx.qty,
      start: validatedTx.block,
      name: validatedTx.name,
      ticker: validatedTx.ticker,
      logo: validatedTx.logo,
      lockLength
    };
    if (!state.tokens) {
      state["tokens"] = [];
    }
    state.tokens.push(txObj);
  }
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
    const concludedVotes = votes.filter((vote) => (block >= vote.start + settings.get("voteLength") || state.ownership === "single") && vote.status === "active");
    if (concludedVotes.length > 0) {
      finalizeVotes(state, concludedVotes, settings.get("quorum"), settings.get("support"));
    }
  }
  if (multiIteration <= 1) {
    if (state.vault) {
      scanVault(state, block);
    }
    if (state.tokens) {
      returnLoanedTokens(state, block);
    }
  }
  if (input.function === "balance") {
    return { result: { target, balance } };
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
function returnLoanedTokens(vehicle, block) {
  if (Array.isArray(vehicle.tokens)) {
    const unlockedTokens = vehicle.tokens.filter((token) => token.lockLength !== 0 && token.start + token.lockLength >= block);
    unlockedTokens.forEach((token) => processWithdrawal(vehicle, token));
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
function processWithdrawal(vehicle, tokenObj) {
  if (Array.isArray(vehicle.tokens)) {
    vehicle.tokens = vehicle.tokens.filter((token) => token.txId !== tokenObj.txId);
  }
}
function finalizeVotes(vehicle, concludedVotes, quorum, support) {
  concludedVotes.forEach((vote) => {
    if (vehicle.ownership === "single") {
      modifyVehicle(vehicle, vote);
      vote.status = "passed";
    } else if (vote.totalWeight * quorum > vote.yays + vote.nays) {
      vote.status = "quorumFailed";
    } else if (vote.yays / (vote.yays + vote.nays) > support) {
      vote.status = "passed";
      modifyVehicle(vehicle, vote);
    } else {
      vote.status = "failed";
    }
  });
}
function modifyVehicle(vehicle, vote) {
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
    vehicle.balances[vote.recipient] -= vote.qty;
  } else if (vote.type === "removeMember") {
    delete vehicle.balances[vote.recipient];
  } else if (vote.type === "set") {
    if (vote.key.substring(0, 9) === "settings.") {
      let key = getStateProperty(vote.key);
      updateSetting(vehicle, key, vote.value);
    } else {
      vehicle[vote.key] = vote.value;
    }
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
async function validateTransfer(tokenId, transferTx) {
  const tokenInfo = await ensureValidInteraction(tokenId, transferTx);
  const tx = await SmartWeave.unsafeClient.transactions.get(transferTx);
  let txObj = {
    tokenId,
    qty: 0,
    block: SmartWeave.block.height,
    name: tokenInfo.name,
    ticker: tokenInfo.ticker,
    logo: tokenInfo.logo
  };
  try {
    tx.get("tags").forEach((tag) => {
      if (tag.get("name", { decode: true, string: true }) === "Input") {
        const input = JSON.parse(tag.get("value", { decode: true, string: true }));
        ContractAssert(input.function === "transfer", "The interaction is not a transfer");
        ContractAssert(input.target === SmartWeave.transaction.tags.find(({ name }) => name === "Contract").value, "The target of this transfer is not this contract.");
        txObj.qty = input.qty;
      }
    });
  } catch (err) {
    throw new ThrowError("Error validating tags during 'deposit'.  " + err);
  }
  return txObj;
}
async function ensureValidInteraction(contractId, interactionId) {
  const contractInteractions = await SmartWeave.contracts.readContractState(contractId, void 0, true);
  ContractAssert(interactionId in contractInteractions.validity, "The interaction is not associated with this contract.");
  ContractAssert(contractInteractions.validity[interactionId], "The interaction was invalid.");
  const settings = new Map(contractInteractions.state.settings);
  return {
    name: contractInteractions.state.name,
    ticker: contractInteractions.state.ticker,
    logo: settings.get("communityLogo")
  };
}
