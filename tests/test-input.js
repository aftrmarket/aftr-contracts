// contract/vehicle/contract.ts
var mode = "TEST";
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
    if (state.ownership === "single") {
      if (caller !== state.owner) {
        ThrowError("Caller is not the owner of the vehicle.");
      }
    }
    if (!(caller in balances) || !(balances[caller] > 0)) {
      ThrowError("Caller is not allowed to propose vote.");
    }
    let totalWeight = 0;
    let votingPower = JSON.parse(JSON.stringify(balances));
    if (votingSystem === "equal") {
      totalWeight = Object.keys(balances).length;
      for (let addr in votingPower) {
        votingPower[addr] = 1;
      }
      for (let addr in state.vault) {
        if (!(addr in balances)) {
          totalWeight++;
          votingPower[addr] = 1;
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
    if (voteType === "mint" || voteType === "burn" || voteType === "mintLocked" || voteType === "addMember" || voteType === "removeMember") {
      if (!input.recipient) {
        ThrowError("Error in input.  Recipient not supplied.");
      }
      recipient = isArweaveAddress(input.recipient);
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
        if (recipient === state.owner) {
          ThrowError("Can't remove owner from balances.");
        }
      }
      if (voteType === "addMember") {
        if (recipient === SmartWeave.contract.id) {
          ThrowError("Can't add the vehicle as a member.");
        }
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
        ThrowError("Invalid Key.");
      }
      if (!value || value === "") {
        ThrowError("Invalid Value.");
      }
      let currentValue = String(getStateValue(state, key));
      note = "Change " + getStateProperty(key) + " from " + currentValue + " to " + String(value);
    } else if (voteType === "assetDirective") {
    } else if (voteType === "withdrawal") {
      if (!qty || !(qty > 0)) {
        ThrowError("Error in input.  Quantity not supplied or is invalid.");
      }
      if (!input.txID) {
        ThrowError("Error in input.  No Transaction ID found.");
      }
      txID = input.txID;
      if (!target2) {
        ThrowError("Error in input.  Target not supplied.");
      }
      target2 = isArweaveAddress(target2);
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
      ThrowError("Vote does not exist.");
    }
    let voterBalance = 0;
    if (state.ownership === "single" && caller !== state.owner) {
      ThrowError("Caller is not the owner of the vehicle.");
    } else if (!(caller in vote.votingPower)) {
      ThrowError("Caller isn't a member of the vehicle and therefore isn't allowed to vote.");
    } else {
      voterBalance = vote.votingPower[caller];
    }
    if (voterBalance == 0) {
      ThrowError("Caller's balance is 0 and therefore isn't allowed to vote.");
    }
    if (vote.status !== "active") {
      ThrowError("Vote is not active.");
    }
    if (vote.voted.includes(caller)) {
      ThrowError("Caller has already voted.");
    }
    if (cast === "yay") {
      vote.yays += voterBalance;
    } else if (cast === "nay") {
      vote.nays += voterBalance;
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
    if (SmartWeave.contract.id === target2) {
      ThrowError("A vehicle token cannot be transferred to itself because it would add itself the balances object of the vehicle, thus changing the membership of the vehicle without a vote.");
    }
    if (state.ownership === "single" && callerAddress === state.owner && balances[callerAddress] - qty <= 0) {
      ThrowError("Invalid transfer because the owner's balance would be 0.");
    }
    balances[callerAddress] -= qty;
    if (targetAddress in balances) {
      balances[targetAddress] += qty;
    } else {
      balances[targetAddress] = qty;
    }
  }
  if (input.function === "withdrawal") {
    if (!input.txID) {
      ThrowError("Missing Transaction ID.");
    }
    if (!input.voteId) {
      ThrowError("Missing Vote ID.");
    }
    const tokenIndex = state.tokens.findIndex((token) => token.txID === input.txID);
    if (tokenIndex !== -1) {
      if (state.tokens[tokenIndex].withdrawals) {
        const wdIndex = state.tokens[tokenIndex].withdrawals.findIndex((wd) => wd.voteId === input.voteId);
        if (wdIndex !== -1) {
          let invokeInput = JSON.parse(JSON.stringify(state.tokens[tokenIndex].withdrawals[wdIndex]));
          delete invokeInput.voteId;
          delete invokeInput.txID;
          delete invokeInput.processed;
          invoke(state, invokeInput);
          state.tokens[tokenIndex].balance -= invokeInput.invocation.qty;
          state.tokens[tokenIndex].withdrawals = state.tokens[tokenIndex].withdrawals.filter((wd) => wd.voteId !== input.voteId);
        }
      } else {
        ThrowError("Withdrawal not found.");
      }
    } else {
      ThrowError("Invalid withdrawal transaction.");
    }
  }
  if (input.function === "deposit") {
    if (!input.txID) {
      ThrowError("The transaction is not valid.  Tokens were not transferred to the vehicle.");
    }
    if (!input.tokenId) {
      ThrowError("No token supplied. Tokens were not transferred to the vehicle.");
    }
    if (input.tokenId === SmartWeave.contract.id) {
      ThrowError("Deposit not allowed because you can't deposit an asset of itself.");
    }
    let lockLength = 0;
    if (input.lockLength) {
      lockLength = input.lockLength;
    }
    const validatedTx = await validateTransfer(input.tokenId, input.txID);
    const txObj = {
      txID: input.txID,
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
  if (input.function === "readOutbox") {
    if (!input.contract) {
      ThrowError("Missing contract to invoke.");
    }
    if (input.contract === SmartWeave.contract.id) {
      ThrowError("Invalid Foreign Call. A contract cannot invoke itself.");
    }
    const foreignState = await SmartWeave.contracts.readContractState(input.contract);
    if (!foreignState.foreignCalls) {
      ThrowError("Contract is missing support for foreign calls");
    }
    const calls = foreignState.foreignCalls.filter((element) => element.contract === SmartWeave.contract.id && !state.invocations.includes(element.txID));
    let res = state;
    for (const entry of calls) {
      res = (await handle(res, { caller: input.contract, input: entry.input })).state;
      res.invocations.push(entry.txID);
    }
    state = res;
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
    const concludedVotes = votes.filter((vote) => (block >= vote.start + vote.voteLength || state.ownership === "single" || vote.yays / vote.totalWeight >= settings.get("support") || vote.nays / vote.totalWeight > settings.get("support")) && vote.status === "active");
/**** JOE */
//console.log(JSON.stringify(concludedVotes));
    if (concludedVotes.length > 0) {
      finalizeVotes(state, concludedVotes, settings.get("quorum"), settings.get("support"), block);
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
    const unlockedTokens = vehicle.tokens.filter((token) => token.lockLength !== 0 && token.start + token.lockLength <= block);
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
    vehicle.tokens = vehicle.tokens.filter((token) => token.txID !== tokenObj.txID);
  }
}
function invoke(state, input) {
  if (!input.invocation) {
    ThrowError("Missing function invocation.");
  }
  if (!input.invocation.function) {
    ThrowError("Invalid invocation.");
  }
  if (!input.foreignContract) {
    ThrowError("Missing Foreign Contract ID.");
  }
  if (typeof input.foreignContract !== "string") {
    ThrowError("Invalid Foreign Contract ID.");
  }
  if (typeof input.foreignContract !== "string") {
    ThrowError("Invalid input.");
  }
  if (input.foreignContract === SmartWeave.contract.id) {
    ThrowError("A Foreign Call cannot call itself.");
  }
  state.foreignCalls.push({
    txID: SmartWeave.transaction.id,
    contract: input.foreignContract,
    input: input.invocation
  });
}
function finalizeVotes(vehicle, concludedVotes, quorum, support, block) {
  concludedVotes.forEach((vote) => {
    let finalQuorum = 0;
    let finalSupport = 0;
    if (vehicle.ownership === "single" || vote.yays / vote.totalWeight >= support) {
      vote.statusNote = vehicle.ownership === "single" ? "Single owner, no vote required." : "Total Support achieved before vote length timeline.";
      vote.status = "passed";
      modifyVehicle(vehicle, vote);
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
        modifyVehicle(vehicle, vote);
      }
    } else {
      vote.status = "failed";
      finalQuorum = (vote.yays + vote.nays) / vote.totalWeight;
      finalSupport = vote.yays / (vote.yays + vote.nays);
      vote.statusNote = "The proposal achieved " + String(finalSupport) + " support of a " + String(finalQuorum) + " quorum which was not enough to pass the proposal.";
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
  } else if (vote.type === "withdrawal") {
    const tokenObj = vehicle.tokens.find((token) => token.txID === vote.txID);
    let input = {
      function: "withdrawal",
      foreignContract: tokenObj.tokenId,
      invocation: {
        function: "transfer",
        target: vote.target,
        qty: vote.qty
      }
    };
    if (vehicle.ownership === "single") {
      invoke(vehicle, input);
      tokenObj.balance -= vote.qty;
    } else {
      input["voteId"] = vote.id;
      input["processed"] = false;
      input["txID"] = vote.txID;
      if (!tokenObj.withdrawals) {
        tokenObj["withdrawals"] = [];
      }
      tokenObj.withdrawals.push(input);
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
        if (input.function !== "transfer") {
          ThrowError("The interaction is not a transfer.");
        }
        if (input.target !== SmartWeave.transaction.tags.find(({ name }) => name === "Contract").value) {
          ThrowError("The target of this transfer is not this contract.");
        }
        txObj.qty = input.qty;
      }
    });
  } catch (err) {
    ThrowError("Error validating tags during 'deposit'.  " + err);
  }
  return txObj;
}
async function ensureValidInteraction(contractId, interactionId) {
  const contractInteractions = await SmartWeave.contracts.readContractState(contractId, void 0, true);
  if (!(interactionId in contractInteractions.validity)) {
    ThrowError("The interaction is not associated with this contract.");
  }
  if (!contractInteractions.validity[interactionId]) {
    ThrowError("The interaction was invalid.");
  }
  const settings = new Map(contractInteractions.state.settings);
  return {
    name: contractInteractions.state.name,
    ticker: contractInteractions.state.ticker,
    logo: settings.get("communityLogo")
  };
}

/********************** */

// Inputs
let state = {
    "votingSystem": "equal",
    "balances": {
      "abd7DMW1A8-XiGUVn5qxHLseNhkJ5C1Cxjjbj6XC3M8": 12300,
      "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I": 1000,
      "9h1TtwLLt0gZzvtxZAyzWaAsKze9ni71TYqkIfZ4Mgw": 2000,
      "ewTkY6Mytg6C0AtYU6QlkEg1oH-9J2PPS0CM83RL9rk": 5000,
      "tNGSQylZv2XyXEdxG-MeahZTLESNdw35mT3uy4aTdqg": 10000
    },
    "vault": {
      "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I": [
        {
          "balance": 30000,
          "end": 653619,
          "start": 524019
        },
        {
          "balance": 2500000,
          "start": 646429,
          "end": 789813
        }
      ],
      "9h1TtwLLt0gZzvtxZAyzWaAsKze9ni71TYqkIfZ4Mgw": [
        {
          "balance": 1000000,
          "end": 1581361,
          "start": 530161
        }
      ],
      "tNGSQylZv2XyXEdxG-MeahZTLESNdw35mT3uy4aTdqg": [
        {
          "balance": 3,
          "end": 659878,
          "start": 530278
        }
      ]
    },
    "ownership": "multi",
    "owner": "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I",
    "votes": [
      {
        "status": "active",
        "type": "set",
        "id": "34pWkK-7PZoxjoF9H5-JGBdziSLKJpG1Tzo95apzFziBU0",
        "totalWeight": 3560303,
        "votingPower": {
            "abd7DMW1A8-XiGUVn5qxHLseNhkJ5C1Cxjjbj6XC3M8": 12300,
            "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I": 2531000,
            "9h1TtwLLt0gZzvtxZAyzWaAsKze9ni71TYqkIfZ4Mgw": 1002000,
            "ewTkY6Mytg6C0AtYU6QlkEg1oH-9J2PPS0CM83RL9rk": 5000,
            "tNGSQylZv2XyXEdxG-MeahZTLESNdw35mT3uy4aTdqg": 10003
        },
        "yays": 5000,
        "nays": 0,
        "voted": [
          "ewTkY6Mytg6C0AtYU6QlkEg1oH-9J2PPS0CM83RL9rk"
        ],
        "start": 34,
        "lockLength": 2000,
        "key": "ticker",
        "value": "BL",
        "note": "Change ticker from BLUE to BL"
      },
      {
        "status": "active",
        "type": "set",
        "id": "61tBC2WnbcXbAfN2YCz0CuKzbpvtbfEUHIp9CxfStMSjA0",
        "totalWeight": 5,
        "votingPower": {
            "abd7DMW1A8-XiGUVn5qxHLseNhkJ5C1Cxjjbj6XC3M8": 12300,
            "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I": 2531000,
            "9h1TtwLLt0gZzvtxZAyzWaAsKze9ni71TYqkIfZ4Mgw": 1002000,
            "ewTkY6Mytg6C0AtYU6QlkEg1oH-9J2PPS0CM83RL9rk": 5000,
            "tNGSQylZv2XyXEdxG-MeahZTLESNdw35mT3uy4aTdqg": 10003
        },
        "yays": 0,
        "nays": 0,
        "voted": [],
        "start": 61,
        "lockLength": 2000,
        "key": "ticker",
        "value": "BLUEY",
        "note": "Change ticker from BLUE to BLUEY"
      },
      {
        "status": "active",
        "type": "set",
        "id": "210txTEST",
        "totalWeight": 5,
        "votingPower": {
          "abd7DMW1A8-XiGUVn5qxHLseNhkJ5C1Cxjjbj6XC3M8": 1,
          "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I": 1,
          "9h1TtwLLt0gZzvtxZAyzWaAsKze9ni71TYqkIfZ4Mgw": 1,
          "ewTkY6Mytg6C0AtYU6QlkEg1oH-9J2PPS0CM83RL9rk": 1,
          "tNGSQylZv2XyXEdxG-MeahZTLESNdw35mT3uy4aTdqg": 1
        },
        "yays": 3,
        "nays": 0,
        "voted": ["abd7DMW1A8-XiGUVn5qxHLseNhkJ5C1Cxjjbj6XC3M8", "9h1TtwLLt0gZzvtxZAyzWaAsKze9ni71TYqkIfZ4Mgw", "ewTkY6Mytg6C0AtYU6QlkEg1oH-9J2PPS0CM83RL9rk"],
        "start": 210,
        "lockLength": 0,
        "voteLength": 2000,
        "key": "settings.voteLength",
        "value": 100,
        "note": "Change voteLength from 2000 to 100"
      }
    ],
    "settings": [
      [
        "quorum",
        0.5
      ],
      [
        "support",
        0.5
      ],
      [
        "voteLength",
        2000
      ],
      [
        "lockMinLength",
        100
      ],
      [
        "lockMaxLength",
        10000
      ],
      [
        "communityDescription",
        "Blue Horizon focuses on indexing infrastructure PSTs."
      ],
      [
        "communityLogo",
        "KbjoPG0ivD1otfTlkeWCjVaRMYV_eoaf5sgwMdD6Ol0"
      ]
    ]
  };


  let action = {
    caller: "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I",
    // input: {
    //     function: 'vote',
    //     voteId: "34pWkK-7PZoxjoF9H5-JGBdziSLKJpG1Tzo95apzFziBU0",
    //     cast: 'nay'
    // },
    input: {
        function: 'propose',
        type: 'set',
        key: 'settings.custom1',
        value: {"key": "1", "key1": "2"}
    }
  };

  let newState = await handle(state, action);

  console.log(JSON.stringify(newState));