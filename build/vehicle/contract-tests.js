// contract/vehicle/contract-tests.ts
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
  const concludedVotes = votes.filter((vote) => (block >= vote.start + settings.get("voteLength") || state.ownership === "single") && vote.status === "active");
  if (concludedVotes.length > 0) {
    finalizeVotes(state, concludedVotes, settings.get("quorum"), settings.get("support"));
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
    const target = isArweaveAddress(input.target || caller);
    if (typeof target !== "string") {
      ThrowError("Must specificy target to get balance for.");
    }
    let balance = 0;
    if (target in balances) {
      balance = balances[target];
    }
    return { result: { target, balance } };
  }
  if (input.function === "propose") {
    const voteType = input.type;
    let note = input.note;
    let target = input.target;
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
      if (!lockLength) {
        lockLength = 0;
      } else if (lockLength < settings.get("lockMinLength") || lockLength > settings.get("lockMaxLength")) {
        ThrowError("Invalid Lock Length.");
      }
      if (!start) {
        start = block;
      } else if (start < 0) {
        ThrowError("Invalid Start value.");
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
      voteId = String(SmartWeave.block.height) + SmartWeave.transaction.id;
    }
    let vote = {
      status: "active",
      type: voteType,
      id: voteId,
      totalWeight,
      yays: 0,
      nays: 0,
      voted: [],
      start
    };
    if (recipient !== "") {
      vote.recipient = recipient;
    }
    if (target && target !== "") {
      vote.target = target;
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
    return { state };
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
    return { state };
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
  if (input.function === "withdrawal") {
  }
  if (input.function === "deposit") {
    const txId = input.txId;
    const source = caller;
    const target = input.target;
    const qty = input.qty;
    const tokenId = input.tokenId;
    const start = input.start;
    let lockLength = 0;
    if (input.lockLength) {
      lockLength = input.lockLength;
    }
    const txObj = {
      txId,
      tokenId,
      source,
      target,
      balance: qty,
      start,
      lockLength
    };
    if (!txId) {
      ThrowError("The transaction is not valid.  Tokens were not transferred to vehicle.");
    }
    if (!state.tokens) {
      state["tokens"] = [];
    }
    state.tokens.push(txObj);
    return { state };
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
    for (let nextAction of multiActions) {
      nextAction.input.iteration = iteration;
      if (nextAction.input.function === "multiInteraction") {
        ThrowError("Nested Multi-interactions are not allowed.");
      }
      let result = await handle(state, nextAction);
      iteration++;
    }
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
  const unlockedTokens = vehicle.tokens.filter((token) => token.lockLength !== 0 && token.start + token.lockLength >= block);
  unlockedTokens.forEach((token) => processWithdrawal(vehicle, token));
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
  vehicle.tokens = vehicle.tokens.filter((token) => token.txId !== tokenObj.txId);
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
async function test() {
  const state = {
    "name": "Test Vehicle",
    "ticker": "AFTR-Test-1",
    "balances": {
      "abd7DMW1A8-XiGUVn5qxHLseNhkJ5C1Cxjjbj6XC3M8": 12300,
      "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I": 1e3
    },
    "creator": "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I",
    "ownership": "single",
    "votingSystem": "weighted",
    "settings": [
      ["quorum", 0.5],
      ["voteLength", 2e3],
      ["lockMinLength", 100],
      ["lockMaxLength", 1e4]
    ],
    "vault": {
      "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I": [
        {
          "balance": 2e4,
          "end": 150,
          "start": 100
        },
        {
          "balance": 2e4,
          "end": 200,
          "start": 100
        },
        {
          "balance": 2e4,
          "end": 250,
          "start": 100
        }
      ],
      "WNeEQzI24ZKWslZkQT573JZ8bhatwDVx6XVDrrGbUyk": [
        {
          "balance": 3e4,
          "end": 150,
          "start": 100
        },
        {
          "balance": 25e5,
          "start": 100,
          "end": 200
        }
      ]
    },
    "votes": [],
    "tokens": [
      {
        "tokenId": "VRT",
        "source": "abd7DMW1A8-XiGUVn5qxHLseNhkJ5C1Cxjjbj6XC3M8",
        "txId": "tx1fasdfoijeo0984",
        "balance": 2500,
        "start": 123,
        "lockLength": 5
      },
      {
        "tokenId": "VRT",
        "source": "joe7DMW1A8-XiGUVn5qxHLseNhkJ5C1Cxjjbj6XC3M8",
        "txId": "tx2fasdfoijeo8547",
        "balance": 1e3,
        "start": 123,
        "lockLength": 10
      },
      {
        "tokenId": "XYZ",
        "source": "joe7DMW1A8-XiGUVn5qxHLseNhkJ5C1Cxjjbj6XC3M8",
        "txId": "tx3fasdfoijeo8547",
        "balance": 3400,
        "start": 123,
        "lockLength": 5
      }
    ]
  };
  const balAction = {
    input: {
      function: "balance",
      target: "abd7DMW1A8-XiGUVn5qxHLseNhkJ5C1Cxjjbj6XC3M8"
    },
    caller: "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I"
  };
  const txAction = {
    input: {
      function: "transfer",
      target: "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I",
      qty: 300
    },
    caller: "abd7DMW1A8-XiGUVn5qxHLseNhkJ5C1Cxjjbj6XC3M8"
  };
  const depAction = {
    input: {
      function: "deposit",
      txId: "NOT IMPLEMENTED YET",
      start: 123,
      tokenId: "T-SQUID",
      qty: 1e4
    },
    caller: "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I"
  };
  const voteCastAction = {
    input: {
      function: "vote",
      voteId: "130tx12033012",
      cast: "yay"
    },
    caller: "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I"
  };
  const proposeVoteAction = {
    input: {
      function: "propose",
      type: "set",
      key: "settings.quorum",
      value: 0.01
    },
    caller: "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I"
  };
  const actions = [
    {
      input: {
        function: "propose",
        type: "set",
        recipient: "",
        target: "",
        qty: 0,
        key: "name",
        value: "Alquip",
        note: ""
      },
      caller: "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I"
    },
    {
      input: {
        function: "propose",
        type: "set",
        recipient: "",
        target: "",
        qty: 0,
        key: "ticker",
        value: "AFTR-ALQP",
        note: ""
      },
      caller: "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I"
    },
    {
      input: {
        function: "propose",
        type: "set",
        recipient: "",
        target: "",
        qty: 0,
        key: "status",
        value: "started",
        note: ""
      },
      caller: "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I"
    },
    {
      input: {
        function: "propose",
        type: "set",
        recipient: "",
        target: "",
        qty: 0,
        key: "votingSystem",
        value: "equal",
        note: ""
      },
      caller: "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I"
    },
    {
      input: {
        function: "propose",
        type: "set",
        recipient: "",
        target: "",
        qty: 0,
        key: "settings.voteLength",
        value: 200,
        note: ""
      },
      caller: "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I"
    }
  ];
  const multiAction = {
    input: {
      function: "multiInteraction",
      type: "set",
      recipient: "",
      target: "",
      qty: 0,
      key: "",
      value: 0.01,
      note: "",
      actions
    },
    caller: "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I"
  };
  const recursiveMultiAction = {
    input: {
      function: "multiInteraction",
      type: "set",
      recipient: "",
      target: "",
      qty: 0,
      key: "",
      value: 0.01,
      note: "",
      actions: [
        multiAction
      ]
    },
    caller: "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I"
  };
  let result = await handle(state, balAction);
  console.log(JSON.stringify(result));
}
test();
