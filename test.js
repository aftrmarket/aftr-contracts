//import Arweave from 'arweave';
const Arweave = require("arweave");
const fs = require("fs");
const path = require ("path");

const arweave = Arweave.init({
    host: process.env.ARWEAVE_HOST,
    protocol: process.env.ARWEAVE_PROTOCOL,
    port: process.env.ARWEAVE_PORT
});

async function createContract() {

    const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile.json')));
    const contractSource = arDriveSource;
    const initialState = arDriveState;

    //const contractSource = JSON.parse(fs.readFileSync(path.join(__dirname, 'init.json')));
    //const initialState = JSON.parse(fs.readFileSync(path.join(__dirname, 'init.json')));
    
    // Let's first create the contract transaction.
    const contractTx = await arweave.createTransaction({ data: contractSource }, wallet);
    contractTx.addTag('App-Name', 'ArDrive');
    contractTx.addTag('App-Version', '0.3.0');
    contractTx.addTag('Content-Type', 'application/javascript');
    contractTx.addTag('Protocol', 'AFTR-Test');
    
    // Sign
    await arweave.transactions.sign(contractTx, wallet);
    // Let's keep the ID, it will be used in the state transaction.
    const contractSourceTxId = contractTx.id;
    
    console.log ("Contract Source ID: " + contractSourceTxId);

    // Deploy the contract source
    await arweave.transactions.post(contractTx);
    
    // Now, let's create the Initial State transaction
    const initialStateTx = await arweave.createTransaction({ data: initialState }, wallet);
    initialStateTx.addTag('App-Name', 'ArDrive');
    initialStateTx.addTag('App-Version', '0.3.0');
    initialStateTx.addTag('Contract-Src', contractSourceTxId);
    initialStateTx.addTag('Content-Type', 'application/json');
    
    // Sign
    await arweave.transactions.sign(initialStateTx, wallet);
    const initialStateTxId = initialStateTx.id;
    // Deploy
    await arweave.transactions.post(initialStateTx);

    console.log("Initial State: " + initialStateTxId);
}

const arDriveSource = `export function handle(state, action) {
    const settings = new Map(state.settings);
    const balances = state.balances;
    const vault = state.vault;
    const votes = state.votes;
    const input = action.input;
    const caller = action.caller;
    if (input.function === "transfer") {
      const target = input.target;
      const qty = input.qty;
      if (!Number.isInteger(qty)) {
        throw new ContractError('Invalid value for "qty". Must be an integer.');
      }
      if (!target) {
        throw new ContractError("No target specified.");
      }
      if (qty <= 0 || caller === target) {
        throw new ContractError("Invalid token transfer.");
      }
      if (!(caller in balances)) {
        throw new ContractError("Caller doesn't own any DAO balance.");
      }
      if (balances[caller] < qty) {
        throw new ContractError(\`Caller balance not high enough to send \${qty} token(s)!\`);
      }
      balances[caller] -= qty;
      if (target in balances) {
        balances[target] += qty;
      } else {
        balances[target] = qty;
      }
      return {state};
    }
    if (input.function === "balance") {
      const target = input.target || caller;
      if (typeof target !== "string") {
        throw new ContractError("Must specificy target to get balance for.");
      }
      let balance = 0;
      if (target in balances) {
        balance = balances[target];
      }
      if (target in vault && vault[target].length) {
        try {
          balance += vault[target].map((a) => a.balance).reduce((a, b) => a + b, 0);
        } catch (e) {
        }
      }
      return {result: {target, balance}};
    }
    if (input.function === "unlockedBalance") {
      const target = input.target || caller;
      if (typeof target !== "string") {
        throw new ContractError("Must specificy target to get balance for.");
      }
      if (!(target in balances)) {
        throw new ContractError("Cannnot get balance, target does not exist.");
      }
      let balance = balances[target];
      return {result: {target, balance}};
    }
    if (input.function === "lock") {
      const qty = input.qty;
      const lockLength = input.lockLength;
      if (!Number.isInteger(qty) || qty <= 0) {
        throw new ContractError("Quantity must be a positive integer.");
      }
      if (!Number.isInteger(lockLength) || lockLength < settings.get("lockMinLength") || lockLength > settings.get("lockMaxLength")) {
        throw new ContractError(\`lockLength is out of range. lockLength must be between \${settings.get("lockMinLength")} - \${settings.get("lockMaxLength")}.\`);
      }
      const balance = balances[caller];
      if (isNaN(balance) || balance < qty) {
        throw new ContractError("Not enough balance.");
      }
      balances[caller] -= qty;
      const start = +SmartWeave.block.height;
      const end = start + lockLength;
      if (caller in vault) {
        vault[caller].push({
          balance: qty,
          end,
          start
        });
      } else {
        vault[caller] = [{
          balance: qty,
          end,
          start
        }];
      }
      return {state};
    }
    if (input.function === "increaseVault") {
      const lockLength = input.lockLength;
      const id = input.id;
      if (!Number.isInteger(lockLength) || lockLength < settings.get("lockMinLength") || lockLength > settings.get("lockMaxLength")) {
        throw new ContractError(\`lockLength is out of range. lockLength must be between \${settings.get("lockMinLength")} - \${settings.get("lockMaxLength")}.\`);
      }
      if (caller in vault) {
        if (!vault[caller][id]) {
          throw new ContractError("Invalid vault ID.");
        }
      } else {
        throw new ContractError("Caller does not have a vault.");
      }
      if (+SmartWeave.block.height >= vault[caller][id].end) {
        throw new ContractError("This vault has ended.");
      }
      vault[caller][id].end = +SmartWeave.block.height + lockLength;
      return {state};
    }
    if (input.function === "unlock") {
      if (caller in vault && vault[caller].length) {
        let i = vault[caller].length;
        while (i--) {
          const locked = vault[caller][i];
          if (+SmartWeave.block.height >= locked.end) {
            if (caller in balances && typeof balances[caller] === "number") {
              balances[caller] += locked.balance;
            } else {
              balances[caller] = locked.balance;
            }
            vault[caller].splice(i, 1);
          }
        }
      }
      return {state};
    }
    if (input.function === "vaultBalance") {
      const target = input.target || caller;
      let balance = 0;
      if (target in vault) {
        const blockHeight = +SmartWeave.block.height;
        const filtered = vault[target].filter((a) => blockHeight < a.end);
        for (let i = 0, j = filtered.length; i < j; i++) {
          balance += filtered[i].balance;
        }
      }
      return {result: {target, balance}};
    }
    if (input.function === "propose") {
      const voteType = input.type;
      const note = input.note;
      if (typeof note !== "string") {
        throw new ContractError("Note format not recognized.");
      }
      if (!(caller in vault)) {
        throw new ContractError("Caller needs to have locked balances.");
      }
      const hasBalance = vault[caller] && !!vault[caller].filter((a) => a.balance > 0).length;
      if (!hasBalance) {
        throw new ContractError("Caller doesn't have any locked balance.");
      }
      let totalWeight = 0;
      const vaultValues = Object.values(vault);
      for (let i = 0, j = vaultValues.length; i < j; i++) {
        const locked = vaultValues[i];
        for (let j2 = 0, k = locked.length; j2 < k; j2++) {
          totalWeight += locked[j2].balance * (locked[j2].end - locked[j2].start);
        }
      }
      let vote = {
        status: "active",
        type: voteType,
        note,
        yays: 0,
        nays: 0,
        voted: [],
        start: +SmartWeave.block.height,
        totalWeight
      };
      if (voteType === "mint" || voteType === "mintLocked") {
        const recipient = input.recipient;
        const qty = +input.qty;
        if (!recipient) {
          throw new ContractError("No recipient specified");
        }
        if (!Number.isInteger(qty) || qty <= 0) {
          throw new ContractError('Invalid value for "qty". Must be a positive integer.');
        }
        let totalSupply = 0;
        const vaultValues2 = Object.values(vault);
        for (let i = 0, j = vaultValues2.length; i < j; i++) {
          const locked = vaultValues2[i];
          for (let j2 = 0, k = locked.length; j2 < k; j2++) {
            totalSupply += locked[j2].balance;
          }
        }
        const balancesValues = Object.values(balances);
        for (let i = 0, j = balancesValues.length; i < j; i++) {
          totalSupply += balancesValues[i];
        }
        if (totalSupply + qty > Number.MAX_SAFE_INTEGER) {
          throw new ContractError("Quantity too large.");
        }
        let lockLength = {};
        if (input.lockLength) {
          if (!Number.isInteger(input.lockLength) || input.lockLength < settings.get("lockMinLength") || input.lockLength > settings.get("lockMaxLength")) {
            throw new ContractError(\`lockLength is out of range. lockLength must be between \${settings.get("lockMinLength")} - \${settings.get("lockMaxLength")}.\`);
          }
          lockLength = {lockLength: input.lockLength};
        }
        Object.assign(vote, {
          recipient,
          qty
        }, lockLength);
        votes.push(vote);
      } else if (voteType === "burnVault") {
        const target = input.target;
        if (!target || typeof target !== "string") {
          throw new ContractError("Target is required.");
        }
        Object.assign(vote, {
          target
        });
        votes.push(vote);
      } else if (voteType === "set") {
        if (typeof input.key !== "string") {
          throw new ContractError("Data type of key not supported.");
        }
        if (input.key === "quorum" || input.key === "support" || input.key === "lockMinLength" || input.key === "lockMaxLength") {
          input.value = +input.value;
        }
        if (input.key === "quorum") {
          if (isNaN(input.value) || input.value < 0.01 || input.value > 0.99) {
            throw new ContractError("Quorum must be between 0.01 and 0.99.");
          }
        } else if (input.key === "support") {
          if (isNaN(input.value) || input.value < 0.01 || input.value > 0.99) {
            throw new ContractError("Support must be between 0.01 and 0.99.");
          }
        } else if (input.key === "lockMinLength") {
          if (!Number.isInteger(input.value) || input.value < 1 || input.value >= settings.get("lockMaxLength")) {
            throw new ContractError("lockMinLength cannot be less than 1 and cannot be equal or greater than lockMaxLength.");
          }
        } else if (input.key === "lockMaxLength") {
          if (!Number.isInteger(input.value) || input.value <= settings.get("lockMinLength")) {
            throw new ContractError("lockMaxLength cannot be less than or equal to lockMinLength.");
          }
        }
        if (input.key === "role") {
          const recipient = input.recipient;
          if (!recipient) {
            throw new ContractError("No recipient specified");
          }
          Object.assign(vote, {
            key: input.key,
            value: input.value,
            recipient
          });
        } else {
          Object.assign(vote, {
            key: input.key,
            value: input.value
          });
        }
        votes.push(vote);
      } else if (voteType === "indicative") {
        votes.push(vote);
      } else {
        throw new ContractError("Invalid vote type.");
      }
      return {state};
    }
    if (input.function === "vote") {
      const id = input.id;
      const cast = input.cast;
      if (!Number.isInteger(id)) {
        throw new ContractError('Invalid value for "id". Must be an integer.');
      }
      const vote = votes[id];
      let voterBalance = 0;
      if (caller in vault) {
        for (let i = 0, j = vault[caller].length; i < j; i++) {
          const locked = vault[caller][i];
          if (locked.start < vote.start && locked.end >= vote.start) {
            voterBalance += locked.balance * (locked.end - locked.start);
          }
        }
      }
      if (voterBalance <= 0) {
        throw new ContractError("Caller does not have locked balances for this vote.");
      }
      if (vote.voted.includes(caller)) {
        throw new ContractError("Caller has already voted.");
      }
      if (+SmartWeave.block.height >= vote.start + settings.get("voteLength")) {
        throw new ContractError("Vote has already concluded.");
      }
      if (cast === "yay") {
        vote.yays += voterBalance;
      } else if (cast === "nay") {
        vote.nays += voterBalance;
      } else {
        throw new ContractError("Vote cast type unrecognised.");
      }
      vote.voted.push(caller);
      return {state};
    }
    if (input.function === "finalize") {
      const id = input.id;
      const vote = votes[id];
      const qty = vote.qty;
      if (!vote) {
        throw new ContractError("This vote doesn't exists.");
      }
      if (+SmartWeave.block.height < vote.start + settings.get("voteLength")) {
        throw new ContractError("Vote has not yet concluded.");
      }
      if (vote.status !== "active") {
        throw new ContractError("Vote is not active.");
      }
      if (vote.totalWeight * settings.get("quorum") > vote.yays + vote.nays) {
        vote.status = "quorumFailed";
        return {state};
      }
      if (vote.yays !== 0 && (vote.nays === 0 || vote.yays / vote.nays > settings.get("support"))) {
        vote.status = "passed";
        if (vote.type === "mint" || vote.type === "mintLocked") {
          let totalSupply = 0;
          const vaultValues = Object.values(vault);
          for (let i = 0, j = vaultValues.length; i < j; i++) {
            const locked = vaultValues[i];
            for (let j2 = 0, k = locked.length; j2 < k; j2++) {
              totalSupply += locked[j2].balance;
            }
          }
          const balancesValues = Object.values(balances);
          for (let i = 0, j = balancesValues.length; i < j; i++) {
            totalSupply += balancesValues[i];
          }
          if (totalSupply + qty > Number.MAX_SAFE_INTEGER) {
            throw new ContractError("Quantity too large.");
          }
        }
        if (vote.type === "mint") {
          if (vote.recipient in balances) {
            balances[vote.recipient] += qty;
          } else {
            balances[vote.recipient] = qty;
          }
        } else if (vote.type === "mintLocked") {
          const start = +SmartWeave.block.height;
          const end = start + vote.lockLength;
          const locked = {
            balance: qty,
            start,
            end
          };
          if (vote.recipient in vault) {
            vault[vote.recipient].push(locked);
          } else {
            vault[vote.recipient] = [locked];
          }
        } else if (vote.type === "burnVault") {
          if (vote.target in vault) {
            delete vault[vote.target];
          } else {
            vote.status = "failed";
          }
        } else if (vote.type === "set") {
          if (vote.key === "role") {
            state.roles[vote.recipient] = vote.value;
          } else {
            settings.set(vote.key, vote.value);
            state.settings = Array.from(settings);
          }
        }
      } else {
        vote.status = "failed";
      }
      return {state};
    }
    if (input.function === "role") {
      const target = input.target || caller;
      const role = target in state.roles ? state.roles[target] : "";
      if (!role.trim().length) {
        throw new Error("Target doesn't have a role specified.");
      }
      return {result: {target, role}};
    }
    throw new ContractError(\`No function supplied or function not recognised: "\${input.function}"\`);
  }`;

  let arDriveState = `{
    "name": "ArDrive",
    "ticker": "ARDRIVE",
    "balances": {
      "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4": 0,
      "BPr7vrFduuQqqVMu_tftxsScTKUq9ke0rx4q5C9ieQU": 0,
      "2ZaUGqVCPxst5s0XO933HbZmksnLixpXkt6Sh2re0hg": 15061,
      "vn6Z31Dy8rV8Ion7MTcPjwhLcEJnAIObHIGDHP8oGDI": 1500000,
      "FAxDUPlFfJrLDl6BvUlPw3EJOEEeg6WQbhiWidU7ueY": 442625,
      "Y5uP96wryXqGRASVcNPgue9fJXb5rvt-YftbDGcn-I8": 5044,
      "vhHwEoDWij2joZwVE8WEXhJIf3fAdg0FNVdmjg5urb0": 496,
      "LA10KNfQBFy7rLOGHmUu5qHFeZLdJU0XSfVTwBbs_FI": 11287,
      "AbMMbmnFraBhuOZoYXn1PUSi6VLx60cVYFcFVsu5Kqw": 3000,
      "wyHS2DEWGvUmEk5bVWvr4JDHvd9QudJbsD0q7oocNqA": 1073,
      "vF1zqmmHgvKPgJ07ThMJ8WhQFmfQ2Ctz3jOYp1BNVpk": 81,
      "V0UNn5oBCtFSr59kaR5-6wRal5Xm6IGNZK-babpyDLU": 41,
      "WNeEQzI24ZKWslZkQT573JZ8bhatwDVx6XVDrrGbUyk": 21090,
      "aLemOhg9OGovn-0o4cOCbueiHT9VgdYnpJpq7NgMA1A": 239,
      "L4Kwxs0yEjAC1tKjH9J3V9Zvs-u4e2LUw3uugMAeW_Y": 1,
      "TEHjbg0NBCTOx49dbFOyL7v-ljT3LykMtsG4lGEfERs": 2389,
      "oeQc64JkVpmTX9XkI8Da63QyyoCnfOlEWFjaSA6_zkY": 68286,
      "OI_wj-AISEWopcnlzPIpvN9Wd_KGvUlIRZ-2c5jT_OE": 3,
      "D6FrWGDzFMdt0P9sXnMu6dYsQY-YL_THFA0jBpHD4LU": 747,
      "Yr0K-Zd3KTh95s5p67p_DAVvzjGTMYbuHt0EnKbvLww": 17276,
      "MXeFJwxb4y3vL4In3oJu60tQGXGCzFzWLwBUxnbutdQ": 4,
      "CGPiCkwmqYoajSIWAXqLU4llVo_TmuybxaIBJ5Ma6fQ": 0,
      "cc67zmyJ1SYbqlLd4rE7xB95VJ9__qjaEzzeHgxTsbY": 63,
      "xg1PvQSvQgxVudSyNcXutYJHE58xh9LLSbx5V4prwbE": 9,
      "9Oyncaa4eROwxPZtPp7k19T3C8Y5LXHy2SOsEYMcb2s": 1494,
      "Th7VysYPJEzvWynOLVKzDovDkJ1SFF7oON4obKzEq7U": 24121,
      "oz-NHKlXKIHSWB1Zcj1ZfKcaSsLnjA3PXIi5zvrXSbU": 102,
      "MzVTtsJ-F1z6PC-U0X7o72zGW-BTtJHotifOB-g8ru0": 18,
      "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls": 33,
      "C6nBlkd7pKRxPiUk1AaGeCrup7XiVQow40NO6c9RDGg": 8449,
      "E1NX6jNfiuOHmsUSUFoX8GFdobu1POkCKddIO14bsno": 33,
      "zPn4sIi0qdvw8f3H0QY_3dmx9lT6r6n2vGe-CRWCg1M": 1,
      "eLBG8aqwy5fBqeEiiHguIjpBm5_zeDjjOVWQNDY9olE": 4,
      "CNxO-KeUOl6FWAwRjIeyFwuZ9MVrW_pTcoBsZWl1WYI": 44,
      "mHrJIdsS3NgCQcKDpLgDMF28G3fI_ZGlhLsYkNusM2Q": 14,
      "9iSc6MB-oXZ204gZBrJM3jzR8mlLwCfjP1xYRzFRYoQ": 1392,
      "krX00rqzwcKAkC_cnn0P0cfx3FBJOE5KCdrvvRk6c_Y": 7639,
      "ZjJbo2n9RgJ9rTCTOWbBtUSEVtzOU6OwNdyIUSimG0c": 3003,
      "NepZzhh7ecsqMbiE6VyaIU3TU1vPMhokSAc5tvB-BLY": 5407,
      "ZXTB2tX2ZH4F1PPaI6ArPIw9jWMeVe7eTiWnLoiHFCg": 715,
      "5GIXb--CsZGPiTfX7VUp7If4bp2n1yoMBVP_GezRw-g": 1,
      "4B7Yc71XQDiOHzCng3HFp1cwEkW4lCrQDJDpYj936Yw": 38,
      "C7xDoWweGntb-UlNY6uU_1CAL6k-CFD_MOiG5I8cpIo": 611,
      "3-PhCPcBUCYbZcIP4O2OUY2mlkRS3_cn7_uTloVMqZM": 6,
      "Va7D0YFy9EXIf5tkgByezLSqzH7Tu_wrDlz1OiNNBOM": 11,
      "8ExKuNYHq-b_oodlhZAoW-i8W_7iAhpBROHltj6AEWo": 8,
      "4ffvJfOg5ml2QSN-PWCCWDVkJJdTTfXxgFjmOdBrRio": 37,
      "aoaJNC8NcKVfgwaUj6kyJi2hKrVGUsRHCGf8RhKnsic": 7544,
      "3s33KRGW9qyDCVCSeN_SjwCaCEk5hrtcBfGVmCJrPB8": 159,
      "tlEtv-xrvtjtQobYjqus1kSZ2GuNW0AcPUlNpdAHf8s": 11558,
      "6vkbpqpkfnnCG5W2tTp5LEcBlassCe2ZlsBfvsKJrXQ": 267,
      "oxq7mVUflRzz8E75dgvOlWYZW4klIqUjGFW7qVlvwi0": 1937,
      "cr3fPM3vLl82YVHok38xwEHnhKZaRV-wb_fmP9XkTI8": 10,
      "to2r4qzI2B5JGGTtFHunyoBbLpG0Ql0YvzlGScvnG5Q": 8298,
      "1npw_3ruw_Eql0co9nNC41ivRFmdYDVqbQfGZltwBbo": 3,
      "g1__WsnusYTuIKQeGw2Jhgx4eoNxjoN96Mg7xHhRjQQ": 23,
      "JOq0lHz-A-qGSnp6Gy0TtUJFLB5wPXL-pPdt5x2Gm7w": 26,
      "szsh6__5XwYAu_laOqPdMmlPg7inFlChMRwLnbg4Rt4": 145,
      "2asKClfycOBNjOfKcQ8shxmxfEMJqvwUVFlB_DK2K-g": 1,
      "BiBvVZrHd1RLpsmqodJuVWHEJGjyazKNSD-bUY7SfNo": 2,
      "Ps7mYvauX95ALOgFB0dHXOJzw_lHgI5yMUtIYUfkswA": 1300,
      "31PNvqmQpslkHV6Au8glLqQDJI_cVd_Y3OhR4wcXR_E": 6,
      "t841Of2SqkyX5uClxYyUzrsN-QBUSPLJuwBQMnBWsGg": 5,
      "Q0rN7igxiTW0rp64sarUzIregcIGIgRBInqdNk7zHVE": 28,
      "oqQCPfq9-bxAGk2hJAVsB2uhrtCgp7PW_XZyUkV5sVg": 598,
      "ZfpG9TddqEzDwzj7mV0TFSsWe_A51O3yD7a6FHFxo70": 8,
      "UEldqkzFnYq8EQHx5UoBFCy7SarLKjBY1EcspR6b4xk": 8,
      "xtpbVzANkm9BKO-bONKzu126utGIvHWW6RYjur-ZHFE": 10000,
      "eamTbADrABJrjr_0dWOTqHU4tUYE7CSICltDZGcYc4o": 111,
      "x6B0nQQkqMjxb9SUITSopxTjCT0UuG6vViDFWUOellk": 4507,
      "MhO_kRT5Lz9THkDZo8GjUNGPCMEOhG3wFFLtKcMFeiI": 6593,
      "fQHCtGRQ4VEVdDTNOIUvcfkxX4balC-6pVYm__tt9LE": 5134,
      "9ecJudo33HhcyyaUZTnDVo5pJEiBP9F3-bhzfnWqcN0": 11,
      "SXRCkBNu51a0pKnhtsjVCNWScI_0pyWDavg8f9f9mqI": 25,
      "BFdW_o4mS_WBPqpYwEmnm-QFgbHZOW_DU_HVBgo_aB8": 48,
      "qBRa782iJ4Nry0apjK0svfIJK-X_7mppep7bnDOH6_g": 1217,
      "uzQX6eFw4je-8pUVpvXaIOEV9rsIx95lUUDg5xZgf8Q": 40,
      "Gd-ApCvm4pOJ3Xf7Vi489rgQj-YzcunYx3zZjbRcWj0": 14,
      "-sj9F-Lb8oqKnqnoJGFXeRGDJtB4z4Z-a1znMkB3nwY": 1523,
      "ZsY1hkKJey56peoQNXQSLulvOzViXmyo3dKkj27whNs": 158,
      "YGMNupSQcQYINhXuVh7xX59OW575YnFQihI2nIArai8": 173,
      "OesddStCpX7gW3ZWxO93GnU7wRYjAQIJUA8c7KkID2M": 0,
      "6xZ19AHfJqPBbKFfcV5feWmpHVopHVUA1RQ48S9O_pM": 8,
      "_xc1kiKnRYeMKBGmPvfUwSkcCkxt-18djbVDgJFvu6Y": 2097,
      "VwGHo8d5Rhrk4CE0_DK9uQbP0uQczvSQz4d90dCoLmg": 281,
      "x_kYqg1CbICnPcGkUVW1AHCrgq7tul-L5Egkf9VtQgQ": 9735,
      "BuZzparsfJ7Uw-rfrsaPrJcJo8jayTodTuJ4mIbFy4M": 2256,
      "50JsLTN4zrk4l2f6H-NiR_Gxye-RKwnyPx187-in7rA": 2295,
      "XAsf3goodB5xZTle1nVHf9fyAJIEHUfKA90wy0rlBOo": 115,
      "e9K2rBUbSRNVUyWUjMUnttMNMLUdKemIFM6sPhe1vVs": 10363,
      "vxUdiv2fGHMiIoek5E4l3M5qSuKCZtSaOBYjMRc94JU": 251,
      "RKRO33hW4iR5qjeXHwluk60g7ZyWiCqBzASUXY6fGKo": 10000,
      "TREkZXM0IP8gKU-eI3bfBm67_qg5xjwltwp8S8UaOxE": 14,
      "HK9scQddhbWITsBy60iLytgDf8bkPqqDAEKD9cIide4": 1,
      "oMwZ2Q04j2d0XMuHmb3tC3QhjM7m8rHgQGnzc9OX3y0": 34,
      "OEL5ULYmClWza48sqjFKM31Qt6Z3vqnrZICwvhBchHo": 2,
      "ZOInNIsk3wel5Xyp3LVud6V2BF4DQJuAY4dow42de5Q": 4,
      "YjVQ8x0huH5fVYeFdFksYNPrU9tCsiorsuBl91W-SPc": 683,
      "pcXbai9GoRbtBWrAgb8RkyEuDXYy5DBn0rMNfg6azGg": 769,
      "BXGvIV_l-sXfaeU78F6bU72yUZoMIkBAkXJSMM2cpOY": 91,
      "aPptIV4y-PbOx_KmMdVWGGbmD9zE2eND5Y1C4y76IjU": 699,
      "r4cZ50TV-tUpqV-Zf1xOaoNpWrq-8lz6JUHkpPXmEmY": 3200,
      "Scq7sztUXfzgWo4uddMIwK5LKYmyXpGXY8YIKuYv6tU": 2254,
      "PAJjjkgt8P3RI3C95u2pkB2tkiqOJjqyYv9S2LuV_W4": 16,
      "SMft-XozLyxl0ztM-gPSYKvlZVCBiiftNIb4kGFI7wg": 67,
      "WCx054sIZjvbkZpCdaRYVLD5Z2fXmg7fH_C-8bRztKA": 108,
      "gDYOOmQNlSKdELG5UsZXqlPWdGnFjqLUF4CVAEO413Y": 13,
      "JOUrdWN9CalgHzqMMcDLGpQ_yvrjSZX2aD5wY7PQQPI": 11,
      "2o6qd7AQsZdeXE79ZYLeI92sRuuX1KCDxxDx3aNtQiA": 284,
      "6jL6kOXqcI-4NQDrIR3Q0RVNfeGEn31lnH83ujfaj_s": 237,
      "vACBPFvIdSoMdjgPpqJq2xa_C9JDGFcpRtCICFjgFAo": 3696,
      "jTA8_iBEM8wkjWRdPIneXa2tJW9mDAV59-ZHIb5KXsU": 25,
      "9krNWYLlnHdJcbJbvURJSP95oicXpk4LkaEVtTCPPes": 21,
      "xvz0JBGVTua7JdYlNTxfhrBm6SHMUaJuJFgQZhJx4KU": 3000,
      "ShipHyYFhWqSuDJQvsZP2TxeCUtVPnPN5dBSINwOLgU": 152,
      "oP8eDBQUQYbI1e2C6qxd3ouQWQ3WU9m9kBXnPWM4eO8": 1748,
      "FWlLi87gg_ZU5guWirjLCp-7TyzcK8CgVdOCng5Rgzk": 10097,
      "k3bW8ytZOMd4i1HwmtZ1UF0hlSlhwLeKCIHg7aVWlxA": 2186,
      "Sm3gExQPRCpjB9Fv6PsK_UQKwwaonnrPUhz1UqT7_xs": 21,
      "g9vTEpTi2_9-J4aoV8vH7ZU2EOn3d4rch8JEvpnXcuo": 111,
      "Tsl1rSBrscXggpIRqI5bC_RXDgL6Q9q-F62uVpxtSbY": 72,
      "NGQl4RsiTdcxUlTrr7dwfXyt7cvJc8wis8OyqE9NlN0": 1759,
      "2PAhoq8EBHEXcG5byci30w25BpE8XhgI6OIIkda0BYI": 2690,
      "9zSu5p0cwuLN4BaQCjII8H6VgFnVsiPePhQJldm28ZY": 60,
      "-A9j0ZPDYW7qeBSuyvlZ_dRM0vVEJ7V5q2wFotGatQQ": 710,
      "nQ3Jr2MVHyTKi2FKs-vQtYw9gUKL-CvtngH1lLJW1Ok": 620,
      "QrFggmIFdT73zZW7IV9_JcC0K-V0GTyzU7heAsLRqbs": 5,
      "f5U5-K4GN6_z0t-oRkiNHNRV8X6zrN5oN7bwgWm3RBE": 5,
      "WS4uTF2ANhSUWwB6xCjfa-LDGfAhY__E_hGx6jbFaaM": 5,
      "ews809i4ID2ZKCrHx_1EGT7_8bH8w63yGeU80lIukgg": 5,
      "g3i2SW-ZNrOyXGCxwBDIRtldfXnuC2Grz0K5mk6yufo": 5,
      "3jFB_fkYYeab0gXIcRIDyf-Ngxnwd6D-7YlPnkJgrvc": 5,
      "dxGmt44SZenqmHa-_IEl8AmuejgITs4pB3oe-xUR36A": 11859,
      "ve7g9WsjbXmZ7KKIjoqUW1sHGGha_CQV-tFiTKC5m3I": 1,
      "Tee1Vu6JD806JSekEOx-mYj_3bgRAVAdPaM4vxw_XZ4": 610,
      "a1ERtuQCXHgTvVohA9esQd3Gq9pF11HO89ozPs4uJCM": 410,
      "h8pFLXAO5Pcd2iguUTfiZi5yBOXvl7pSES96nzTiEVQ": 626,
      "F_c1YBhWLXhnJQxMyq3A5mJ9d87iVvjw85aG7Sd_G_Q": 510,
      "Myg_rC5z6G9GyC3lOTeMuk8cPeGeKoirwd_VyV7aRsk": 0,
      "c2PT3U69xsiXQmDcoSsbeEK6ApGCMeDL0SdWKsTjdIo": 860,
      "Hn8iFr2BP7CMxUQFaFBVol8z8mdoVGFlNTLZakc7Zkc": 0,
      "wTRLsE6sHbn0wzL7RhuYpEOCE-sXTZBmesR61mPEUbw": 10,
      "92Fltt8mfCjcTewHvUhzrkkQnACSanfBwqkVtBEr81g": 10,
      "Aijnzx6Wto_na_9Gmj5UBgwKwNojWp14C12JgX6Pi_Y": 10,
      "k8KF6mf6Av1sZS7MYTHg7lcomoJfdjCDB8NTaFlICc4": 0,
      "87IKPF5F-eFeRQq-T_jwJr8WF0SitnQm0F34ciW1cmk": 10,
      "zXKZCrp8QmiSSZ7MYRdxFeS2Zk6ZIka3iBli-Igwoec": 0,
      "hIDQKAcQ2X7qdfM8g1faSkztKqdFPyiNhDUItt3sTUU": 10,
      "XwOgn4w8OZSek8zXJYmaZMp0u1xIS-87vjj0kz76cgc": 0,
      "MuB804jcnPwYTEzxTwvhg-ixMvnLaU9sEfEF6te2dLM": 10,
      "MMPvofA5MaVQg5bsb_uCEULG1cCO3UBns-v6-LbQzw4": 0,
      "4IU_gEJDBNX0LMG3cziuoYCCUnDp1W5okMvgO5sRfl4": 0,
      "FeFfGGNMYVs0utc2OGKlzOUbp7gUnfpmX6jd4uCkUwY": 10,
      "TSRtXP6ilZSEH7BofqxNZcBO4o-Dp-8g2xdW4ZBZYKA": 0,
      "sbebgN7HGBAeU1J8KTdbPi_RZ63Qz4L89q-hSDxiXkk": 0,
      "dV_x_JpwhCkSjh_G4ErX-WJFkqwzS6hu_oYrwSH-zz4": 0,
      "nP8_NlfHp9QeQFEySNb1DZSE83xKfqHN2gO4GmW5bHs": 10,
      "YTfDX-4bQpLiBxlTHRtwJt3BPZH0U0Q0qk3mu_h_9R4": 10,
      "XXNaAjpPCnCH4bqikIuwRe4DG5fjMQoRceWeSVwl6og": 0,
      "6iVvchUfRe6wB9onZhxO6aKB8kyfTQZj2gKCLIdlwSI": 10,
      "XbLmT-oVTUQhFq49vBBsUcM5rDnc_4S2UoZqBysCi9w": 10,
      "ZEfUytDvIt-MaitRzELH-43XfyyJQ7_7zuiMIXiURLM": 0,
      "zY1GEoB-PNr9LSn0U-WbpVbHD-lzkeJMi7VeHZcHE04": 0,
      "bDxgP7uS0WtLOvudmO7BZS8Hl-Q_KNvnEVZBoHkRBAw": 10,
      "iuX_QbypRJRLBBCzAPNR9V26nmqR18lm2Ba2hbJF4YI": 0,
      "98t_OF90_B84E0JmRyrTia3Ehhji-eDlca0Gs8kdoKc": 0,
      "RwP_I2VKLnioIoHgHZUweG-MiIQ21yJY5aIDH7z9CfE": 0,
      "jsTbP1R7RMfiQPvnK-IbdGzP6LtjSiSbxAR8NT9JvjI": 0,
      "paiUzHHDswZ26lNt-W2Qq6cVYwEz_1euY6k0LMVFhHQ": 10,
      "BffCLy3cAkoegrvG4ZGeG5Q7stn4wuhfKWi-thQy0kE": 0,
      "C4YG9EDZDe0DgnxfyitDUq0FOchThxeXfvABQR0ZUGw": 10,
      "K2hlumcR66IrpmFoxg_SgbWCuNnsyACxBxWhYYgnrT0": 40,
      "LY8TS1FhkRjLdGQA7yBA7PPBtHrLnDrasCql_spfYHw": 10,
      "Bhj2Gm9ZgJ2DhR7GvGKaIzf_QGs_mREmdneH9CtSWcI": 0,
      "6FU2h7KKrLDV0VbYBTZ41GKtP_VpFf5154R458dbghg": 0,
      "EXyZfgukmHC3XjchUUX1iapmQmFRxx2l0khPmAvhpKQ": 10,
      "K9AvHz8o5cuMSARb27QAFkKlcjbkGWVNZbJ3CfsJ7Ww": 10,
      "CHmyn2urzho3ic9-1dWQ8auGzxeVzO87yvM8DsOEdmo": 0,
      "x29wsegyUtwKScIC2DTeB8giqnUw8yC00holDb4X5VA": 0,
      "vdhW1ImGpairfALbBufcaCSFQGBMtXsWthkMOe6F-Lw": 0,
      "uKGuEOPc2T44ngI7ZYvfNLJpZ5lwaMYnnE6TFAW-qk0": 0,
      "YcIIFop0VSmSXoRUIOwGdYFQqyisjM8D2BaPZBt0Vjs": 0,
      "XJjSYRFDmr1aEKNGY6up-vXQdF6zX8MiDZcxTJBJRxo": 0,
      "LfRwMPJQn-7a4_gKcmHsiAivryQFVrHFGJ6msAJ2ub0": 10,
      "UukVQehhs13i9DaOZPp6PcQnU-hBBY3VZy6ikA9dU0c": 0,
      "EuSXZ9DgvFS5RYmGIwhmg1Jn0zvf84yOrxqvPVQRT6s": 10,
      "_aM3Owo5fSrjeek91tfMyBxO9doVEqq7Vm9LjyOZbYQ": 10,
      "FokFaHVIlwt_pAXGQMCltoHI8Z-_cEqMWmRpbFkM2Eo": 0,
      "PnGEXqR59q2Jc0jPNVIexvBpj0q0qRBXeVjaLGSvLBs": 21,
      "5iTtTHqCVKcgP-ZiGff4bRksP_o94QidCqyPxY3X9cI": 0,
      "yllwvBTgNr8tiUknEq1n820UCvi32MZR351slgjhxMk": 0,
      "ncSztVCYaHKZQNwBs4c-CoaCrhCznTVXgEK5fogkJe0": 0,
      "aIiSuW0z07nKHFO1qmtAX7JAWjsu-_-rnBfJkykKfxU": 10,
      "hkxINnSeG_kVU9SIYHtaoiQz8Ok0dha2SbSNgpYxfl8": 0,
      "NEjUFlHMDqwJm5W8KR64H9F0X0UcQVOpIoFVPxCPZ5U": 10,
      "M68KyIYhM84FXG-9-YbaSMRco4MW6wxmGK6K-_L1ov8": 10,
      "gtwyYhG3qkZ5Cod92zeRoR5i-S27KBvMcq0Fd6Q-Q8s": 10,
      "Tglg6B3yIRpj1BBc2OJncrNYGPv5O3QyMRVW7an3mYQ": 10,
      "XNrqIVR9yorO83qmxteMrm50___HO17GsV4Kko62INI": 10,
      "ItQCBNzzzLQYB9E_ULQ7cEQSQTstaj9IaT8FwZqxJHo": 0,
      "MJys9xjfXCsJs9E7ar90L328U2JDhyYpJFSDvEt4vUw": 10,
      "AlBHBLwHtJQZeuAV6iUxR5l1Io3Yfp-dfnlXw9fIZDU": 10,
      "gwkT4QUvrFg5DJqnLAiUL3u4_dWED-xroUrRB2YE-sY": 0,
      "2Q8CmpnycNwLPSv-FQ58Gymyiho0TXrH-Z1TmKrk8Yk": 0,
      "MtwabQgFf9iJmrBJeTYZWHmPfq7uMheDDCFhgWotA8Q": 10,
      "zFwzGbN2BbYaQvJxF-b_oIqXTjBvDz7T-eWCjC0HHEU": 0,
      "E5NP7rBEOQVQFw_zEIHqsAETdVPZjo3OqOND2n5iDpw": 10,
      "p0Gn2FQaUzzlznzD5wUn5Eaw9a6BLU3ZCxsjzALCNAs": 0,
      "diDxa3izeHtGFZ_IyFpCVnl3lVUsbX0qsLBS1O3Lwbg": 0,
      "uihocE85bbvmmtUU0GepeUqWO4dz2ysBjhO3wvYkpz0": 10,
      "0zvVGRLiTq6q0ugY6LpZH6BRUhoGO1gN-ufjkBneKQw": 0,
      "GmoiMBzXj5o4fJ8Ky2Qr_jUM1u05g36DbOB9DNy1Z0w": 10,
      "ZG4XdFvBUdSTD_9ZalL2b9R67i8AeLkbVxwvzAUTEUg": 10,
      "sC9fFnQQacw-7j3XwFl1NeLf0KNgGvydBPtiWvICErs": 10,
      "QvEwZA61AzDi6lklJ1HCwdNc5tv91CeJP2YgnY-Ju0s": 10,
      "cqFb1rG_Zf3v_26ZDqkv_hTlr-iIMskOUDz1vIjqgio": 10,
      "PYrfXbsVP-C_iDAlRQ3qTCg-Am6jOBxCYTJfAy9zATQ": 0,
      "4Zw3zzMyT8A6NnbcZHVVaj3ARc0I_Wo2uNd4jFMIlkQ": 0,
      "h5BlYYUA88hidnmUM1A-WIyCFAAumKi6Ef929RP2O8Q": 10,
      "61OqJz90ygxfs_yE0k_pU74wkaKY7nRpmnTJDoQlwu4": 0,
      "SvGb-_kzgsnVQ577WrdhnTHURQ4UBzVMjP4PDxKFPNY": 0,
      "B2Gv6_DqmrTcxcUtKgj80VjtYpsj53S20AQUVbACTc4": 10,
      "EFuJVPaHEULj1EKT5X9-v5viD5-j8Z6U9RkqUVM1Nkw": 0,
      "Fb2WFB5L8bthsohQcH8TJBfe6W_RBN-Eay4lPCsDlH4": 20,
      "LcoPY4fjKlv9z8qYLOQkO4Jva8-J8oiUcEKKTJmvpsI": 10,
      "ORQe07Yrwz9bhrtKupizHKPBDtC7rsbVXwkHiaqCJRQ": 0,
      "VJiBc7poUZejUpsycJf2QUMSxThrCAQIbjqMzBKSzyE": 0,
      "PTUMO1Mm-VjpPdqXe7TEFI8YvjIdn-oFzKRtjRxVEOo": 0,
      "YRCGueN-_bzFvXVmJvnR9BRFj2_tVy5OVd0xqYZEQvA": 0,
      "UXSfgfUnTk7G3Pp4AMXTT0Qsxgu9qsDR9XbdH1N-39E": 10,
      "Xqv57sQ1JdVdqs036RJaOLdNgKt_bWfMbpLyGLSt-6c": 10,
      "idkxmtWjs9iGnb9XhFoTJdyaqBuh_GDlmrothOsuzWY": 10,
      "NP8A93z9CHdQ4bGPIz8SktRFyxBJi5hxuej-eRmqiy8": 10,
      "KJF2nUqxQ_cmiVu8ZL0X9d5o-JTdohFtSa9Fx7hyNH4": 10,
      "Uvse0bO9EPNPFyP8muQ9PzSKOgy-gW1oyGTwj30pzAQ": 0,
      "g665dzbj2oZ_KZfSGeRm5bRMyF5arVxDfVzfLkFdliA": 0,
      "u0cHA21ZouqMOpvsNsi10tJ1bJoGRZqyDIyfvHEbcrA": 0,
      "s6mp3CrXWNUVerMjanw_FzOgwrwQdmbzrc3PX7vzqgc": 0,
      "UlLVgC3XsuutTaLnmotFyr4w6qQqXuIKSVaZTDIHv50": 10,
      "NX5k6iNG2ZjCN_vVgxtIF_le9zzuV9e79PBmYDmJpX8": 10,
      "KKmv0VfzNU4YZvtMGd2WfPEbCdigk6VIDDlZ0X0HW0U": 0,
      "sIKzHXaCOvkJKM_elMLrcPH20mJ-nSryNgsZh6x_5lE": 10,
      "zplzh0nzbjpmoNy3ZqcKMaca72yP1agDmTZrKUDwExQ": 10,
      "KyMbDCYeF6ol3Dd2-TwHzuUWAp39Z_nQX7xv-litJS8": 10,
      "RiFsUbX5NZwwuOBfe7AI3WCQZaD7oH20dgZ7KbGYbfI": 0,
      "bhh4pg8ItkzQv36G8As9zko8WNVcXXldaJXjW2c_RAA": 0,
      "nsvrcqFUPcGSROHm18RAFw9Wd06zRjguR4uUQ1p2lP4": 0,
      "jDPqRh8HmM7n2s03EQ7e-eEb6xbsVb6CabHF8sEgM84": 10,
      "Ma35vl-ZTlO5-dmPSD3BOXd1fhLOeIlhbFToq5zj43A": 10,
      "pHsAI0Yeq2DNiiPcsWIcpNNIB7P_orlE_ajfyJ3UHF8": 10,
      "LFsBxwCkhluuLbG0lHm9-JGvojNAiewRtn2cQX70OO0": 0,
      "n1w7xMFfK9p_HUIHVzj5H-0TTeekVmfrcOyDWIakewg": 10,
      "0id3DyJADBavm2Vo_H7my0aM5L-VxdkkqIV6hkX0uzA": 10,
      "pQSEDiGvzpMaar6USe51-j7V_nALISY0D2Mufe5U_6s": 10,
      "mP1RMhQDkNsn5VFw4c3e-v6CXQVS8NBF8MLmM8iI1dE": 0,
      "1CuDzOAdO8CIE_L6wTItxa6u14tGtr4s1roaNuiIrTA": 10,
      "GBD5zuGsw0wW5sUfta21izYwm_zejbPbNFEHMj5VPRw": 10,
      "3hBMKUKXnIkrq26qK3oAXhOEvBYdQX2miPHSVrJFZiw": 0,
      "s8sZnQHtbXqHr4e3WmJFma3jN1vwdEeav7fG5OmcvNw": 0,
      "K8hmhvNX9f0ujSCnGwexWL0VUmvTiEkWqUXbSXSBFqI": 0,
      "1aRAeR0SNpFXarGyw0k_GC94JPjJks2zdtu07IWZjXM": 10,
      "8kMIIW8qn9g2iB-E-0fT4lPE79KANrP49JNJ9C2d69E": 10,
      "a2UEQVOI584N8w09sE6Wb_prJP2CMHQOVGr9mXKFEvw": 0,
      "2OLB45sQAm3T7jn92uWgHxNgylmfH68d0jocARJmhsM": 10,
      "7WqnCLhMzRcrfxEWBE0NbYSrT-vRlFDnXMEaf3f2-14": 0,
      "ep-LCDc-_ugGs177WfGEu2zQae-nGzR0BcPlC2OwgwA": 0,
      "AVUMf8K4wI5kQTsSYVA0aqGzav0o1qczP8Jmu4CpeAc": 0,
      "6IdTzDb2R4dA-z73XnJ2THuU7BJD6_9exALhWy_g4us": 10,
      "Hiocf0nRWtFU3tSXcHRbH9tjHYSGjpcf0W8zQbQ-6g8": 10,
      "_i1SpgqdL3YKicSzjY66mXrJohpl1YshQsdbH-wzkis": 0,
      "7oDUPDZ72RMw9M_Ugk81VoZVbb4aHn6t9qP-R7PV5_Y": 0,
      "xsLoRkC3OKFbcjg445fDkiJseFozCfvqEfwxUYNGUm8": 10,
      "U1ebK5Vdeb3Jv_blo4PhCqbb4ImiUQ8q5xA78Q8yjow": 0,
      "M0sYjDn4hCXu2AZ052D7TfrDkd_EOz8ZfrHum81JPWM": 0,
      "IUMXlbA6BfWrTRhugKWgRgEXrMbtMftI5Krv8NsvrPI": 0,
      "V02cB8SeDG3bWgo3V59HOqn3uec9qenbwdq4s2GIzVU": 10,
      "78SWr9lLsyTX0i8V23DL7fAfzZbMQhnK9SjzLwFPNIk": 10,
      "-lFO31ydd6OoqP6Ofntcz5Ee8JWRTK-g0nJKCIZVYfQ": 10,
      "rQXT5hF4Gibe4ABm-Z-_xxADTWoD7yhlQoN6u-t0jUM": 10,
      "cLqK5iLfV3Chb3rLV9UHEoKRVAjejCqks6FoRNCF2Ts": 0,
      "fPuVupsidYZGbiOHcArioc9AOyYekX57lyjfGeiCsO0": 10,
      "fkA1pwvyQ9fvSQh968Mmi9PM4ALGOTfewSdE3OogP6g": 0,
      "V0SDlpa3VsDiB_iSGxoIKAGMfeEmfvGk0IIVmxy4HWU": 0,
      "W6YpgSHkIAxH5wu0RnEBX8xTaJ9AAmUaNTgRdxvxZZA": 0,
      "EB6cCdIdJmrqDlPXH7zTfmlG2l-V5ATwHV2z-Zgaoao": 0,
      "-8oxyu5epASnFEv-m_rdCwNBdzYpdpJI0Nury7uxdIU": 0,
      "e54QUECD0cpyVBiUwJevF7s97lu3ZgWePagk33QXR0k": 0,
      "DZhLUuN-in8DTIgXvnZF37wh9Wss2aMg68JV2f71Pt4": 0,
      "zOnBHCpAmjztXu5Sd4kPEtxyqqGQtb6YmtmqZvbGjm0": 0,
      "OmGhbo-MfYiFD2eBA00juzy1A-PhGw5dJq5O-BowXUA": 0,
      "apu_YJ8458ZSHDekgrI57Pf6gf3nZDo43kPA7IVmwac": 10,
      "5QymVc9WMbF28zlLxGmMsRIHCw5Qs6ewr1a8CbxG_U8": 10,
      "qy7Bkn6TtdOaOlzOna3_8bpy_RuQDl9eoa5zDdsx1nk": 0,
      "JyoZTp_E99GkIgLHz69akAx6UwAUsMGeLu2Jd7sXrdI": 10,
      "3Dc7rXHxtHlm2tWKA27N8p_44RB2QK-KLZkOuw0IJzI": 10,
      "Y1IFGCUmhrm78RE5rLGIsmqhAfmfAHGHRsWCL0y1COw": 10,
      "-0HTOR6F-lebzMQDwSvfaS1VIapN49MKkYVLHxKwWAQ": 10,
      "lnIU8n0X_si6J1d7G2fgH_1ZwIs67CP5RSaGP6e3ID4": 10,
      "Reu0Kk8IEQ-xxUoJ2tuvfp1cEV_CGxY5943yQiOAtYE": 10,
      "rKRkR1Wz5IO4jpgttQD-WkSSeqJHsn4TA9xFgeWl7Ls": 0,
      "OAb7vgmy0mvjB4U0-xQkwgsCNdXMx3O4zQK1HQRze_o": 0,
      "mJeFoMZy4CiI9U9dyE1HDrifkFO2OVdDq_2_IhoOylI": 0,
      "d2Zxs2jv37VRByqLi_Uimy8sVJlr6lMIG6UmTT90oKs": 0,
      "RQaQ1z2wA25JZlRlmLkHLlHyM7GPtgThM7HF_vDLLS4": 0,
      "acDL-n071hCORLZo_NkY1ZmrUlzhoISdK-OMxCnVoIw": 0,
      "i_utC9AXnL1JmJRcSRUk2P0phbcxrWBmsGE9Ojw_T3U": 10,
      "ZmerKCcF3MtQkWHYcEq9r_6pkG3jyhLEHNoLpEN6z3o": 0,
      "1lisglN0RoCwIBOIC5aXSI6Q8wxQip9zTrwao1ivA08": 0,
      "lcYY4u0Cp8ZFU_0crtFmwVr7_f0nOqtJ_Tu7YLZXgjI": 10,
      "kEXYSUBvSZEA4ZNxSXL837hi5eKpDhaK8whTessvFWw": 0,
      "_Z4NaIVgKZ45C2I1OwjJ2H1komH6VRXBM5BgWGeVhQo": 13,
      "7brN3iIO6Rvvsc-c3I6OLoig6XSp9BZfIyB2-5SNCc4": 0,
      "WE_abA5i3WcNCzh4FXDzlg6Z_jTKZl9MCC8VIivtupY": 0,
      "B-IWVezubfFGElRGSV0XS5M4eHw35dyk9Xe_KaaXduw": 10,
      "NsLxWTzKovNepca-5tPFc6uJ8LIKjfGKpNFdjBHhBsw": 10,
      "_ZUeknZ9NLdCpufN_DkQ9EQeMV4qSHE6GQ0EZQex_-o": 0,
      "PAA775Lzn4DLAyRdezwt7WMW0pNsFOLiu3Y-fWnCc6Q": 10,
      "e1XhkkJYnQ2c2MUiA1UF1OPNwaPZ6svZrl1-zXQ8BbU": 10,
      "JG4ZLqhoZxZSPD0xNDtlfdgh0b1cCvsqR9jaHY5nCGY": 10,
      "0-2etMesQf7Pmg7XzhcI8SRcG4rdTkMXHtBI9z6bQJM": 10,
      "6taUR9rSQcevP1q-cHjuos41ye6Jd2Qc25VilQ04t3o": 10,
      "kQoWr24gugJFihG3DX9DrGpWG9U2pWdrrvindrNB7iU": 10,
      "nXMlhpddIZ6KlXvYpHmdhltiV3oiedmTQDb5gZff4M8": 10,
      "WiC-yIShMSN9rAEaIf7LQhbjp-oCt3otPs5H1wmTLrU": 0,
      "q6zTTS8j6AIgSxvVmYnO_dzCtXUGO-xwdsH35tqxgf0": 0,
      "m5ok4lpNZVoBDodod8TCNK4HbihJ35TyqC38bzW7cNg": 0,
      "3499eb9pctaf_Q8AHnJ_NX4QwNOCps4zWUlfqzVJkDs": 0,
      "wzfGKlTepv_109DovbzGQiZrtMV1aI697YShM3xumPo": 0,
      "qRT5ziIu2hgY_69s9PWP8iDuEdR49e7kyMGrF40FTGo": 0,
      "dyMS53ZFbOSP6aur3eVA8xUuM7SaWFmUi2xAYWIf918": 0,
      "jAZI7pRl9ysBISAu9dQN5BL4m0dhhdbUmu0ZvWfyG7I": 10,
      "oXPkFpvvpI0EDdbBUVz1sOEf8LAcx7pZqTduB70jEvo": 2,
      "_dm7AWAWq0IO53xPM0itb235C7zWJIYWN_ElCOe0joQ": 10,
      "mDhjhx6nZhq1HGq3jznatbSC7f5s8mWu3U1Fr2bhUvk": 0,
      "1y8XMA3Ha7dsUNGkAlKSV99yJQH6YolhBiMyd95Pb7w": 10,
      "eYX52kjrYDJmC4DmaSy5qvJrigfYxfvgOkRl9HdCy9E": 10,
      "pZQTdeBR3VtUcumYH4p_DqOMBlGhXf4UwihveZRmXWc": 0,
      "lY8IZfHd7d2_U4xR8lYvdFaXrLjdnEPNsKlRJow7I2A": 10,
      "1PX-M717bVGuTYIo7fNAVg4cyvh_YAb3wq87nHRV2-M": 0,
      "591l7WvIdG3r9P64JQ6x9d40Txt0pnZzX5PQnkLO3uI": 0,
      "FgXkU2Y-14a4xWMynSN6Mlr_yBa7TuqgDFi5N2vs2l8": 10,
      "FPCAF_z-haXJGI6D6Ilfuuy7lL_sn02hufIGf79vwdc": 0,
      "EeY3mAUJ8zjhSHYyTMzvzXqKj5hafOoFMy7Kja1cgaA": 0,
      "svaO3zKDklMxwHZl2lgyMQmLoLl1YOu_AXel9vtT_8g": 0,
      "rONwloU0z1aErEOAr2NwT5M-zgVO3bqMEz3xLpMmG5o": 0,
      "rWbWEa2JsBbsoVTZ7T94B82q7Dyy9p2qSqf1KKlUEY0": 0,
      "YfU6bENBKdB36IIxzeQHL4_kvY7yqOJHZuLasWB5xNM": 10,
      "CcXvb-Geolnopz6S2hL9tgBkkR53Mat-2uGKqakJXCg": 10,
      "8PzyUnjsaFSFSsoJzJlv43O6tEXm4wl-8wQB4y8zhdQ": 10,
      "2rR2RBCHIY1W2xrneXtd_v-UPhZw0YI9GAqvmxpNhj0": 10,
      "YK6k3eQiew56FD_u0h0ItW-jQJuTBtpZggXR0bm9FTU": 10,
      "OAOv0JXxb-GGcLav61xlwxKs4Ns3mTgQEl1mjIOJe-k": 10,
      "B4wp3fgphzTvqhH9ohvYThMMjywB_EtreDR6NLZLv_U": 10,
      "h-CB1FWRyLH_tlrgQM0BuO6Klv0q5a7A4SKEQ2idSFI": 0,
      "j_eOHp5yoSnLsCDE9pp8UtW9PMy6KJphIAHll6RTmik": 27,
      "DXAEJk1meAfcLiEysbVNChhlluzcfocLc3LPZHdbrNw": 0,
      "lItt4HYZc3HWgqp0fXnDkrCC27v5kz2TaMv2K8oK3M8": 0,
      "BxtVjsM0KKI2ZnvuGy9SrD_JL-RuEVXgff0VbNhL3gI": 10,
      "8boFkR4PQS8P5gruSaNumVmAf0KCkSV-7Hjv98b8iME": 0,
      "eDlEbgikKKJfpIgFHw44CPjKeplaPO1-zfgNOjMDXv0": 10,
      "ps8Fim_pjjtT8uIbC7nh2Ze5b6jtLnQ9o6JLuUXSaxs": 10,
      "5Il8w9sXtt_lkKcLxbhXSkMITbHdNZYZbvQ4T3uINS8": 10,
      "GLsPIavx39_HF40bBpsUyGt4XPZrPvQ_kyA5R3v-w2E": 10,
      "oHBVYH6vfUlb7psFXExTEwLtbdDDJPNkeEq-BYjwDFY": 0,
      "wjCHA8UTFqrIJj6SDMm-lEi4qMUmJNWYXudujn9ch34": 10,
      "NrjTXBBE-lNd8XrncAuvBUd_acx-mhQwVaCnSgARcFY": 10,
      "tVQM9oxSvTUOHhmnKzSCbO7kM5k7IIRYhWs_IKQ_qWc": 0,
      "iotCSNLFhYzzIpQa_T8Q48dUet5aa2oF11DQyoq3iBQ": 0,
      "OtuolDrGTkIAFQtik6LJdnE9i2jze4Ouo7dcWIAJnMM": 10,
      "hH4nyrN_GnqlxSqY_oM6l2oQcVT3a3xCF8x9ma5g8FM": 10,
      "N_h5yawP_9FJr_8-ZhkLbEIzlEJV2s07oLW5FsfxFM4": 10,
      "7FfhyW1A1IY8zNFPss26xryIEO33D83CQ7my4osMbwE": 0,
      "4K_xbLJLgxpM72cpMCyIzG9g5tjgBPwT9iIdcakQzuc": 10,
      "SebzbpTLQFcPIS-0mnsYfRaiBE16s1pk-278PPJmNvA": 10,
      "655NYSTuPvyCxmIvNEDJyHBLjZ7cBL1SbZcxQmycnRk": 0,
      "ZmQLIzqvCnI9SKzXdKrocVrMxV5oebMCIaJDvOKJweE": 0,
      "M2Anfvx6LsjUY_n0463pk3uZWCJfcYE3_bQEsZ8u2Og": 10,
      "HDIazQc3S4lNAnT4yDvX2x1DisSszhv2TsGQsuFcjBE": 10,
      "LJvl-6KAaJH-GWcubba6GR4MuVHiTN9XKBFNKfoMDlE": 10,
      "yOSP0DtUTEzzMkBCdB3Ce9wdXGEhaX32mnuOsjdmWJc": 0,
      "GVdZlJtpnDKC-FBXp8ivXBUfp3e0aEacXOnazFDnOQo": 10,
      "Arb7rcR8dp5qUsuOzuRFeCcNC4ix4cD3407k6V5hUdY": 10,
      "T4yRC4ihDVwEhqjEe_rQqRz0RHDmdYkNfT_MnGYU_ac": 10,
      "LWENaXmlBmw6hz7RBtustmrFEcca870ebzQLTMKUt9U": 10,
      "ZI1v4WOBLjQn45-Vfzd0QagKGxZx4zYFqslcMMfrjeU": 10,
      "F9UPnFmTQtp2DfrvzX8B-Guy8d0j895SMhgAmUhF_SU": 10,
      "WGoM429Hd1eMCTggzLky0AfCKV1X8-y0y2nU9cSKuvw": 0,
      "ecNhkRF9BpmNUkUneJK-E4UDJCwAiZoUfEcikhqnyS4": 0,
      "jFcV0TSNI-juMjbOVCzx4bKUVNSBf8i2o2yZrAqsa04": 0,
      "yeeKB6Q3NiFBkZDYtSkU121--qn-5kp5-bTqG5qCsjg": 0,
      "vOgQ_Tecwt1nFKwewzqqOVEP_Tgfs41ajcuCAmGhqHU": 10,
      "DEvBNBWaBWRDQrg44apYR4VzBBI5wttfAerjf4rDpKQ": 0,
      "7MBrdw4HLePmkY9RSB1AgIB2Rb0ppEI71zXH751ZoFA": 10,
      "jM4j6WBtA_Hyy-5HugZwGbWZcGm7-v9hrVQd3rBOYjE": 0,
      "45thZUNj1vR8t28W_4QwdPIjCkmMdXl2NWGPh_XXTZA": 10,
      "x8tzb7Hx2iIeADtCm_-7glMkdvRj7Fk9aI442-GHJrA": 0,
      "yClfP398NhExu-H4v6ehod62azSQZSn26x8eu083INs": 10,
      "0Xpund2sSCVY3aYtPkYsSnkkoSOVJKzNlHh_nIxsbJ0": 0,
      "_L76uD8itfF4m6ia2IwQG_VY85Z7wTOHvVEu13cEUNQ": 0,
      "1XunFT1d7YBpy_RWnz_PPVs3Hl19Sb_KXq2KufMX8gg": 0,
      "qaodjOh843cMpExDcUJQQjW1wxKf422plyQWi6okJzI": 0,
      "XA5RFT__ZzyN7KpgYzZ7eSX9-NqPfdt1BEb98IIcqWw": 0,
      "JOEK02YqD7pXZkGG7E15wd3oNupq0l1a4NRAJ5mM4Fs": 10,
      "jjf1FYjHS0uDROkrQlCXyycCf0Fhr5F3y2F1toFeeek": 0,
      "zemxSO_oBAwrvXhH_rUQhgTn25c42tvxuCvEPQtGHVY": 0,
      "CirqBk6kjjgYWBPsd1piypv4GWGc2nCgjY2k61tTK4Q": 10,
      "T48iVPH16M6mKn8aKq2cssXAQwx30XM5CvVKd58ryXg": 10,
      "FhvJzY32UmECfTHGfM4SW6hEHuqkJBXwGEFHMXAsXjI": 0,
      "GeST709DXCsi2gjY6LUPwE8xAR_2gp3d6KYgAhHRhZ8": 10,
      "nYi-jT_U0itt9K5NPw-6853xJW0wgntNojzD4ggmfoY": 10,
      "EapGJjjyN9QXNC4aRh5KUOcldykHPvHDNduW8Ssn5q8": 0,
      "o_gEYqG-fhasdXF0B7PXgqRHrrk9jTzmTcH241nuIYw": 10,
      "bxJJjQcvflmAGImqZ-VJpPMBFJbIPjdSQBMnUdedhmk": 10,
      "XO5xbWG81cshel7rOvKnu5HYeeOC_FDUQ7znqX7vr-4": 0,
      "3c8fnpqaIL75Xrtq7Yu-TH6aZSbtzDzFfwFubJC3FM4": 0,
      "I6ZNItQarkdnLz4GJ3mX4bUSrjZsZsZgyiz9OKU7bMo": 0,
      "bnSMzVaaYTMCr934ZpViZT-wSRFJzgaBPfDVPTNzrdI": 10,
      "3azduCeW7_Bm_y2lqOFgftLlJbgFmjBvtS28RykLvyI": 10,
      "3jL4vWuuYvsZXsReTpNqQHKteW5aOrX8acsr9vdn-ww": 10,
      "EmnOWqxHcc-g9LJrgkatN8KfDLHazVxpkc0Oh5pZBCw": 10,
      "IaDzm55IKfiz59Mw-NpEjXQfACG0Lh--3IVzR8c-b08": 10,
      "kFrtsYg90LJiZJjmiK2ogvi2yfOGd8WtL077pdurLLI": 0,
      "nfAMYpT1E4FIUmMi3MMxShFnX395NRbF4h0ZqnF0MW8": 0,
      "uhWIG5tilTuJrN-Lm5XnCk4Toaf8hp29uAqFWY18M2M": 0,
      "WEQeaCgO2v_XvodR-RtQDhx8-I1WEgLpr6L22eWlMFs": 0,
      "w_TthahNZ2PUovzy72y-7EAa_uRZc9D7MiBWyyeerWY": 0,
      "pK20WMcnwmdL9jen2YccyTxp_oytHN-28U0LjsWbA60": 398,
      "pIC8upx2gmOEOwmuME9Jzo3IfpHeUbTjWATZFleZAME": 10,
      "zme07mvKvDBK51qe7cT0OKNOoLogb6lIn1p_hojPePc": 0,
      "IOK7KVAhKbrzV8PA4L9_uI2AIyD4q6-tQW7RzTjWPYk": 10,
      "pzTSBpd4_OC311knZOYUgqw44LS73IBl-fEh5hMhYCc": 0,
      "zfFIqnaV6SzJPhzgFqnXv_B93_VFFJmYh5VqmF6nwaM": 10,
      "vnfZUpYAcqy2TNFEJ2uAZP7I_kmhGRkjbWXqN6fexCc": 0,
      "DAr9QhK8Lav5w3xtZQiMDETCSKJ8mDJCK2XIwqmF_cw": 10,
      "MNkRjfoTP2L_kH6fBaR6csxvJSUUuAswvFR95AZTECo": 0,
      "GVpLNfIWOxODJfCRN5_Dill6m0G9QZ233xCnu9GWUic": 10,
      "UOyTj1-DfVya-2Fat4kiu5o1Fb58Y4I9r2YoAQr4CuM": 0,
      "gHGfusL0zoFLG0bzm0WbOKVd6T3DxLawxwRzoZhbLak": 15,
      "bS4-EzSHgXla28Vr9WFGNlxE0hSXduSvuZaVqZ1McQ4": 0,
      "XUfgxkBcD6lmPbxJdSrOKduoilsbDbfpSN2Pn0a9Gsc": 0,
      "yahqBjhE203tPqn6lopkNX_zdK--vX7ZsfD_8i01HPY": 0,
      "BIvAJ8tI5_-JM0tUo8ZPbeUiGys_FGx2Our6QpNLim4": 1,
      "YDn_L_P_PF7nckOpjNLJ2BCiu_feYRi_pColrywn4q8": 10,
      "RvoQqAR7V91sxRXKOP5pqiI9IVwOQagzn5rXmibXIPs": 0,
      "QLteTkwybUcb-AwSaOjVry5N9qO65WjeS-4BN9h3Lgc": 0,
      "fMQmBGWrWxG5QRCO6mr0eYYR1dkJA4G6kLoa29Ff05Q": 0,
      "ppuK6Sc8rHCYSGlz4LesJhI0ZNV160DWFdNSCGIBWlk": 10,
      "nlC4yKb7I4VQCjTyKzX6gcX4yR340xTdSsHl-wgfvAM": 0,
      "GJq1gD4cuAJ917cpQ4YzXWQ8qgOhdF1xczpvcPDh5OQ": 0,
      "8ZoiOl98qlW2v6PKsUBR1Pn2TmOEpnn-dLBWfbis6SI": 10,
      "xJktMouALabZubDq9qIXVFWdj3B8evOAEzCF-p4Z0QI": 10,
      "YcoOyVjfAmuy-ekQnDE9K_JHqR6jCS_otejCz3Eq03g": 0,
      "wZdKTJzcCpIAKkSUnN-V9v2rIgcQNtwPTszKLum3d9U": 0,
      "HpTzUGMvqnDrLIfptbs1DIhSJzDKYsoPu4EZVxFxbdk": 10,
      "fCwQhYdNLIwK8-FrMMpFbwiNVHhWTTlZtHfm1D1dkGc": 10,
      "Wdeh4dBZFWvt5s1xUKcmqj6Um5DnvzCmL8YW8E2xdEs": 0,
      "BjMXD2kmty0c3TowOSG074b3WK3ObclsG7rD9Po3uhw": 0,
      "75jZiXdGgD-UBdf6sa2K6O2KxmfJ2BEhDmxTYGiqjes": 10,
      "T2fiv88aLobwlan_M90noJ8Q_wNpx7lnzG3AmITW_PI": 0,
      "z-7KGMKvfznpvi1bU9HH4s3g3AhQKR2imrWRRETYpS8": 10,
      "gGx5Y55aTH9nxyatj3L0K0vpq6IZoYyUc1jeO9VBjSA": 0,
      "a7PPLEeCkwcvORwfoytYgAM2QA88j3yvG3TKgKdpUIE": 0,
      "_Y0Ds6J29dyDbx5Vq9L0aaMN2L7KrmziH9_bxESej-A": 0,
      "rXbJLRUTMhMOwamudnLq6uo_d3QnZ3BZJ1oxZqC32Ck": 0,
      "7k0WOrO7ztSbxkO1cv1Bzz0JZ8QIvf5aPw621NgRV4k": 10,
      "KaHrMQ_dumC_vtwvO-fAWmwAwrKuq1RIW81zI3RHnWA": 10,
      "6F5q8IaJh3oMWLN_kN8hItIt7xwBB_AMtPySkmFD49c": 0,
      "mx3g9e4sh6xiefuveZ3Zmgu69CQ_vMT5MNo7a345CjY": 10,
      "pnXRm34N25WfMWTWpoGh2j_Bc4wfsy46WnJF6vZmc3E": 0,
      "2SfTq-9T6Jp11uhR2w6zjuMb3Qkr-qnTvfYIrBqT3k0": 0,
      "_JIA20ovDi_b5Qw-CFYsGAQ4x2tbd7aCJ-8s__AkWjM": 0,
      "7NGDT9D0QXkDtlIEd4h6dJz1BN5LtPLMdIPgrlfO2o8": 0,
      "eRgkL39QkKZ9luqpIJkTocosOaUDPIVAcOigMDXIc_Y": 0,
      "wqgkF_v8XxG9JsjrXmUqchDPTApvu-Z4BXGAFzkWeu8": 0,
      "q7QwSA6A-kkZesceTWx6h9xjmPt10t82OuGGdY0t39E": 0,
      "tMtZR111ZpYLn4kLuJc299LtUB_BTXW1UmE9Tkmo1VA": 0,
      "wp5xXVYSOX-mf8kUcuTN62L9GLAC6-iQZP1nfurY7bE": 0,
      "U0rf_EjAB59RdDEuWiGAvJlFnZ9F7kHkizTbRARg_Ao": 0,
      "k12-M2l5gLduJrkmUqW00L981zPtEVF1LVpOm9JZkaI": 10,
      "X-lAnXgIeiDMp_6sodtPJhIgfSiUyemC96CTjaPSN_I": 10,
      "T9l6orQjQyX8JM16bMuu7ngIEAs9ODQuciWeauTxK9A": 0,
      "SLhWrzK42CtIZTtxGfXEYFq3kuFw-5bAN9bvLM3U1so": 10,
      "9EbGrKp8vM4YRlUiV49RwsVTkgDOdNPahfLGsZrlqMI": 0,
      "oUq5FndgntPVrY5Qv9nDG4SnrIFFwag_g4dTp4boO7w": 0,
      "mX9fO8toaTA-Y2QM4Tf4MPplzZp7y9I43jrsPyOBI38": 10,
      "WkaxJesdvEa91t9bM0TfsygOLjRtYozKY79Lfw_AyM8": 0,
      "noheldkjXhBrlAywjStZpFU7QdEatBeGerqENDTr4eU": 10,
      "zDRsTTtp4S6kUni2wj4J7PJqaOuwGMScqFsOxKj9xcE": 0,
      "aXL-RfGbNb_buAoo-IgSk5y3IFch4DYqJOW8xIefbFQ": 0,
      "lPpwyP_QBKNYNk3K-LtIAfjAC5du0C8XvytcETdqXZo": 0,
      "MddcuLTPTvrNbYjxj_jO2dKmD-fqSoMXxhXs9EMHH-8": 0,
      "1FU66S5z0Qs_jf4M51wHuS-vnt9Gry98xZbmeSULJqs": 0,
      "dAzUaqP9wYE_E2kDRQDn6RkDVx8OPBMfVr_Z3OsNkyo": 10,
      "TyP5Y4KY-1ALlEawiQTxQjGCAvdvUJ5OtjkfSh-5cvw": 10,
      "WAHn6XmZdztPnQYeGyQOIkm3fCBaHS6mtqf0ISFuEmc": 0,
      "ic9MdJACUJAJ7xBzh_TMPbncnYIazD5kdXqt3zy6NLY": 10,
      "vn7ByjrZDnIz7pAQZUmq5pCfQE7RJK3paDjTOKgXZkk": 10,
      "poFKsMD3CdVBRF4VJcJb2UQ15mV169P52m1oVyykIS4": 0,
      "VSQIXTOsYxqCX2NZ3ju8aTUJ0J57mvlPQ3O1Iruc43c": 0,
      "LyYZGauNTTTt3BRIvgLrKAep_AQPvw4Bd3u_Kf6CXbs": 0,
      "nLf9AsK1Fqj38H5bfbb8VsOKXFtrX30a2uHHROugvSI": 10,
      "o6-tSM4MEJnsDxl2aTyHg2B1vh2pEK5dR1v2XxGaAeg": 10,
      "kARU9d28uKvIljsmYQVjmHfMuWlJGEsU7TJ1A_GmAsg": 0,
      "vynGavNXGxnGf7IixUMXSa_VcD_2KKTFrcYc2MuzG40": 10,
      "naGeJI8cNSGsVLs2SaE_GeoUpGQY3R3xaHEuPF2CQ2g": 10,
      "yP-j6597Y1QWW0HVlnHr3hUVHZbfhD55M1P84az8fp0": 10,
      "lRgnha_pz7G3QuZZXHF258UPO4sZ4PaN2AvmLpHqH9Y": 10,
      "MUvN_OGVeSZT-7iKIQBVHyTn2w5xgbWg6wbiDo-MP5s": 10,
      "QuiV-r4qrhiXpYN6czb01056eE97twgDTdcsr1SNU2I": 0,
      "9ZUIzBqFEjh_vFFITqeox53WXs--hwKdUTTm-jRfkW0": 0,
      "ys8KuCmK8ktJbn5An5CNLa1xEo6KMxt-5Xj9XZqL4-M": 10,
      "_0EjoVAmmKZ4gumbE192-oIdb52lOmr0Tb1UMT8h9Ms": 697,
      "rBRnxvHk4dXyC1juI392HpbjxKOqb8M6gvS1qJVelf4": 0,
      "Czbo8rIpy1lbSXeX9EOqVq8Xfwx1SmYan29fzF6OzsA": 0,
      "l3LhJAKHaPSABm4GTVcg07crqnZDOACnT6o8NWVmA7M": 10,
      "OBk0im6xQkTjhDVKcrI2_9ax7Na_aiZkWrqJeimYJJc": 10,
      "ATP9B9hAtoxPt9mVOrvrlMi1Na30485zA-JR6375yAI": 10,
      "lVyB5aCziuRZugj-hxMF7CR_t3tuSymlqKtF2T0wqhg": 10,
      "4hoDfUCJZZ1lvVDEc5lyKYy3qFn6YTzGRSX2CMCfXrM": 10,
      "MiExORB9ceH6AOReHL_ixyD90BSJddpj-RPwlZmAiUY": 0,
      "t4EaZurbhXMZngTPNez88tXyuStURNOgb7FN_crcAOE": 0,
      "6NhwFI2PwjrrUve4qswb4AbFn-V5EqfGQiKqM4dH66k": 20,
      "JuWHKTZKh7W9CeEFe98MOBBbwTNkGB-xz8eEXAX93eg": 0,
      "dkmgOYTzRoYP8tPLffmEkcfjrOpho5oa8bFOTywgBbc": 0,
      "1tKaiVxgBRm-r52x50AUON6-_iukdO1C2k1dQh8wt3o": 0,
      "Jyhkp7ty0eJ_mNgURLX7fMiCj-JR8gLWIR0XWWXZIoQ": 10,
      "zN5orOeF92Ru0n6s6iITg4EnIlGXa8jjwS3elScH4vI": 0,
      "aPNTAkPyWXKfZxNkgN3N6GFuZaAofYV9HcaPQ3w73z0": 0,
      "Y1cl76Vn5bBT1sud1Nqf2tv0wP88UFtzoxrBGoPajag": 10,
      "tjKiYnjqiidd1ngaGP3riM3jakuYebphG-pC6CHsCRM": 0,
      "-8X2AkQSkWpOTio9pc4HukIKyGufe6Qt9Bgex4k27qc": 10,
      "E1z0rYNz4BFYLa1tKMKd93jhHfvFGEm9jNBsANp0Jdk": 0,
      "fMjqw-DAptR9PUdx3X_fZxEMzJSOvIQFKuJSMDbYTlw": 0,
      "Q0U6zqhmg5Y9r9IuPNupRvBMZkA80C2WubEB64i7_f4": 10,
      "sZ08TvWdLWp53t0uyq6dPz4qT7hEixM5Rd16bS0KNGE": 10,
      "o28TIRudr2x6J1RBz17g2YF29V7rfnOgbocM1CFyUyk": 10,
      "ojj8FyD9c__X_0dT49crwG4w2mJv1hNepVKOUU0X_Zg": 0,
      "N4Ew212QqBGZA5E1lKR4HSzmKTgRuA2aOIgt4co9tyM": 0,
      "hfJ7jpMmTioHmaJrAOU_Gno1UAKxrDvekE18F1Qve34": 0,
      "ImuzvGM2q_vMViFvW2gjPnycBbUmHeeNOf277v_jQHw": 0,
      "0Bac_XYN_m3-p18WFGC7KL-ny6ATa763cWIfYnWllAE": 10,
      "2rgQYh1AZyvxeGLvMYUwIIn2j8xc9gsGQa90xEzGLC0": 10,
      "5S8fMwP0pjgz9Tjsng9TQVgMrRr5_2ME0B-qjEPTjjc": 10,
      "4P8cZMkKYteLNOKFtxXrzuNimSxEgaMvpagr9INr_cI": 0,
      "8dcV78ZRtYuOmbQiMGMuHYvFKXdHVdMDaRvrzOLaxgY": 0,
      "kpLzKNYl-0dp-4pxoDNUurK7S650M799SfUESIJ5isc": 10,
      "aWs-3_mLwYYK96vSW-W7ohpRK4lu70KxMCM4lqWPB8o": 0,
      "W7wcQBPwtr9KoYZTTV9P658fSf1s3dvtOvS3Oz5x0LM": 0,
      "IcUTUm6fajArEIRQbFXRknrGMtWQFSiQBLykcCQ0T9s": 0,
      "Aals8XxnmzVDjQSYcl9SFBB7i71TLmrg7t83YLiXSX4": 0,
      "k-KViRIuSjVMKZtMRE-nzInw7JzIZa8AX8yKZPy9gQE": 10,
      "rEaeWpS6jeRlc3WXmgLY-xYj88-pdL84ukvHzPwi7_s": 0,
      "GGHRcTxwSqwQpDo8RX6YgjQBgxbmH8VfQH1uwWExH_k": 0,
      "_O2ySLuMyz_V4DfXMFQCOdx5lCvXkZCLUcTkYcVO2x8": 10,
      "iHQEBgVEgng0AUQDUbBdD5MchLzx3S3vDagS9kRcit8": 10,
      "eH1XDgLCRN2B75bopQKJf7ZMAhGZ94j-Aao-HGMi6ZI": 10,
      "Hmmm7zyN8TsYEImWV5I_zqGd0i85v4g1d3jkw4pnxBM": 10,
      "HiEhALPcrUyoUr7HSYqSnyYiLZRwA7XSuc5QVKrZ0TM": 10,
      "jZ6NROFGUbiZzokcS-NCW0wJvesGKATA6dAQfBED5bk": 10,
      "OJ14HKqYchHdQ-UBRE4tUmPerxxPFKOtORxJ1inNR-A": 10,
      "O8hdWebGXtkGEmijUnH1Xo-Fs1MGes3lr33JK8t6jsw": 10,
      "cv-I7mTYfPDKayoiWiD57NyhdrT6BM0Na-7-mWhImlc": 10,
      "g-NoLGJSDngZpSMwD0n_h0CXJ3H4x_ViCAUwYpo2E9Q": 0,
      "LY59TTkzdDRcw9toslA-YX78G9F6jhOYGegWFTEdf_I": 10,
      "ddqsL0jQNIIyZinYRch_5300X48R_tQobHxQIUFZ3Uc": 0,
      "6IPYdN_WrhN3dqLMoCEPJeIxOEHqoXr_dXFoNufx5v0": 10,
      "MY_qixJGKFgkAjPavamktO1fu4yd4OBmb1Aqn1OGXrU": 10,
      "k0GmKfbD9CTwiitDzZS5yQoA1rRdF6IvFb2ooGzy5NQ": 0,
      "eCsQGbU7ELcwnPeitoV154taeEtcy8k6eFHAiVNk-k4": 0,
      "CR4Qe5joXiVE45aRcFZvEr3saPJfRTJdiGtNMFYvAO4": 0,
      "G6J9kt3Dw1qU4pLcLPmQiZf7eY1tbz7IyiBJJFKyOM8": 0,
      "iNon1_QVoGTd2efXuHPlmg4cja28eKsVGM-XGxstTdg": 0,
      "-t0qKxa1WIwSKhDFnl8aC8x0Ugic8C6GwWPexA8vKGA": 10,
      "bHKq-RxWmgNX_32IPy7YTre5wYRYICMtOUcb6b2hnQY": 10,
      "364qy4LuE8C2t0LbWsgLBu3R5NS56u2hL-HXxCrzJ6A": 10,
      "jzUVuV-HVPo3nadpOtLC0ObowZkvM3uvo6yF2icxo_0": 0,
      "uClp5pjFqWyHgcalRzdtLczYg4HzOCNUkJGBloB7O_w": 10,
      "1G83MMCE_O2XRX9f43PHgrg9zn4MxfGnTWp5BzPXT_c": 10,
      "GlBMCIQ-0bXRTNN4copNBw-Vk0_RTrOdbXHtgGBiJlE": 10,
      "vfIhs78uEPljeXMr9fzxKpvHhvYKaKWUMZ494khUsKs": 0,
      "vZY2XY1RD9HIfWi8ift-1_DnHLDadZMWrufSh-_rKF0": 10,
      "pK4O0Mredqn_uoZ2gA6Av1HdEPFrFCTsfIJGCuk3nuM": 10,
      "WnIO32XaOYwnu_DMIfwvcDlTBJZXBfdsrYssEJDPBNI": 10,
      "-1oxCijCDs79gyB5ikG617qZRikzBuP8oAZngaaOJnc": 10,
      "1GmRwqEe6gawYeJTAmUm69mO-enqyKtPrscZUmTsJLg": 10,
      "11Lc68fduvwzDBzZDIgn3mVT0CTqU5sfW1FXz_s-3kw": 10,
      "w4bPp3jADNZW1LyjN6PTQGcmJhSRTdfndteaJnBCIfM": 0,
      "4-qpyfGAYPoo-HA4vh5HbsWD2n6PUPXPD5IR48WTWyk": 10,
      "1h-5UQo2Bd3rBLt45FzqMryVqgyRHVIpsH56nzOXGU8": 10,
      "zxTu2Q9cBGL7UkuMqe5wjq4EUtYthylA1hgCQqy-WT8": 0,
      "PmEGrS_Q89RcU17Kng_5wLq-_hfAg2QJRDWgp0fvWtc": 0,
      "ryvUkD2-ZNaphJQ8s9sQj9bFVINxOkflwRTdIB_UX4M": 10,
      "46BSmlrkkK_kQ4S5gpvUfWag13vblq66HgbMgzBSDsk": 10,
      "cYEqkk9UyBB21md8TmIQuL9Y1rBsSV7ykMEV-kGaAV0": 10,
      "r3bzrDsJ5RkSgR-xa43J1a-jh2PEug5vlEzZPvJOrVg": 0,
      "VUCKAsKhRTT8IqhihMD5hf347K2zyAThmgDqmGLou9c": 0,
      "2Jpwy7lurgGQ8-C1O-4zsnD9B2D5Yg32oUWvhKX-YsU": 10,
      "hskISpFD5Br-_Q_vghS95iE11D80DycjeBBJDHiuIXw": 10,
      "F1JpGoOdy0E2av2dSTUI5RQ1Z0voPHHYxWx0ZNsT0Pg": 10,
      "1r-rWlVEzhWHtrgc3TZgnfPBFznXlDVsOVGxNEI_J3U": 0,
      "gfQkagqmjZWY2SI7b8ogdkVk12PVFyoWnpJ7n2KQt_E": 0,
      "3wWTiXBnzDSD2BqhPDPn9q9c6MN1GiUkwBm0mYsk7oU": 0,
      "neOUm3_xk_47KyVhtqYDrCVE4tjq_EJ1PNOlxJsIhIo": 0,
      "j0wKS0lnBcDs0jqcUU4Z8LpN2xxj9oPF72qjUTT-CQo": 0,
      "8sH62Sq16__QdqFkgFCC37CQonewA5fjuClWm0NuV5c": 10,
      "GmiU9kIYg6fAavI448o3vH0OHHECKlz6M9zhUmFaEq0": 10,
      "C8X175nETpigb8xx5YKFoqqGz1LOs9NvfozKtCrh7Vc": 10,
      "5p6ih4C3df8EB_h5NthX1yA91kWwVShuhV5AO_67zG0": 10,
      "C-QtX8m9AnO-pGaHMsPgt8S93XZ6oIQh1jcsfoZ9hxk": 0,
      "5o3Tm1xjPcBkgtfIJfEdSWn_II57zansqYFIkiktJqc": 10,
      "z_oLJVydsq27IgMzF8f19TTMk--TyJOU_iyExfrGhuc": 10,
      "SAz1WR6R2nNYL79WJmce0mDUdXCWbL8XYBDYWcZGEHI": 0,
      "IR0SnrLgDzky4o7OZplf5aWBybNEcyje2rsC0rtV5Rs": 0,
      "BKHqu9qhIzG1Zh0IP-grUiDWRhHKwL358dR3GTp2KWQ": 20,
      "L-4henqk7Dnw49JJsms4njIhmLAyoI_cPKp0_86b89g": 0,
      "wyD_4ROGZ3_hKoSMQQIBRzW2VUynevSBvx3NjymtOr0": 0,
      "NNkEUb4Wf17TViBSqZOMnd3uehGhqCjvhEBzIrAYDVE": 0,
      "YUc63_1vauXwRHETyuOxIjyYuxxdH7uaTeyKVEWpnfY": 0,
      "2RZ7fctTagjbOkA6rvhllcRquJ3DcZRmNnCATzjxsyY": 10,
      "nlCFAvWnfpZTTkfZkQ35E4u4JjWjyr_WCTaOxDgwSLc": 10,
      "nToMtk_IDJu711tGjYGiWuQn7IN9Iyi2alaIS3gfTBc": 10,
      "J7xCvskp6LGR2aEuBfP-rqUWG09bHsyYmVajuVWtd8Y": 0,
      "-QficS-sXhSezAoH68Js-aEeh2Li7QYBoFRwq_ZOATw": 0,
      "U8-pMQRAYgB-vUh0srT1JySYvU7Be2ekbWT1DiPrllU": 10,
      "2QIjzqd7pqmZRHeHon963xuPoz2AeiTo78lbffWyIB8": 0,
      "1FjgDzXyTfz2MiVKRqVHOZ6RegnuFPVFZKuk8eprTfU": 0,
      "O6daw9nAIYIul0IkxwU0EUTh2YUwRY2OyY9LFwg3TQI": 10,
      "_0wj8z0G_q09u8oE2dssYQEc3J5hmSn6AZD1grQ34uQ": 10,
      "-taZqpehx42R-bz2ZTifU1dOJP-TZ-NN_zc4efC85DY": 0,
      "h-9PsZdmi94TZyfTIV9Y8OJ0NqGRSHLOUfOYAG6sDeY": 0,
      "fpJpTEDmFesVHh8TEcqXhBtiYnyql78L24oZbRhMbw8": 10,
      "hZLLv-OtN2MbK4xKtVINHAWO2z0wWGhq_aoZhJh6RR0": 10,
      "lGXE5MOhePMs2gHPLVmLNHVH_3DF_o2XiJoe_BEL2ok": 0,
      "QwBlpsQLb7uD9W6Ffe86gvz6H9GeHVFtVuJlqvpTAsU": 0,
      "0d8ldtms7ish3Q4klkhvS_Cgwcbh-KbOlaG4yTAOyrc": 10,
      "V2O6a0E8X2d47cLaDLtlUV4TFQ1yGkx3sQ7nqEYnDRE": 0,
      "beHrcoVPG2bCNYwxby2E60fs3701OnqbBk9CWOJhNcc": 10,
      "LVbfky1r-mcv2J31u-Y7u69Zx6yoFs1P_uDF40TWZ1Q": 10,
      "Dj1BdCumzbvnHvBKN7Etvtk4IwTwKVwoEzt1DKA9ZYo": 10,
      "Ndfdu1gaGw68F5ZRtEbenzVnDfCdsLX44GTT1NAxkjA": 10,
      "so1RTKIUWiFurG6h1-yCeJHk2hAiXX_Bdhm7iB75AP8": 10,
      "vRgtIi-e6faCPaVybOpm9KrrJIUkmaNi9fqAnrRpFOE": 10,
      "X4T-2TvuNB3n8P68prAmmuCu5IqfR9BvgS7pqOe_yBw": 10,
      "DSIOXmWFVJvVkHum5T4aFOUrBSUgKjYEtIpGbMTF7sI": 0,
      "uqodXXwAmxE4VLjZtGJJFCPyzzR1TC-dAp8pJwDU9tM": 10,
      "euM0doKJwDlSkHbkeejH1oFgCD7jK5FMu8aqAbEDQyE": 0,
      "OD0MOAIq-P6LDb5TklwSmIBATpR11TWsHjYdX9D3Ykw": 10,
      "pLNTY7xfXj9d5M0OaFVi0Qmhx5_azCfZwlTdULETi-E": 0,
      "E_ToLjIWmBm5kn1g4k_OWxAQvecHMHZ75XU8yQ98XcY": 10,
      "UJFc7caCh_Lw0gjkSs-zjaEhbtzRB8vj6IAfEpUYk5c": 0,
      "OPenBCNfg7Hv4DqGT6T6k8V2nuvxtC6xirJE4JTUhnY": 0,
      "4b7IeOxLWY0iGFHe_Ia13rdxGxzBFRTvVz0Icyn5Rwc": 0,
      "KTAt0Td5w4_jaKG7VOJgqnh59zlh1wBblK9UNWPmAqg": 0,
      "JZAiNUMtddATUMQfJeQrqZejxvHPN_Ckyyu_5a0mUho": 0,
      "Ydu1ttrM0Vjw3Ht0BegkzwQnviOJ6Sim-XnJz0J2glQ": 0,
      "9mMfhElLGPUFZIi3vHhawFl0GC3Q8NFcCjJiSfsUboA": 0,
      "cVXnvleYJ0hpUuIY_T1HVtooL-7VH-CmZsriVooBW-8": 0,
      "nu7Ztg3bkUyl88ahMn_z_IaZt_M8Kl0L0YM9EuP4On4": 10,
      "EU9RBS0RXCEqvO4QhsqV5MxU9PdklaRSDSbpNhw04Ss": 0,
      "kriHA8TXb9HfwEbX4exuKD3qT9-oo5FkV6MCyUUL2XE": 0,
      "0BpuDWPHc3sG47InQr_EH3uWao-2TvMsOpXZu2qpz-s": 10,
      "KNEpsnTzjofJsdK9V3dW4hP-Ak-ai4MuuQC6AMH0Y28": 0,
      "49vNIt6sSozNMBBXuiX9pGAaHKAZYMcxQ5hVYZuszos": 0,
      "sKBG-V-OXXMgjDoN2ECrglwSAM3FReEeG0VX6I4PIHI": 10,
      "XxM7Kqj_1DAOE6Wrw1i9Leq7cmqz_VTzn02yRLlq0RI": 10,
      "TcUYG-uWhwCPaZkva0lmvKqUFajNiWu9fZ4_9VUmuEg": 0,
      "H1RgcwfxwCLrtmaQ5mIgHfdLTSd0fazgPE4j2Q-FgXw": 0,
      "akgms0wLg5msOcWrm1ouqGax8wY2nmDS4SqhbLgsd5I": 4,
      "mGnAA1MrB8FiUB8PrYOMf0rnv19_VXZ0lCiViIncQeQ": 10,
      "dChBaBshjyKbLy5pRpzzuKQ1uY26nYLyeXZfXyrOsKs": 10,
      "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0": 8,
      "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU": 21,
      "xBrb_MyAYvHSjwOYDPhVq09oHsEdmWvfSR9doyIlxGA": 10,
      "zIOPzMGh6ZUKPNmL4J33xudXJsf3H1V4ezvECryNkjE": 10,
      "Pj7FkPedA5AHOrH0TmjKsuNmOnWo1ULOdVjZmDJjW1c": 10,
      "ELIjcEn0Tf8CYyn8rI9HDsP7JJXscMz3paW98C3vmCQ": 10,
      "nxYfMV9Q3njSVzEJAej1koBgXrhaH_NVLIhI8Aa3Xn4": 10,
      "GBpcAicEQqvjpWkJMi_D2N-ywc114f1lutGVxAykXok": 10,
      "veoKgdYIaUg3jzn0M6M8ExY8P1O9hteCatukr0tJRdM": 3051,
      "_r-2mK0YP-yNoXbbmALn36v2F6hyqx4Gjo3ZP_FyMBg": 2,
      "EifM3ja73haUA7EUBVI3YeXL3JKyWAdjk5PDUX7KfPA": 2,
      "VOVgJ8yrpsYTHxI4ElnQfja49J_bT4urMufJPcfLvmg": 4,
      "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4": 26,
      "q3OBvb_qm3d8T5yhomKF8fA4WvOz8IT0xf26tRJIG_Y": 373,
      "T_kwtK6EIrmeljyknG_3AF3ubDk9pCz5YBzuI0Zc2Ng": 10,
      "t8i_MHAPl-mwDSthhyBAwGWGrI-_foX5SZV_h9f6Vrc": 1191,
      "ljvCPN31XCLPkBo9FUeB7vAK0VC6-eY52-CS-6Iho8U": 2,
      "vb5lNHhmEbFmkUUwHaLfQO2kN-P83lEuT0N-0am0qsU": 40,
      "vT90H6CshD4xHzIU9h6gUF3WsTOuj2a4cpn1v2CfvkQ": 2,
      "fcMxhaBLYpFEzS4eWqsazA27IVPh738Kh6d6VXSclcA": 0,
      "RnM2eNUqwDrLSxDcX2UY68jUKZhYoAOY8ysSeH7f7Gg": 31,
      "Nipmsoh9zoti7Wlo8W-gu98HYGd7fYncdf0f6rN9dcw": 25,
      "zI10s4yk1pNJdPjsPo4KW5B-rXe5QpakAIuHfWewWNg": 32,
      "VovTpJyt97jf0WuE0eb8SujuQJ-IWi4OntFshIv9PV0": 3,
      "v5dkRRBuneSHb4Vsj4R1YZuZscq6hAIuRuwOTFpgj1Y": 4,
      "G2p6qraLOEiTzAtFQedhyDt7u9ffUUSUoZmZqlacpRw": 65,
      "RFEthgeWKVZxm9rk3WJP2Ks-XtD2TiRy3lJ_pe0lhec": 1,
      "3CbmnFJnY3uwrT6EYh3GoJ0bo-fWfUh9hS6XNQAEavY": 5,
      "0lBteoBWds0D1DdLozpfSi2jZnRFszZhCT-G0tGC0hk": 125,
      "CAEiAf-C--9iwnOMiCdTFhOL0kdvl2MZ8mnq8vr_AHI": 1,
      "HcgkUjpfnnJQwAL0Jiqq8xCXxekOhswexBxTFtFYdGk": 66,
      "CnRgSw6LX5Au7TCVT6OhdWP8UwoQj4s9V8XL7S-vk-I": 5808,
      "-1IuvZ-IlmepBUW9t6zOlNmnGqyeeEleNJd0Ud1Zspk": 34,
      "Fa8_9e1DXzGfUw8ARR7ubzOv0IRPX1fDPhAC22Hld5w": 75,
      "6LL7EU-CIVLSIYajnFelAQi6Uefv4lqrZBcv9bNwxFI": 728,
      "h0zdcklfctYQoKqneI1mvwUfgLja5Ael-0X3ogxzbf4": 316,
      "j-Jvcg4_ZJ3BSANoJi-ixLWfxe3-nguaxNyg0lYy8P0": 385,
      "vPKUc5ASvvPeZOwvPeZE8pfcHhBYiUsipeLWCAyVySM": 40,
      "gZ-OtNiHxbMgPTWsGGwM-2_XUYYh7plY-7VtkUAyWiA": 25,
      "YNXE49gTG2O1gCf_mK6mVnF_eYiupsxvRo5kQWr-0do": 19,
      "J3vCwzjmVCuJKde03aI7XCRBsJ-rzSD16L1RelriAIg": 27,
      "UPaaKI547tre-lAG6wHWSGUl7aAcY1csuwPf8qh4tdE": 19,
      "jggbPy_tRIo8dh-HpJ5IhDgpPpCNLCzMluUuvwJxAAw": 24,
      "iVrcWoEtSf5jvI5Epvcjie6AjgINP-bOlWKPiLdGASQ": 24,
      "0cFGQBBSnX3x_gBTPY2wtv4pEqJnL-inGKKuXSMCU_Y": 75,
      "_DrdJK5PvQ5HMNSvXd9X00B4mmXKQGHMajHW4hOXcPI": 59,
      "beYR_NqN2BhTmWWPgWC4ycCgCVx_kwci0RV04-sWEO4": 19,
      "jvlgWOVeQwHZIimnswNQUe_CwKnodspFyY5HWc2M1jY": 49,
      "xc2qUMUaQ4kr9tfIhPpG9px-gOAxEvlbnQGCd07_2Ok": 57,
      "MA4TahOh7VeIRKUAC3AUAjUESMrALcjQFIrs5kzDOeU": 2,
      "G3fz8mZosMMnzzyEwWVWOZu1QmKP2tOIQ1N1n1f3Zl8": 3445,
      "knHIk-aF9g3Zrp4T9_MbsEMuxsOYqAzZCfoFNo-bb-c": 4,
      "O_s5uVr58wjOCeiruW8myKjITR7AAtpvGG6OgGDhE74": 5,
      "TYxSITl_fELpcA84ABDBWGxthk2iUPnu8hisIPS5w7M": 6,
      "FgqixQSdScWmFY4O3dvm04e-DGM0Z8bWyyW-pDmbyGk": 183,
      "mglUufXx6iyx4xRmzXyXJlgr_B6oBWCPhpTqXymDrvA": 8,
      "JC8gg7wPgo6MSztUDLbq9HeljEkDlxZv29nZmkkHoUQ": 1,
      "gwR5lpovcZisEBigWV-RDhULit9ddeIHvB8Ut_5XPg4": 6,
      "zDLSHQ_1t3J45NTbLQqsrrimpWrjRNxZxB3mU1VV3M4": 1,
      "O81Ukzu0bK-JrDVSpIqMTJHU3DWWz01VVO-oYchyzm4": 65,
      "r6YGVz6C6yXmSa1m4psXad27VrSpo0YH7qZT7Bia3_s": 1015,
      "_uUW8byVQWoSlR5JQeIz_vVcp4KvMByhDOi9I4OOAuc": 1,
      "-s-a7FOUEY-TevbM2_sHUvUf15JNHL__lTszDfDzexE": 4,
      "ygy-l7nWkGgI4gfO11dpvIiS7DX73kpZ7duoS1DaGBo": 0,
      "LRZnB5-GMxnSLkxJHRhGHrBmqaoJdoz_cg1Rlp8KWmM": 34,
      "q6VzoJWq6v1YQsKZLkPdpGZZSYMMMrFH1txNU-j7s2w": 4,
      "YU6yEKGM6aoKi_MSfJr7rdaGRQ4oq2ka5SOzOhjLW7g": 3203,
      "lCR68AIc5gdAgqwPXwTtuKFs9dotu0VbuXU5yygMmmc": 59,
      "Fb03DsghIkk5XqapsQpi2L5SWqCL5cDu8FFh2phyfyw": 14,
      "v6UdZMMY-DLKA20JstyiIRzBZnB2EIZIbJO9U68G20c": 1,
      "P8YliGC970DN8dHvLSF9LbReoEP6RBadB5wGtyiVpmA": 4,
      "5p0Y3DbfYadQ2hbmZkUfvVKfvPjvgZo80CwLZpGmEOU": 9,
      "jILNnkn6JkrY8_dJteAJJXXfyAWOpnI3khiQbTUIU6Y": 32,
      "StbRRR4oqT5aowRFJ3-w36DmxEMhN2nbq9JItkpmjxM": 30,
      "S7VhtJUUGLEu_To9d98ZhGPUL8V9jxkvQ_LKVbIZ6fU": 241,
      "UR4osFpwOpqmkHqpe9L09FFlE71Vo4TAbMX9YITcq8k": 14,
      "3eE37f0dua2ZO6M_4FZSfGeQZx7d9L1SCPZ9Tjztedw": 50,
      "T3DFdtapcu0uGbm4d9ChDd1h8xIHxlq8k3QT2nppbIA": 3,
      "9b_dvqZ1P2cQxAhfW7a7sQE7_jBBGTm4E5v9Am8_l5M": 8,
      "eECc1hPLwuAz-Xy-UNpELifAe2THa11rhw17ProI_Fg": 1,
      "yYnEWgaUwpbY13tfQgAtulnnrth2_L6CQgL3pUWoRbo": 2,
      "u_OuQWmjweVpjMeyRn69l_niO0UBPwXPrmBAst_wR94": 340,
      "LQPDkzlu69-eCA7YyxDHcDb9pyE5DQkNHhAQGwX25Dg": 1,
      "PsIuSug6kr48ABQFQB1a5CJXhSHzNk0dQUvln416X3k": 1,
      "dvE16402mxMLP7iopFpFLzcwd2NQ-ElQTGKZFjDqF8Y": 45,
      "u6UdVGR4V4b89LcWf_bAi2ptVlieTzKE6VTcGimwHNY": 3,
      "IgEpRZwPVFGVDmWm0rWI_m8o-KziHDHvDGMgXVs7CVw": 12,
      "EHlXmXvaYJNsJmeSys8zAPkE51ll9jmVUEp4mM-Thgg": 19,
      "lWmSCTyRJ7UjADArLAbQ_THha7hANwgdlpQEeX0Chq0": 1,
      "pDb4k_UmltgpGuF5NL_mc9qJYqnReIeEIYlPtjAIYuk": 195,
      "8f-dV1bpM639OvP7fM3b_tNyHENngXV-LeMkph7S0JA": 2000,
      "POPyLn_vLAGmGb6QP7AV_3lsC4swE2KUpl3Qvnqfd6Y": 11,
      "T0g7qHbDAFVxkKLldRhgZMru8_vwkXZhLqgObiLz5QI": 4,
      "8N7E7k4DLZPUpLMkYj4XAGWbp8vNhoVVRrNl6RQxjVE": 138,
      "9QhXEqYpEu8SohufskVEFZw4JaIFMdJJu0L8N8pwPOc": 191,
      "53_2tI_Jtss6XSeB5nWN7eCLW4N7Vm_TWLxmsoddoxc": 130,
      "kmtKTyd_S_eZO3gag2qAspIMtAopJ_wN6qQ5Np0HQVo": 39,
      "v8hxHzLnxRVtX9XGC4HY7zi6gJCU840P1cRwWwgM_jE": 3,
      "RBZWmzRNaYwr3_cd0849gxWbqze4QQ-BgTQXq3aI4ZU": 6546,
      "cAA7Tz6KlJll2EbO12gJ60BSlK4hDPIxdClfkklhYIM": 2,
      "yY5nWcCCwNwcaWo7lgIgZxgcGKvZrDfGYpN_bjefkYo": 0,
      "ONKKwJpzMgCXRWWAvepagSsA6x5X_C_ACZErZzPb-I0": 31,
      "qLdjhVy6wbxh9hBK_WQC-FHGW_24ZI7hZekfyOP51iw": 16346,
      "QQCYn2MsZKPCB9vAE_W237XjAyj2AB9O3xs5dxUH7wk": 47,
      "70sTVhTA5UJD36xqRdNxwyAVwlEV2nFbb0ao-yHjPb8": 3,
      "V3ISSVZoXyJkzaRY38nY4jIswKh4ss53S0rzbioxmDc": 1,
      "PXGSmNwLqnUDBFBRQSzhyo2MxZ_5Vr1ebeZV59FE0Q4": 600,
      "uCiNuxCIVbWPzRXQc4Lk8pYU_KsWFWd6USkvmIihpB8": 135,
      "_CXmD4UlsOWPnpgBbl1XnI3rNPPMgntVpfR7O4-s09c": 17,
      "FtFP7M086Ut_WPb61r5S9WuTa3WXW8H_WadcToAXukc": 4600,
      "DNzXqsNBoEaadwHlNfonm2ELTSmbuD7qoikxMRyHJ5I": 442,
      "qyQ6i2SQH6ziKOZp5tRkiz2e8fw311x_vJ_asTja7cE": 1206,
      "X7Ux9-ygNrvYn1YG5a8CK03QMc_S7-BPsPPiw39T64Q": 7,
      "Mdn_K9SDTCbw0Xnh_bn1bDAhP79f0b7X5Sa-nqRKnKA": 1,
      "f3H4no1fnr1h0Tm7b5jGoJwirpx6XKA3-cNP8B8E250": 1895,
      "W0GQR9J27qVW0yS5vU2l5Uy-nkvQzTiPf_bozMa76mI": 100,
      "y0RepgGnyIGbTtLjGwDvyxsfU-Xngy9HxXuQdjJOYSo": 50,
      "Mhr33BEVess9EosNZDWy2uf8XcV_YKLAfM4HhL6uF2U": 50,
      "tiQr_HWAK0V1QmsdQhmBObFGfsK0CTgjtioK1vXkB6E": 0,
      "d_eUDFHcnGdSq2w_d2yf1Lir6SmIIk3eyEdGnPxi6Qk": 41,
      "-kCh-WeWfOucUhQfbj1X7tJtFkey3RsdXUloG9OU568": 1,
      "7xL-7RBlPAfWmj3-Sx_fJQXD4nKjVFqrpej-PEaH2ao": 2,
      "oH_znqbhbuTE26Sf6R_ugijp5aBzBUG-7vaI9cPUk8o": 1,
      "ozHwLjA6e14UNGrENuGHr27Y5TvEU6kkDE-CC7oojDs": 6,
      "T-cZl62PTv95xCNHKaV1fpE5b_k6XcUuBjUH8r2KvMI": 1268,
      "Dwmqf5vm_ws10He5dzmDR0OXdlIFf61fVk3HL2xtcB8": 225,
      "93bYny8DJCAh0-cxy_sDge6JeZSO9_2HafJXWlc-Nkk": 137,
      "wQ3d8kTxwTuWf9c9x_b-r6zQzgmzYD0-6OlbvnOguWY": 100,
      "i325n3L2UvgcavEM8UnFfY0OWBiyf2RrbNsLStPI73o": 370000,
      "3iKPRib1KmP-t0B4__smMNuwtWCJgbQhnbw-N8lahzY": 13,
      "WmpYXQ9hfymAZArByTM7RA-22PvObz698FM-digp5d4": 38,
      "x2BLCKUsW_sdKcGOBN3yptKMuOO7wfd10fDkj6BvO-8": 34,
      "wGDjkQ6zQ44m3S0zM93Z6n77JIAh9Po1Ss7N86p0des": 3,
      "zy9RK0Nts08shS0Fy506DzF9TX6XJ7oIePsNUG82DLE": 4,
      "HAkjS_iMU2nVy2m76Cd50Lqra0Nlh1wR8pdO1x0Nh5k": 10,
      "oOqt6uFeTOyFx4IJoN2tKELN2GWqbK-EdlHEo7FC-LQ": 58,
      "jeNnvxnU0qguF-xj3k1hMYlSHgEOMAxtpeYBwKy1r9k": 5,
      "hv7YY5m_GBylpMhNyDEEtbbb9WcKtCWhxXLvPaYrwL4": 2,
      "9zVPIBxvTKJoKgxik-id7umWqMHRE-GUOZN9bruQQdM": 56,
      "6UTUty6yyAg3Q_0cZHB15H3wTVxq-a11tmiY2Ihk_O4": 15,
      "pyRs_tHlUytiBxiMiP17mk_n1h9z6VBDQ9ahIOLRhW4": 3,
      "s6dZJ1v0yn2IhwOFdjIScAagg3M_3lgVGWYJAfUI6Tw": 3,
      "KCIwdCq5nq9TAOixjqYvssBeDGXsqubse5qm_TLO-A0": 2,
      "TF4xrwUfuso6Z8ogRK1YQSrrmtBYmTVx2zfxxK-d8ZQ": 2,
      "fhZk5DtmVJS75U18fWAKGIklANCWhE2riq3X_wuSAR0": 10836,
      "vEY9yUY-A8MCNcorDcKMlfdSTEyJoaLZi4qN3qmwVVk": 3,
      "6bIuK2KNNADBQepupjSEI5L4Jle-BSQZFJ2LpYr5G6Q": 2,
      "SKmIVTuNTqw3kvr0ShTScTue9ngZrRzXdIUydz_MWmU": 30,
      "KsObSLUToicVbgjSre1P5-uyVGiFBW-bfUTX4waZT30": 112,
      "KUX71QIY3ES3Aaxpo8OOISM1W2U8-zE4avbhSsQSPgU": 77,
      "LnSsDy-fGuXFKZxT2_lZj5skFoSDArWFSV9zFx7VX0k": 4,
      "22u6luP5RBaLPUHCgeKPoxY8EeSXIo9UD7R4wP6FoxI": 14,
      "g65Y21xMTmhb03L3_zd86YbvinejaYodWUGwtuMXCYA": 1,
      "B4tNEWR75LMax8C3lBWcvN-kNZGbCZW0Itu7HX7jCTA": 10,
      "11UspasBhB_-6M_hg0hH62f3FwjagFRHrLSeUTPl3kc": 1,
      "fc5eaPL7G3B9oNClXxsMn114eQKkY7yT4iCBtMKN5og": 1,
      "gAlBlOMpHgTq8vmukP7_XJAdB7UaS7_rspkhwXNE-2E": 1,
      "s0aM5gg39dhMI0DGh1D6Qks_dZ4jC0HaRioPhjbXezE": 1,
      "Ex5WxelNLFnXx0MmL4N6F3pnv1A9VN-W0u3S1JZAqwc": 22,
      "XIAsjsPC01wttnoMp0lVmC-FOxyB-7uwo8qgHTDEQLQ": 0,
      "6JHLflIgYm7pBhJ4eJbeIsJFBK4-K_aHmU1qxAJ-540": 2,
      "rsPAeT0pOAIlrpsYxBZ8qm_HPDxg5sbTzKz3uzw47lk": 1403,
      "GIzJCzJ934dDQuBqxgYPfvC8bVbOZ8GoDjkO-45o5LQ": 10,
      "g5fNC0RPymmL-h17jSyJV5JGO_yzqTORrONDfK2qpOI": 29,
      "Bb-QtRUnU2yR_suJT3SnL3dVecQ9cQaT1J0E5oURuSI": 3,
      "ZW1t5mY7svQvReBM31UGeeN4-oLxNsql3JjUbXQZLgk": 10,
      "MPdfeAyLjtlLDoaFIIxtpg8uyPjcIzztnufph3OXhzE": 1,
      "TecxIaWa6mILFZpLcymT513NGTmCP9QSWNO2OMOwi08": 542,
      "uXDc6Nf9OBbvTsggq4u3Hd1dPvs8_JSG2Ps1z43QFCU": 14,
      "Ii5wAMlLNz13n26nYY45mcZErwZLjICmYd46GZvn4ck": 1,
      "Chf3cJ0wyxvQRNMvFbBTXk3Cxp9lZQULTMxQn46ELjE": 49,
      "eWd8TWn06SO6IkAExzIMpf9vj0N82x20QpC1EMLj0Ow": 1,
      "etn-pcjYT4JKLBwL59nCFhi-7Kz6dxfr3n01VILBlLE": 37,
      "sbF3I1jrLMzxvTUaSbD1-KB0xSNluvSVt-B0Yv-U1eo": 5,
      "TCY917VNKI3dNXKbuEHijvb0-bek-4F0o83BK1qNqXw": 34,
      "5TYPDEnGborK2jjz9esG6oUkrwMwPE1YUMxWcFSH6Uw": 2,
      "qoeq6TufIT3Z_Lf3ON62V4dYJ_WNYtj82gfvB8bAXpg": 26,
      "nj7AwoC8YN6Qn2SUxFFQHMlePacvrqDlm4VXcs8qsX8": 58,
      "n9V8SCH5XhE8OoJgWgq5Sy6nJzZzum73WHNim3Lhi7Q": 5,
      "qt3bZbaYyNMdL1rCMHAPv-iGWIrhl26di9vUVorgYSk": 2716,
      "da15J1VLL7izjfw1JGvoJ7EV5NJZJ3fMJtVK0TApX98": 1,
      "KQPF0ng4ouzSwFThgp2gP0hyFoWXQg6F6bAmWns9GiQ": 107,
      "VdXCJdKquMZuGK1W0Yi6zk-8HO-UC85vtMhWUOroY9g": 2,
      "F-LNHeaRFVaw0ejVBpdxZ5K9KXuRrJqu-uPF132iJUM": 3,
      "n5koBNUfK6GYh4vLqTHYZW9i5BNv6EObdPbeAyyab3I": 1,
      "mSw7vDk8kJGmZhMWgI_jCNsK0JHu3UlT2xybqiARKFs": 2,
      "NGUtACrOnMq-rm3RC7ZGqD2dwE1zjOupdNp7i6yZehM": 13,
      "Ky1c1Kkt-jZ9sY1hvLF5nCf6WWdBhIU5Un_BMYh-t3c": 1,
      "azVmjsoigp1pPkajM1zvXwcVYy32JzVAoqqG6EPdBJY": 44,
      "mEN3RAfGxiYs8mAOzzWIET3p4VAmruMojDAfJqtBarg": 36,
      "-LTxoKRxk0n7vw36_Jr6YQqUFBxLpR6YWEhH3npwfgI": 14,
      "t3TirahEYCTuWh2avA1Py8SQnFEt2MfDO_V286Q5xQU": 1,
      "2UsYpWK3_VPCd6Ia-BlxVrC6sEVEkc2JCMCjcYi9J1Q": 30,
      "JLw7_pFFfTxQ9Ugsgi048S0oh4bE1_QvkHafG6SkMWI": 14,
      "jcPVzdr3OXhWV60YlrorSZ4QQE0MsXGuRt1DcycNA5g": 12,
      "Yibe9zN8egD6JGH2OTG9rqp3uNy0SkY4cPlUOC4Vfsg": 1,
      "q7JW4jVBBla4HQeaP4I9c0zCtdaqjAWSwK4MaCJkmT4": 44,
      "t500bJHZfxeoInnlLd-4srikXCjku6D_ZuI0tLdOL68": 8,
      "wHC9Xi4DbWubK8lEzzSU4m8_RqCImVGE7N5vCmQP7Y4": 94,
      "mHbVq-iDedaKiUqy8ftZa-xFbzD0tMlXoHJREkKFMfY": 1,
      "pPhc3oqkqTQ-AqSQulHWu_M0-hRgAWfMxY62YNJizoc": 10,
      "9XaFpHnpswVxZ7juWnG5iK9tYocYG_EYRf9WRmzbfCQ": 5,
      "9H9B28iDLWwDT38TItm6jDVEC5KZtnhM-Bu3VYYlO28": 1,
      "L-bD7-f7EVIvT28-LDL2aFq8hyHqJIOIp0AsOiw2Ss8": 3,
      "pYwNgW1L4WDqTlGUTsAsLOy1X26LdIL-cDF5klLcef0": 1,
      "_aQ0NGkK_mOzDZr4qkINgFF55TyhjLtnVwxsfSaPlAQ": 1,
      "6Z-ifqgVi1jOwMvSNwKWs6ewUEQ0gU9eo4aHYC3rN1M": 137,
      "haKhT5ImQUae3rz3FfU3PKkYWji7-JPZMV_J7pa154c": 2,
      "UXzXFRVpQ_4wg5Ybw6EJVqQPrw9tlih5yAPGlnx351U": 3,
      "MXJOJx_vMYqHj4ZuFM7rgWoydqJDaC__6CTXa_grgag": 4,
      "68289_LFHY0VPa68I_4dnsSn_YYJVUj7krW_6HlZWyE": 4,
      "cd8-jIbxRZr7v5v4X8yoy7NKLAJew4-oMNEljYfDtjQ": 1,
      "dnENDBOmePGyUL5mkWeR84x4vCR2DhAZMxzAICC2z1w": 11,
      "0kacAAQAWjQeKcsLsT1RwHj9KwOn1AD4wkp8ATg6kP0": 1,
      "6uzZ2xVslWpFib3BR-J731uogU-FRuKDUifFVRZq8xE": 16,
      "Ty9BfY7l804scXIP5GS0PpYKhU7CojMlzRjhHCUk4sA": 13,
      "WgVqXnVFeauuy9HD0UNygViyl5tC8VqbmrDP1Y06d80": 153,
      "vgcoFb0BS_eivF9ph3Ff4cI7N3188SFTNyhAXEr3mvc": 16,
      "LVNZILL3_rqsvGCuPEbaBa0FAF2rkCVgbhxPRQS2JBg": 3,
      "2nduAOSwVHG9T4a0m0nCKWz7QIVdmRCEfoiBBgACyL0": 2,
      "nKo5xlgC7-z9zTIitVmrc6j9P1l_KpX-v4Tf9kruAIU": 1,
      "a6qlXiL0jRp_FIDKxXcQ0pryc2f_b11xWSPyNUTmgnk": 1,
      "JOCZ5jOyFYZq8dCCu-HYt-ZYf9CIGZGtYpU98iWIeGc": 1,
      "kzxBC9nYeuL93qc_N1tbVxd28NIcFyPrxQQOO0e97Rw": 30,
      "iR4c3cpPkGu8T88ZM9zOgNXFRWjp6V1BH2l7nk_wDow": 5,
      "4EgZFuEuDxUgiOFN_2k174scVtP85LElJMxBl6weh7g": 1,
      "RIXGwrxWrO5hbgzbQqHRbCX0C5y7x7r2bIXSITfuc2Y": 3,
      "e6FRpm6aP7GrPc4TbnX_kHSNePu3rxjK_H3SnoOJ0xc": 61,
      "khORE0q5T1KgSAdZ5JBfDGxOetyt-6rM5FMrElqDICE": 45,
      "tIOgZDBqrwQj7K8AtafSnVRfRX_Q2XluEhqi6s4emPg": 8,
      "kCLU49rrhZhQJCnDclhII0Ols7C_sbWydRzDYWfIh4o": 4,
      "17DRotR7h97iijkSJUlFaJlM5tnli-Kbe_Xhb3yTNcM": 2,
      "wyRtn24FwCoJj9kVXfe74BDqSlGnVRMDLzamyBi5tzo": 34,
      "pOVwPxlCYEbn2-tuKPvQYn5ICweRTKgvDIdlFP06yZY": 1,
      "zUpqwRcf15HXwxnXLeGBIEyOLVOvPP9ZjakgN9Kgw2s": 2,
      "vLRHFqCw1uHu75xqB4fCDW-QxpkpJxBtFD9g4QYUbfw": 37,
      "nRgABp6KGvJ9IYkmxYY6gaCEr7dcrMjRJEZFPBtaE6E": 6,
      "6l2Tqgx2c5vFCg21Z0hw54VpKIfgv0l2qOnPvnl8F4Y": 1,
      "BIJKQasZ5xxuB4dxUYDU4fPqh10mKl6FjlgbhSZkZpE": 4,
      "W9I2LlEmkjGhyG07wNGUbKWOGbrRoSypNuU1XM_IV70": 9,
      "PBahTLkifotnWqt2hPwZcnEQzGyIosE81taoC9ajqNU": 2,
      "P5BMYS52zrWpY7xZR0gCByaZNTfjYJ2xub38PwzhxLY": 10,
      "NGFnZMOLp48QKodUDNCalmkZ-BRNyhm4_dDOUwaP00o": 1,
      "XmlBfW2igf0G6fd8eVmXKI6ktWtTrpI2S53udBNzrJc": 23,
      "iPNtMYt43SgsRrF0ZGHmJ7rE2QQ_xBke2qknt9uezKk": 1,
      "H2-ZhOl6hy1r974b983MqnY8At1RCSSrr7L-68LHmqE": 1,
      "aIUmY9Iy4qoW3HOikTy6aJww-mM4Y-CUJ7mXoPdzdog": 2,
      "DZOeoAuUXuU8JT7yV2RU-5FndHVOQFEyKdNBov7XZk4": 3,
      "3kN6ZCAWshR2RuSksjHavXJZqh7ZwRamFQlKYSP70ao": 3,
      "jq1Y3yno3d0Jxea5bjUAuLUpo175sXgEBdxqPYLKTR8": 26,
      "zPZe0p1Or5Kc0d7YhpT5kBC-JUPcDzUPJeMz2FdFiy4": 215,
      "2aLkIcBH52s2LtZoyRQC_YaFGGSB2r2yGUtgYM5MjZc": 15,
      "73tut_bVoyNERi0rcvRnuAo_zLK0rEbJIFbPUPheQFY": 72,
      "N4N0cxdGT5YYc59JeEFVIe3Ud4oITQ_h_hcFKDe0nEM": 5,
      "iACaOBcZYSRz6A7IrYos1BkDDX0tls9Ly2zu6lAX9MU": 6,
      "ZrQcpGSBHi2gNP1aLTyed_2jmoY6FrOL1JayEygiKrM": 8,
      "IEQHFG7nty3NvgTJB-22TX9iLv_wRBvzawg6dUQ6dM8": 90,
      "m5RBvPRHICGbO86JdXnCnX7XlYL79u5UgH4Lk2bnkss": 822,
      "HhiFgDf3SU_FqbvhtZ7YeuJS_QZ-_fNd2yx3clpyE8Y": 6,
      "_HouUYCB5P10YKBgwXas0HSMc4aqdgF7BjTQDB0MNAM": 12,
      "6yhJjOkmaV8ue4HufYE-Kfyle3esvGuCCsdxuMlTtbw": 33,
      "gBt2uqxRaMc_F4tyDI9rrfiQQf-9-Yu9hNDbpTkDhC8": 4,
      "sHWXH9unz3a8ECTmbBrBDGjJpS6LQEYc8zMnF9-hhU4": 12,
      "zSayWNl9MWVRPj_QmzsJ-RuH12CsfDzukMrPYQQYreU": 5,
      "C1ehBJaPu1OwHe9vyPR9M1rxr0UR1nZa-n_Cd6KwwoM": 132,
      "EYawPhCMWDEbZqO0qIV9GSObOG1rvnLfi8h-EbAITbA": 4,
      "TtCQaVeXyaE2K0zdxUwLYOvW7tyeSJM0rFGrP22tBzQ": 111,
      "lIOaWW3E7aiNoKp-KQ6wnF5xfcCMtzCRf9NyNw_OVG4": 20,
      "Jt17xPtvZalt7iRTqkJBf0bLMh7tz-4IRh9b6FkkRIU": 16,
      "ZV8LGIZLAocsTIOdZ-srwOutdAjK4PqzSKRpZWm6HAQ": 151,
      "3wbLHNQ55hSvHKOTj-6D-m3dTnFla4UAXJ5P-yYzFKc": 5,
      "PzzvjtoOqEkoZpQ4ByRaWkx1ot3HzGj7fAJOr_eFhXY": 72,
      "mWPTmZ6CLH_ClvtIT_lItn5-3izs8DQqcVo3Zu7Be2E": 117,
      "htHwR7T7HoT9nHLweu2BNPQyBtvTzSRJgRtUJyCbEWE": 2228,
      "qb7v5Zco7HdZqKk6_JyEvM8OaGINQeBZCdJJKYRop_A": 500,
      "475hXa8Hpy5ChxUHhcAsSdL8fcRo69f9vwo8MPxvkgU": 4,
      "3nk9yxicYvKQYZ7fUqZTlH6N4kL5Eaq9ubLUCqfdbcM": 27,
      "Ltk-yi1ktyaMDffn8uOry-60hgqm1r1BMr31gMlLDZc": 100,
      "25KJ2ZDrO03y0NwOht3-788SyViO7FmZCEc1RombAmg": 2,
      "91zzeHI7qmNThI1yO5T12WujAPDqVi3zml-bCAack98": 9870,
      "1MDkV06pv8LG-fFVTypMYhzVVwpjalqjXW1ovVmlfIc": 1036,
      "nXwirJDjTBJAcR6pzNXmv68WG9b1MhxLzLA79vCd-4Q": 708,
      "FZVB7R_pcomCZ8dol3lhrUGmMNMcdGQqH7296WU1VCM": 5,
      "7aJN8XQ0vcfeYpJJfSSVuLLSDPC1LRnHK8pFfGxTLog": 10,
      "sOxiMipDPIvRtPNE_xuSPTJqbxz_Khpi24pRGrVKsIg": 93,
      "KT4-OVBSy8FsSmlLHFMjjCZPd00o3X2Cb-oB4_UbrLw": 3248,
      "Pv52_z4wuUhocEzLlkgdIRs_1_TXNAl3ZAK56ahVwdc": 4,
      "WvYIezAKEsl7ApaYfwuxOgJlwOXjd9xksFR2NFsX0co": 6,
      "fgst9cQ5y8Uz39AmXx1nvV3vt8nEZ6gIzwGc9c6_Guw": 25,
      "oiWsd0Vc7VQnoQzqqaNKPOnxcGHtC6Xn1uUcNeMmaWI": 56,
      "c0llsvXoGM6dTKRLjqInlsYC_fP_Qd6hFxu9_taSjFY": 1274,
      "Y3L6Rozc_kQ96mv8p7SM-GfrM9lmymyWaKeZOFCsRxo": 3751,
      "WGm4CbphxJ_2GF_O2gun_AfbcjbNEn9-gN6wxcmOCOs": 24,
      "LbwTsK9W4b3-gG6jNJrcgQzR8EmQQh-CVA32tCOvXOE": 20,
      "I7U0HYZIJnYgCVAvFyjh2bk6A_BkpsUIswV1vpqHSF0": 56,
      "MBavQEOYKKz5kjLMQiStQrhmJxek2dnuZ6UKIY_ICtQ": 49,
      "noYYDDDRsCWh9qsLHZlnud8H2v6a4sb3eef-xZSXhMU": 58,
      "7X6AC08jQb0KIHruormDnSaxau2pf1oh76zwfaiHp5M": 51,
      "h-RFJhtAj_gfgJ2M0vvs2cJdUC-tL7dg_b220HGaTmE": 54,
      "o5HhN-bQw3sJ5AytKG33LNBUhivPwIyG-ARa2izmhbY": 15,
      "ewxGsskE4yYZdGmhzdeyEteVHS7bdZfNuIAozjTJPVM": 5,
      "54AxaPZQbrWmyLeDXU3MBTjAyLxYqrKvkOxcTE5KVrw": 67,
      "CNBst3Y0t14PG5Xh9sLFSOBY72Pu1Ltm1L1I8abfZcM": 100,
      "2HqlC5ZToKRHqX6cLL3JCUvXsLsPNNznE7IE24VkorM": 110,
      "xNu1PX3uZuQtqhmJegDWMLPcEcBtcUmog0tA4hJEHk0": 8,
      "EwyQc99Jlds98pJas52Jt1kmcEcIS6ZcRU06TybWScI": 19,
      "qYSLDGdyO17ZnNZAzQqHt4CQdchMxsjK0TbX5Ho2muQ": 58,
      "38BSGhz1KSb5W1AVUNDeHSU6ZbakEO-Dc9tfqRAKevg": 6,
      "SlvfWCjf-RHTXKSBzYgM5ZcpiVL1rZRNOySHnDB2fQU": 1,
      "zujch1IwnG85OohyNZZ8QSi_Ay_B-6eFM8B4lCy3yBc": 145,
      "Ydu7rCpdORrW7hlTAQhDb22hyEQLcvQr12pJ67fOZno": 10,
      "PSnVreYbroGhiJY-YHz5sfPG-6HYzoGlw-D8wkc9nGM": 1,
      "FYmbTxcB--1OdV3iIJ2v3NuMFPFIjIqIaYsXhrkO9xU": 10,
      "T4dCSuSNseQmy1fIjuuxAH5XlUlkn65_bBNnzFv829A": 3,
      "iKryOeZQMONi2965nKz528htMMN_sBcjlhc-VncoRjA": 2,
      "KuKCVKJ-U5BMOCQlmW-2lvNJG2lsa7q3wxCSXzRQKz4": 189,
      "Ki4suO5nB7V7S5uWm2mDf2HgI59ZvMnd1sG9J9m66LU": 13,
      "ywAVtMY2UaCc0a31JszH74BCsagu2q_opx-fg0f5-OQ": 9,
      "3OsI9lgazA8nOdIU7DQ__ofe4bPAAclL3QwAc9fhllc": 13,
      "YL_S8liF1TiVr5kfYGuWTZDzVPFkGTLpSYdN1-BpEIA": 1,
      "4gWv32ajMdzNA2utFbNffYm7jMTJ6nLf2rVZWqCoL0I": 38,
      "Q4l2q1f5IVyac0TBsWiSxpyacoz1kiGMFPnbspedS6I": 2718,
      "kxDT2kKE2tDOA7FJI7xfhscmA0VQPfADwQngt8jG6XE": 13,
      "s4lpxTLXCQjHA7cgWXYaPCbToClnv9G7KVDzlB2GCtc": 251,
      "P1lqGV7Xj1afkLYmqjZaytdjKerMNfO-KyIuh_HvCmk": 1,
      "Vs6Go70n3cZyCiCc31-Nip9YtwACXiFYQw_OzLJTRoc": 49512,
      "ybooYhlE3GJ6M9fAYmXsHKCGW-u9VJZwHej7l6Qbwgo": 281,
      "kpMIGF9Ffhl4ZNlYd9hjf0jSSwxRdWvIA5en9ECGf7M": 7,
      "jDk0CTTV8rTXNpfOnTJfOSOlc1L1epRgZg1ROTQFqsQ": 1008,
      "wyHfcfbN4ajZSLpljOZMBUJ4OXb9AkIsGTrEVM7Oj1U": 14,
      "-hUNqthXesdKsu7eyPLd4IwnNRqXjYXL3uvKYvK2Jx4": 1,
      "RNpdTjW0zgs37hKAKVUaAtp5tQ-wCcWPldTBw8Q7lGE": 122,
      "hw1-LaidFalma4cz9IPYs0NFl46dyclreFnbTw2zsKA": 5,
      "zoamjslbhyjp2VJbQu36ybpPPBPDEZ555pCzxVRlxuE": 19,
      "nEIIEt8XtnuyYi2i103Fs1Y0hxPqZ_zb7kGcJ0YmEm4": 6,
      "ZyJL5wllrXCE2KsvX1QcOzaE2c0QkgXKK5En5pgt0i8": 76,
      "4zzynLtYWpP6tkTAJEwq2_bZkaHEMZfdv3JlvXPnNNU": 9,
      "nYCZOObTrcd3h1Ki0I9uIn0YQf6IZYpiDXLHnFmd9nM": 256,
      "2qvJUr3RoDN9po8ky94PUXaNNSm-08Gw7w948JlCCTE": 2,
      "Rc2M8USdvLuPUB4VacIjF9O47A-2Xwv9LLOl_3F5QF8": 3,
      "vpMIIvsJPAwMQvSunhvtcy6j43pYmT7tSB78c5qmEjY": 22,
      "NsCxy-8OKj8YexW8n5Wy5EIRXmOHEHVrzeEKxgPMsJE": 1,
      "0ggsguad1mbaJHoB9xEYaozpDE1A7D_g-4DM5t34qb0": 2,
      "WIQ_dBToVCCj8mvOahkH5jvYgohgJNMgpSL3vtX5aGY": 6,
      "qXqfTqvkKetb4U5SLwHziM-7Smr7gnZnCa0vFu-MO-M": 8,
      "e2kmXteIg_jtcHD60WcEpdli7J_8eaC4seg_zQKzMd0": 3,
      "o2XbZOWm5dzTB1VQWYenHMPkNfSg02U8P0UNFjGaLRY": 4,
      "pUfOUC1sD7KvQ53hFCfF2IARf2CL72IF-03_W53Y8VA": 798,
      "L4GNLsGTJl7weA5mVradBq-pzMOYiOpqafdprYhDOW0": 119,
      "P5knmJjNY6q99FdztvHmYGY1JYOXcrDXe27KpoewGck": 2,
      "HHSUG__au_cnaOE4vB949DlD-A7fnxkyJ3ex9tnKhoo": 2,
      "od35xAb8aQJjCHeLqg2n85dzSO5qEQSibYWrRgLJ7ko": 17,
      "yeEG7GtuTq97B5osR6sg-b_phgHT86y1bNmcMBluldo": 2,
      "ApDoijvOHX-CJa--GhgxrSIy3DSVIeSuimELq5WU57s": 2,
      "nblXEXd5sqX1XVCoTVSFPzoru0Ls7mtXTAZTXqNwG3M": 1,
      "62u6qFrj-6G0rCXZzGGX-hT45wrgmNQ-uQnp4eefJ1U": 77,
      "K42fjN7waKyfPdg_fDFP0poQrCjyFKSq-VZL9Boyd8E": 2,
      "1-BUCouUqerHHm5aJTesTw0q_qQ9T8hw0nUzJQ8v06M": 256,
      "VVyOFMbA0Z5ZG6tTE_VTFTSStr8NyrNSsTzOHi1svwQ": 32,
      "6Cp6J9j6aldEZv3UhwPho-BkHmvaFQsi58VbAisFXBY": 2,
      "91qYihryBAzlnftrXNw4vZ7DxSSpdChfwq0Hxl71DoU": 2,
      "T0voxXwv3vTscRIJmYF6cwxciwKkprprSobngqx-DVs": 3,
      "L4t8Ap1oIY1-YqiC0DXWbt5q1CWa69Sazri7febUcPg": 406,
      "zCf1iQ6Ap482j46BWo_iTr0lXnhA4tIQ8R_ABwu35is": 3,
      "TkBa4-05NmTjtwhM4-_CQNmORmT6QH4hNXeWlb1mljo": 4,
      "2J-ECY0uuI7v6cvvi7BC-cBHHh7wyBsbZRaD48uTMlk": 398,
      "ViDtXKNpwPI1AAjVuyzrrV00sI_6ir0-iX-GRRLi1BE": 2,
      "JVDA7fJ_u1VwhN4FrVij866YjLXMzWxZj6fmNg2QXic": 30,
      "ftPab4xLS5HLebOiZkqv1LD8sNiqHwsSjtpa4nQu3xE": 2,
      "x8D4n2G-_jAtrVxL4cE7dz7shm7E4Too0WL_aJuqszE": 48,
      "eSRbkMgnCO5spnYowfRdwqdNr8ooLMG-EBNjlQ3fVgI": 449,
      "_YuYz8i_DgsXT_SCCHCNgqNfXlwp6-Jes-mpTxw85cQ": 45,
      "RwrdKRMKpBWYJR4i8BEVK59fCRZ4wQ0HRUaur3u4N8I": 31,
      "pevwVs6FVnlqdykChMPw8st7Ok8Hm-DBvnoBGzqizDY": 127,
      "o5qrg6OeiEq1yyyD14Blpp06hbWzGAwncP1UUQM3xRs": 93,
      "g82Kxhz-C0TVaXu46jIcDCE7R0nn2Xncdt92m0nZgRk": 42,
      "oTOcUvdI2lKnMnaFhKiopL6zXH5NP3rWRVvj20m_yOU": 9,
      "WpMU7pjcirbqWPWCuHZ_VTxs9Q_W5Mx3W6oGFh3bMeo": 207,
      "CiFplKC0SgsCLTJUCiE-UtU0k2_ZPwMq0OEg_KRDsNQ": 310,
      "IUtAR1TYEEez6cPuVlsMfbsUWuhZk5vp0VPYjETf8EI": 648,
      "NO4NYSYAbZ21L1W_F9MWU8AsFS4UD56mZ37lPVzFk3Q": 23,
      "Z93FFMtH0xRgWUrvlEb04eQ5eGk8CebFHLqvBjmpgpw": 190,
      "Y3agEpiSLqDbRVID7aGUkuLw8G6qGEgJ6MBYUVc-ADA": 129,
      "4ky7mvvB-4UgSjss4R8R7ockBW2R854QT4XRKTPlWI4": 67,
      "H8dfaSaR32HFBku7-JEQ5GryoPdrGJ5rwvd4bLqa8Lg": 127,
      "UBn9SaN82jUKa573Hzn9L7TgJt01SyJMGmxH5kjybjU": 2,
      "Wdo4bFCZOYR2WtQ30jvRxfYFzZTdy8YauWd21c4DSx0": 182,
      "3uZtXbrMJKxOpCM7GXidI_5Mxx9P2pQrH86Ay45CVTs": 185,
      "CR45Hp9bOxuNJTZtpTdcgpKrvY1UjJ6uTVLNF2kPgbY": 1,
      "VdiNredUZWsjRwDPAJWsCxYNqN64vVjDWvbDpAHxybQ": 64,
      "M3K3byR5rmSTmrif941lJK9_U_9S-tnAPta4CQu1VEk": 2,
      "VsUC2rTCbUiiCLUoK6HtHJBd7TJT-u4Cz2KVgFiUvmc": 4,
      "GQeCp-f7E05DcX2f-536x-i9XLGfE8vSNYlYqfHo238": 1,
      "PdcbjC603B7G3zTbPtTKMW8vZzNukbwUZcQsypVpnR0": 1,
      "Y5FNRFAG7w048gDpCeb_klOdj6XyDxMwTPzIXGeW9VA": 1,
      "SplyWYhnQ1M_KyAXgby_a1w4-KpuAa4MOpc-NA1HLkg": 779,
      "dhvEN9C9lGGVko5ItB7UnmbGI96C5A9Hda_wEsCPHoM": 134,
      "USDzCY1W8KgQyIroDsuD8fD4aqduw4BNdBSjv9VVpAQ": 3,
      "nS-hAC_zz8o9LVdFBsx6H0fhmIwinnHIjLeQ2IdfPsw": 18,
      "IkvfaFwAlvLFXu-bWwBkK6CHFfg0-R6vbJGsLAM9uuw": 9,
      "O_ESMonUoVlB5pJ1M3yaC-pcPsidvEGaMcE0f8_TBVA": 1
    },
    "vault": {
      "3mxGJ4xLcQQNv6_TiKx0F0d5XVE0mNvONQI5GZXJXtk": [
        {
          "balance": 30000,
          "start": 519137,
          "end": 781937
        },
        {
          "balance": 30000,
          "start": 519158,
          "end": 913358
        },
        {
          "balance": 30000,
          "start": 519158,
          "end": 1044758
        },
        {
          "balance": 30000,
          "start": 521868,
          "end": 1310268
        },
        {
          "balance": 30000,
          "start": 521868,
          "end": 1178868
        },
        {
          "balance": 25000,
          "start": 524402,
          "end": 655802
        }
      ],
      "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4": [
        {
          "balance": 500000,
          "end": 1317944,
          "start": 540202
        },
        {
          "balance": 500000,
          "end": 1186544,
          "start": 540202
        },
        {
          "balance": 500000,
          "end": 923741,
          "start": 540202
        },
        {
          "balance": 500000,
          "end": 1055144,
          "start": 540202
        },
        {
          "balance": 500000,
          "end": 792339,
          "start": 540202
        }
      ],
      "sLg2atBkYDRceUuiqnSAa6tEIg5B6uXl2KXVeMMhXjA": [
        {
          "balance": 18850,
          "start": 555582,
          "end": 949782
        },
        {
          "balance": 18850,
          "start": 555582,
          "end": 818382
        },
        {
          "balance": 18850,
          "start": 555582,
          "end": 1081182
        }
      ],
      "1bNfiHtlAXRdB0Z5aBWj0JUur0zcKkgbmLZAq_mADWs": [
        {
          "balance": 20000,
          "start": 558158,
          "end": 949958
        },
        {
          "balance": 20000,
          "start": 558158,
          "end": 818558
        },
        {
          "balance": 20000,
          "start": 558159,
          "end": 1081359
        }
      ],
      "qBsg4NuN3Slbt9C3S0SpfahdQl1L0y_UCFzoxXw_KnI": [
        {
          "balance": 6666,
          "start": 560329,
          "end": 1081129
        },
        {
          "balance": 6667,
          "start": 560329,
          "end": 818329
        },
        {
          "balance": 6667,
          "start": 560329,
          "end": 949729
        }
      ],
      "YQGYA7WH6TqMoLBOigEpIQwW1eRqeUvSsYDEQUyMdT0": [
        {
          "balance": 6667,
          "start": 560453,
          "end": 947453
        },
        {
          "balance": 6666,
          "start": 560453,
          "end": 1078853
        },
        {
          "balance": 6667,
          "start": 560453,
          "end": 816053
        }
      ],
      "jTA8_iBEM8wkjWRdPIneXa2tJW9mDAV59-ZHIb5KXsU": [
        {
          "balance": 16667,
          "start": 565401,
          "end": 815961
        },
        {
          "balance": 16667,
          "start": 565401,
          "end": 947361
        },
        {
          "balance": 16666,
          "start": 565401,
          "end": 1078761
        }
      ],
      "37pyn-zUBM0iYLjSmPqrkUeBW4nuUtO4BKJ3zXyNuaY": [
        {
          "balance": 16667,
          "start": 565401,
          "end": 947361
        },
        {
          "balance": 16667,
          "start": 565403,
          "end": 815963
        },
        {
          "balance": 16666,
          "start": 565403,
          "end": 1078763
        }
      ],
      "aoaJNC8NcKVfgwaUj6kyJi2hKrVGUsRHCGf8RhKnsic": [],
      "Th7VysYPJEzvWynOLVKzDovDkJ1SFF7oON4obKzEq7U": [
        {
          "balance": 18750,
          "start": 586984,
          "end": 849784
        },
        {
          "balance": 18750,
          "start": 586984,
          "end": 718384
        },
        {
          "balance": 18750,
          "start": 703847,
          "end": 966647
        },
        {
          "balance": 18750,
          "start": 703847,
          "end": 835247
        },
        {
          "balance": 5000,
          "start": 743884,
          "end": 1138084
        },
        {
          "balance": 5000,
          "start": 743884,
          "end": 1006684
        }
      ],
      "9Oyncaa4eROwxPZtPp7k19T3C8Y5LXHy2SOsEYMcb2s": [
        {
          "balance": 18750,
          "start": 586984,
          "end": 718384
        },
        {
          "balance": 18750,
          "start": 586984,
          "end": 849784
        },
        {
          "balance": 18750,
          "start": 703847,
          "end": 835247
        },
        {
          "balance": 18750,
          "start": 703847,
          "end": 966647
        },
        {
          "balance": 5000,
          "start": 743883,
          "end": 1006683
        },
        {
          "balance": 5000,
          "start": 743884,
          "end": 1138084
        }
      ],
      "pcXbai9GoRbtBWrAgb8RkyEuDXYy5DBn0rMNfg6azGg": [
        {
          "balance": 6385,
          "end": 1395839,
          "start": 607439
        }
      ],
      "kZUUKhbSOieqAWLNKdwEakpNOpSE622xxS8DVG2VbYo": [
        {
          "balance": 33000,
          "start": 608762,
          "end": 1134362
        },
        {
          "balance": 34000,
          "start": 608762,
          "end": 871562
        },
        {
          "balance": 33000,
          "start": 608762,
          "end": 1002962
        }
      ],
      "to2r4qzI2B5JGGTtFHunyoBbLpG0Ql0YvzlGScvnG5Q": [
        {
          "balance": 5000,
          "end": 744841,
          "start": 656441
        }
      ],
      "rcO1Hi4_chcHVFBpSGOAVHVBBcljdypxlCBCbPfnu-c": [
        {
          "balance": 20000,
          "start": 629089,
          "end": 1322282
        },
        {
          "balance": 20000,
          "start": 629089,
          "end": 1190870
        }
      ],
      "t8i_MHAPl-mwDSthhyBAwGWGrI-_foX5SZV_h9f6Vrc": [
        {
          "balance": 200,
          "end": 639718,
          "start": 638218
        }
      ],
      "aVHpFhSorIljeZ9so8unOEnPkW3YqRbqG5cfM4aXxBI": [
        {
          "balance": 5000,
          "start": 645563,
          "end": 908363
        },
        {
          "balance": 5000,
          "start": 645563,
          "end": 1039763
        },
        {
          "balance": 7500,
          "start": 645563,
          "end": 1171163
        },
        {
          "balance": 5000,
          "start": 743883,
          "end": 1006683
        },
        {
          "balance": 5000,
          "start": 743883,
          "end": 1138083
        },
        {
          "balance": 7500,
          "start": 743883,
          "end": 1138083
        },
        {
          "balance": 7500,
          "start": 745127,
          "end": 876527
        }
      ],
      "lqY49mllPGIRB_SfBtJo35JK86HbPlGgiheMZHxhD08": [
        {
          "balance": 20000,
          "start": 645563,
          "end": 1433963
        },
        {
          "balance": 20000,
          "start": 645563,
          "end": 1039763
        },
        {
          "balance": 20000,
          "start": 645563,
          "end": 908363
        },
        {
          "balance": 20000,
          "start": 645563,
          "end": 1171163
        },
        {
          "balance": 20000,
          "start": 645563,
          "end": 1302563
        }
      ],
      "DtTSW9Sua_LjzZlImC4QbcHw3dow6duMh2mfEOCSf70": [
        {
          "balance": 500000,
          "start": 645563,
          "end": 1433963
        }
      ],
      "-OtTqVqAGqTBzhviZptnUTys7rWenNrnQcjGtvDBDdo": [
        {
          "balance": 500000,
          "start": 645563,
          "end": 1433963
        }
      ],
      "fQHCtGRQ4VEVdDTNOIUvcfkxX4balC-6pVYm__tt9LE": [
        {
          "balance": 5000,
          "end": 745412,
          "start": 656524
        },
        {
          "balance": 15100,
          "end": 732573,
          "start": 656563
        }
      ],
      "x_kYqg1CbICnPcGkUVW1AHCrgq7tul-L5Egkf9VtQgQ": [
        {
          "balance": 12500,
          "end": 736723,
          "start": 656723
        }
      ],
      "oxq7mVUflRzz8E75dgvOlWYZW4klIqUjGFW7qVlvwi0": [
        {
          "balance": 2000,
          "end": 651406,
          "start": 645971
        }
      ],
      "MhO_kRT5Lz9THkDZo8GjUNGPCMEOhG3wFFLtKcMFeiI": [
        {
          "balance": 11111,
          "end": 734573,
          "start": 656796
        }
      ],
      "fcMxhaBLYpFEzS4eWqsazA27IVPh738Kh6d6VXSclcA": [
        {
          "balance": 37,
          "end": 653066,
          "start": 648026
        }
      ],
      "RnM2eNUqwDrLSxDcX2UY68jUKZhYoAOY8ysSeH7f7Gg": [
        {
          "balance": 2,
          "end": 1438491,
          "start": 650091
        }
      ],
      "_0EjoVAmmKZ4gumbE192-oIdb52lOmr0Tb1UMT8h9Ms": [
        {
          "balance": 5,
          "end": 663480,
          "start": 658440
        },
        {
          "balance": 8,
          "end": 1469380,
          "start": 680980
        }
      ],
      "9WLZsqQk_1yr-Lq_ZqI9S6glHTkmuQdkdIVNR0XwxXE": [
        {
          "balance": 20000,
          "start": 659955,
          "end": 1185555
        },
        {
          "balance": 20000,
          "start": 659958,
          "end": 1448358
        },
        {
          "balance": 20000,
          "start": 659958,
          "end": 1316958
        },
        {
          "balance": 20000,
          "start": 660056,
          "end": 1054256
        },
        {
          "balance": 20000,
          "start": 660079,
          "end": 922879
        }
      ],
      "T3DFdtapcu0uGbm4d9ChDd1h8xIHxlq8k3QT2nppbIA": [
        {
          "balance": 9,
          "end": 1478739,
          "start": 690339
        }
      ],
      "ygy-l7nWkGgI4gfO11dpvIiS7DX73kpZ7duoS1DaGBo": [
        {
          "balance": 19,
          "end": 1469394,
          "start": 680980
        }
      ],
      "tiQr_HWAK0V1QmsdQhmBObFGfsK0CTgjtioK1vXkB6E": [
        {
          "balance": 11,
          "end": 690629,
          "start": 685589
        },
        {
          "balance": 3,
          "end": 1475943,
          "start": 687543
        }
      ],
      "wQ3d8kTxwTuWf9c9x_b-r6zQzgmzYD0-6OlbvnOguWY": [
        {
          "balance": 10000,
          "start": 695102,
          "end": 1220702
        }
      ],
      "tAOl9bfy2Xwa77msVfDvp_CUC2G6oWJKXM2b3hMvls0": [
        {
          "balance": 50000,
          "start": 703847,
          "end": 1098047
        },
        {
          "balance": 50000,
          "start": 703847,
          "end": 966647
        },
        {
          "balance": 50000,
          "start": 703847,
          "end": 1229447
        },
        {
          "balance": 50000,
          "start": 703847,
          "end": 1492247
        },
        {
          "balance": 50000,
          "start": 703847,
          "end": 1360847
        }
      ],
      "Dd5R95W-xkJ3-ve4ueM5ow4p1AJxbD9yZjD0sXDe47g": [
        {
          "balance": 5000,
          "start": 743883,
          "end": 875283
        },
        {
          "balance": 5000,
          "start": 743884,
          "end": 1006684
        }
      ],
      "6Z-ifqgVi1jOwMvSNwKWs6ewUEQ0gU9eo4aHYC3rN1M": [
        {
          "balance": 6000,
          "start": 743883,
          "end": 1269483
        },
        {
          "balance": 6000,
          "start": 743883,
          "end": 1006683
        },
        {
          "balance": 6000,
          "start": 743883,
          "end": 1138083
        },
        {
          "balance": 6000,
          "start": 743883,
          "end": 1400883
        },
        {
          "balance": 6000,
          "start": 743883,
          "end": 875283
        },
        {
          "balance": 200,
          "end": 881895,
          "start": 768895
        }
      ],
      "EK_aotsK8mHl6TDIjEt7cKTvBP1JuIZ7Ec3eKtyq38A": [
        {
          "balance": 5000,
          "start": 743883,
          "end": 1006683
        },
        {
          "balance": 5000,
          "start": 743884,
          "end": 875284
        }
      ],
      "8s8ABYc_1oDZ553UKXLIzsUie48xc6V88Q1hPtky4C8": [
        {
          "balance": 6000,
          "start": 768888,
          "end": 1163088
        },
        {
          "balance": 6000,
          "start": 768888,
          "end": 1031688
        },
        {
          "balance": 6000,
          "start": 768888,
          "end": 900288
        },
        {
          "balance": 6000,
          "start": 768888,
          "end": 1425888
        },
        {
          "balance": 6000,
          "start": 771642,
          "end": 1297242
        }
      ],
      "nj7AwoC8YN6Qn2SUxFFQHMlePacvrqDlm4VXcs8qsX8": [],
      "KUX71QIY3ES3Aaxpo8OOISM1W2U8-zE4avbhSsQSPgU": [
        {
          "balance": 7609,
          "end": 1568191,
          "start": 779791
        }
      ],
      "Y3L6Rozc_kQ96mv8p7SM-GfrM9lmymyWaKeZOFCsRxo": [
        {
          "balance": 3500,
          "end": 1050536,
          "start": 780536
        }
      ],
      "3s33KRGW9qyDCVCSeN_SjwCaCEk5hrtcBfGVmCJrPB8": [
        {
          "balance": 5000,
          "end": 803094,
          "start": 783094
        }
      ]
    },
    "votes": [
      {
        "status": "failed",
        "type": "set",
        "note": "Apply a Community Fee of 0.0001 AR for the following ArFS Actions\n\n- Creating, renaming or moving Folders\n- Renaming or moving Files\n- Renaming Drives\n\nThese fees were discussed at the ArDrive Community Call 1 on 9/22/2021.  These fees are to be implemented into the ArDrive Applications upon a future major release, pending successful vote.\n\nThe discussion topics can be referenced here, with fees specifically on page 10: ar://I0NL1ZrdZWFeRJeViwJr_-wT7M_ugoajj9bRHQ5JCr8",
        "yays": 54531000000,
        "nays": 580634382880,
        "voted": [
          "Y3L6Rozc_kQ96mv8p7SM-GfrM9lmymyWaKeZOFCsRxo",
          "Dd5R95W-xkJ3-ve4ueM5ow4p1AJxbD9yZjD0sXDe47g",
          "KUX71QIY3ES3Aaxpo8OOISM1W2U8-zE4avbhSsQSPgU",
          "Th7VysYPJEzvWynOLVKzDovDkJ1SFF7oON4obKzEq7U",
          "6Z-ifqgVi1jOwMvSNwKWs6ewUEQ0gU9eo4aHYC3rN1M",
          "9Oyncaa4eROwxPZtPp7k19T3C8Y5LXHy2SOsEYMcb2s",
          "pcXbai9GoRbtBWrAgb8RkyEuDXYy5DBn0rMNfg6azGg",
          "tAOl9bfy2Xwa77msVfDvp_CUC2G6oWJKXM2b3hMvls0",
          "DtTSW9Sua_LjzZlImC4QbcHw3dow6duMh2mfEOCSf70",
          "nj7AwoC8YN6Qn2SUxFFQHMlePacvrqDlm4VXcs8qsX8",
          "lqY49mllPGIRB_SfBtJo35JK86HbPlGgiheMZHxhD08"
        ],
        "start": 781249,
        "totalWeight": 2657689580313,
        "key": "arfsFee",
        "value": "0.0001"
      },
      {
        "status": "failed",
        "type": "set",
        "note": "Apply a Community Fee of 0.0025 AR when new public or private drives are created as per the ArDrive Community Call 1 on 9/22/2021.  This fee is to be implemented into the ArDrive Applications upon a future major release, pending successful vote.\n\nThe discussion topics can be referenced here, with fees specifically on page 10: ar://I0NL1ZrdZWFeRJeViwJr_-wT7M_ugoajj9bRHQ5JCr8",
        "yays": 81778600000,
        "nays": 567840782880,
        "voted": [
          "Y3L6Rozc_kQ96mv8p7SM-GfrM9lmymyWaKeZOFCsRxo",
          "Dd5R95W-xkJ3-ve4ueM5ow4p1AJxbD9yZjD0sXDe47g",
          "KUX71QIY3ES3Aaxpo8OOISM1W2U8-zE4avbhSsQSPgU",
          "Th7VysYPJEzvWynOLVKzDovDkJ1SFF7oON4obKzEq7U",
          "6Z-ifqgVi1jOwMvSNwKWs6ewUEQ0gU9eo4aHYC3rN1M",
          "9Oyncaa4eROwxPZtPp7k19T3C8Y5LXHy2SOsEYMcb2s",
          "pcXbai9GoRbtBWrAgb8RkyEuDXYy5DBn0rMNfg6azGg",
          "tAOl9bfy2Xwa77msVfDvp_CUC2G6oWJKXM2b3hMvls0",
          "DtTSW9Sua_LjzZlImC4QbcHw3dow6duMh2mfEOCSf70",
          "nj7AwoC8YN6Qn2SUxFFQHMlePacvrqDlm4VXcs8qsX8",
          "aVHpFhSorIljeZ9so8unOEnPkW3YqRbqG5cfM4aXxBI",
          "lqY49mllPGIRB_SfBtJo35JK86HbPlGgiheMZHxhD08"
        ],
        "start": 781247,
        "totalWeight": 2657689580313,
        "key": "driveFee",
        "value": "0.0025"
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Core Team, Community Management, 24 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 768888,
        "totalWeight": 2641261831433,
        "recipient": "8s8ABYc_1oDZ553UKXLIzsUie48xc6V88Q1hPtky4C8",
        "qty": 6000,
        "lockLength": 525600
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Core Team, Community Management, 30 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 761058,
        "totalWeight": 2638896631433,
        "recipient": "8s8ABYc_1oDZ553UKXLIzsUie48xc6V88Q1hPtky4C8",
        "qty": 6000,
        "lockLength": 657000
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "Core Team, Community Management, 24 month lock",
        "yays": 0,
        "nays": 0,
        "voted": [],
        "start": 761058,
        "totalWeight": 2638896631433,
        "recipient": "8s8ABYc_1oDZ553UKXLIzsUie48xc6V88Q1hPtky4C8",
        "qty": 6000,
        "lockLength": 525600
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Core Team, Community Management, 18 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 761057,
        "totalWeight": 2638896631433,
        "recipient": "8s8ABYc_1oDZ553UKXLIzsUie48xc6V88Q1hPtky4C8",
        "qty": 6000,
        "lockLength": 394200
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Core Team, Community Management, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 761056,
        "totalWeight": 2638896631433,
        "recipient": "8s8ABYc_1oDZ553UKXLIzsUie48xc6V88Q1hPtky4C8",
        "qty": 6000,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Core Team, Community Management, 6 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 761055,
        "totalWeight": 2638896631433,
        "recipient": "8s8ABYc_1oDZ553UKXLIzsUie48xc6V88Q1hPtky4C8",
        "qty": 6000,
        "lockLength": 131400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Core Team, Community Management, 18 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 740334,
        "totalWeight": 2609331631433,
        "recipient": "6Z-ifqgVi1jOwMvSNwKWs6ewUEQ0gU9eo4aHYC3rN1M",
        "qty": 6000,
        "lockLength": 394200
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Core Team, Community Management, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 739801,
        "totalWeight": 2609331631433,
        "recipient": "6Z-ifqgVi1jOwMvSNwKWs6ewUEQ0gU9eo4aHYC3rN1M",
        "qty": 6000,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Core Team, Community Management, 30 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 739794,
        "totalWeight": 2609331631433,
        "recipient": "6Z-ifqgVi1jOwMvSNwKWs6ewUEQ0gU9eo4aHYC3rN1M",
        "qty": 6000,
        "lockLength": 657000
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Core Team, Community Management, 24 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 739794,
        "totalWeight": 2609331631433,
        "recipient": "6Z-ifqgVi1jOwMvSNwKWs6ewUEQ0gU9eo4aHYC3rN1M",
        "qty": 6000,
        "lockLength": 525600
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Core Team, Engineering, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 739791,
        "totalWeight": 2609331631433,
        "recipient": "Dd5R95W-xkJ3-ve4ueM5ow4p1AJxbD9yZjD0sXDe47g",
        "qty": 5000,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Core Team, Community Management, 6 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 739791,
        "totalWeight": 2609331631433,
        "recipient": "6Z-ifqgVi1jOwMvSNwKWs6ewUEQ0gU9eo4aHYC3rN1M",
        "qty": 6000,
        "lockLength": 131400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Core Team, Engineering, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 739791,
        "totalWeight": 2609331631433,
        "recipient": "EK_aotsK8mHl6TDIjEt7cKTvBP1JuIZ7Ec3eKtyq38A",
        "qty": 5000,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Core Team, Engineering, 6 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 739791,
        "totalWeight": 2609331631433,
        "recipient": "Dd5R95W-xkJ3-ve4ueM5ow4p1AJxbD9yZjD0sXDe47g",
        "qty": 5000,
        "lockLength": 131400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Core Team, Engineering, 6 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 739789,
        "totalWeight": 2609331631433,
        "recipient": "EK_aotsK8mHl6TDIjEt7cKTvBP1JuIZ7Ec3eKtyq38A",
        "qty": 5000,
        "lockLength": 131400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Core Team, Engineering, 24 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 739783,
        "totalWeight": 2609331631433,
        "recipient": "aVHpFhSorIljeZ9so8unOEnPkW3YqRbqG5cfM4aXxBI",
        "qty": 7500,
        "lockLength": 394200
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Core Team, Engineering, 6 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 739781,
        "totalWeight": 2609331631433,
        "recipient": "aVHpFhSorIljeZ9so8unOEnPkW3YqRbqG5cfM4aXxBI",
        "qty": 7500,
        "lockLength": 131400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Core Team, Engineering, 18 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 739781,
        "totalWeight": 2609331631433,
        "recipient": "aVHpFhSorIljeZ9so8unOEnPkW3YqRbqG5cfM4aXxBI",
        "qty": 5000,
        "lockLength": 394200
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Core Team, Engineering, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 739781,
        "totalWeight": 2609331631433,
        "recipient": "aVHpFhSorIljeZ9so8unOEnPkW3YqRbqG5cfM4aXxBI",
        "qty": 5000,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Marketing, Public Site and Content, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 739780,
        "totalWeight": 2609331631433,
        "recipient": "Th7VysYPJEzvWynOLVKzDovDkJ1SFF7oON4obKzEq7U",
        "qty": 5000,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Marketing, Public Site and Content, 18 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 739779,
        "totalWeight": 2609331631433,
        "recipient": "Th7VysYPJEzvWynOLVKzDovDkJ1SFF7oON4obKzEq7U",
        "qty": 5000,
        "lockLength": 394200
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Marketing, Public Site and Content, 18 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 739777,
        "totalWeight": 2609331631433,
        "recipient": "9Oyncaa4eROwxPZtPp7k19T3C8Y5LXHy2SOsEYMcb2s",
        "qty": 5000,
        "lockLength": 394200
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Marketing, Public Site and Content, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 739775,
        "totalWeight": 2609331631433,
        "recipient": "9Oyncaa4eROwxPZtPp7k19T3C8Y5LXHy2SOsEYMcb2s",
        "qty": 5000,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "set",
        "note": "Fixing incorrect support, which was previously set at 15",
        "yays": 1418751000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4",
          "tAOl9bfy2Xwa77msVfDvp_CUC2G6oWJKXM2b3hMvls0"
        ],
        "start": 727769,
        "totalWeight": 2609331631433,
        "key": "support",
        "value": 0.5
      },
      {
        "status": "passed",
        "type": "set",
        "note": "Fixing incorrect quorum, which was previously set at 50",
        "yays": 1418751000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4",
          "tAOl9bfy2Xwa77msVfDvp_CUC2G6oWJKXM2b3hMvls0"
        ],
        "start": 727768,
        "totalWeight": 2609331631433,
        "key": "quorum",
        "value": 0.15
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "Core Team, Engineering, 6 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 719028,
        "totalWeight": 2609331631433,
        "recipient": "EK_aotsK8mHl6TDIjEt7cKTvBP1JuIZ7Ec3eKtyq38A",
        "qty": 5000,
        "lockLength": 131400
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "Core Team, Engineering, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 719014,
        "totalWeight": 2609331631433,
        "recipient": "EK_aotsK8mHl6TDIjEt7cKTvBP1JuIZ7Ec3eKtyq38A",
        "qty": 5000,
        "lockLength": 262800
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "Marketing, Public Site and Content, 6 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 719009,
        "totalWeight": 2609331631433,
        "recipient": "Th7VysYPJEzvWynOLVKzDovDkJ1SFF7oON4obKzEq7U",
        "qty": 5000,
        "lockLength": 131400
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "Core Team, Engineering, 18 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 718921,
        "totalWeight": 2609331631433,
        "recipient": "aVHpFhSorIljeZ9so8unOEnPkW3YqRbqG5cfM4aXxBI",
        "qty": 5000,
        "lockLength": 394200
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "Core Team, Engineering, 24 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 718921,
        "totalWeight": 2609331631433,
        "recipient": "aVHpFhSorIljeZ9so8unOEnPkW3YqRbqG5cfM4aXxBI",
        "qty": 7500,
        "lockLength": 525600
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "Core Team, Engineering, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 718920,
        "totalWeight": 2609331631433,
        "recipient": "aVHpFhSorIljeZ9so8unOEnPkW3YqRbqG5cfM4aXxBI",
        "qty": 5000,
        "lockLength": 262800
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "Core Team, Engineering, 6 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 718920,
        "totalWeight": 2609331631433,
        "recipient": "aVHpFhSorIljeZ9so8unOEnPkW3YqRbqG5cfM4aXxBI",
        "qty": 7500,
        "lockLength": 131400
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "Core Team, Engineering, 6 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 718918,
        "totalWeight": 2609331631433,
        "recipient": "EK_aotsK8mHl6TDIjEt7cKTvBP1JuIZ7Ec3eKtyq38A",
        "qty": 5000,
        "lockLength": 131400
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "Core Team, Engineering, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 718918,
        "totalWeight": 2609331631433,
        "recipient": "EK_aotsK8mHl6TDIjEt7cKTvBP1JuIZ7Ec3eKtyq38A",
        "qty": 5000,
        "lockLength": 262800
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "Marketing, Public Site and Content, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 718917,
        "totalWeight": 2609331631433,
        "recipient": "Th7VysYPJEzvWynOLVKzDovDkJ1SFF7oON4obKzEq7U",
        "qty": 5000,
        "lockLength": 262800
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "Marketing, Public Site and Content, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 718917,
        "totalWeight": 2609331631433,
        "recipient": "9Oyncaa4eROwxPZtPp7k19T3C8Y5LXHy2SOsEYMcb2s",
        "qty": 5000,
        "lockLength": 262800
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "Marketing, Public Site and Content, 6 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 718917,
        "totalWeight": 2609331631433,
        "recipient": "9Oyncaa4eROwxPZtPp7k19T3C8Y5LXHy2SOsEYMcb2s",
        "qty": 5000,
        "lockLength": 131400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Technology Leadership, 30 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 698563,
        "totalWeight": 2463149131433,
        "recipient": "tAOl9bfy2Xwa77msVfDvp_CUC2G6oWJKXM2b3hMvls0",
        "qty": 50000,
        "lockLength": 657000
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Technology Leadership, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 698563,
        "totalWeight": 2463149131433,
        "recipient": "tAOl9bfy2Xwa77msVfDvp_CUC2G6oWJKXM2b3hMvls0",
        "qty": 50000,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Technology Leadership, 24 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 698563,
        "totalWeight": 2463149131433,
        "recipient": "tAOl9bfy2Xwa77msVfDvp_CUC2G6oWJKXM2b3hMvls0",
        "qty": 50000,
        "lockLength": 525600
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Technology Leadership, 18 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 698563,
        "totalWeight": 2463149131433,
        "recipient": "tAOl9bfy2Xwa77msVfDvp_CUC2G6oWJKXM2b3hMvls0",
        "qty": 50000,
        "lockLength": 394200
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Technology Leadership, 36 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 698563,
        "totalWeight": 2463149131433,
        "recipient": "tAOl9bfy2Xwa77msVfDvp_CUC2G6oWJKXM2b3hMvls0",
        "qty": 50000,
        "lockLength": 788400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Marketing and Design, 12 month lock",
        "yays": 1294742250000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4",
          "9Oyncaa4eROwxPZtPp7k19T3C8Y5LXHy2SOsEYMcb2s"
        ],
        "start": 698561,
        "totalWeight": 2463149131433,
        "recipient": "Th7VysYPJEzvWynOLVKzDovDkJ1SFF7oON4obKzEq7U",
        "qty": 18750,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Marketing and Design, 6 month lock",
        "yays": 1294742250000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4",
          "9Oyncaa4eROwxPZtPp7k19T3C8Y5LXHy2SOsEYMcb2s"
        ],
        "start": 698560,
        "totalWeight": 2463149131433,
        "recipient": "Th7VysYPJEzvWynOLVKzDovDkJ1SFF7oON4obKzEq7U",
        "qty": 18750,
        "lockLength": 131400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Marketing and Design, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 698558,
        "totalWeight": 2463149131433,
        "recipient": "9Oyncaa4eROwxPZtPp7k19T3C8Y5LXHy2SOsEYMcb2s",
        "qty": 18750,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Marketing and Design, 6 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 698558,
        "totalWeight": 2463149131433,
        "recipient": "9Oyncaa4eROwxPZtPp7k19T3C8Y5LXHy2SOsEYMcb2s",
        "qty": 18750,
        "lockLength": 131400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Donation to ChARity, from the ArDrive Community Projects and Team Fund\n\nhttps://ch-ar-ity.org/donate/",
        "yays": 1302133500000,
        "nays": 5033934000,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4",
          "pcXbai9GoRbtBWrAgb8RkyEuDXYy5DBn0rMNfg6azGg",
          "Th7VysYPJEzvWynOLVKzDovDkJ1SFF7oON4obKzEq7U",
          "9Oyncaa4eROwxPZtPp7k19T3C8Y5LXHy2SOsEYMcb2s"
        ],
        "start": 689883,
        "totalWeight": 2457886035833,
        "recipient": "wQ3d8kTxwTuWf9c9x_b-r6zQzgmzYD0-6OlbvnOguWY",
        "qty": 10000,
        "lockLength": 525600
      },
      {
        "status": "passed",
        "type": "set",
        "note": "Minor Vote to update logo to the latest design.",
        "yays": 1294743826800,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4",
          "RnM2eNUqwDrLSxDcX2UY68jUKZhYoAOY8ysSeH7f7Gg",
          "Th7VysYPJEzvWynOLVKzDovDkJ1SFF7oON4obKzEq7U"
        ],
        "start": 670937,
        "totalWeight": 2457862328127,
        "key": "communityLogo",
        "value": "tN4vheZxrAIjqCfbs3MDdWTXg8a_57JUNyoqA4uwr1k"
      },
      {
        "status": "passed",
        "type": "indicative",
        "note": "Major Vote to implement the Community Improvement Plan 2021!  It includes details on our community goals, teams, tokenomics, marketing strategy and rewards programs\n\nPlease read the CIP below. Contact phil@ardrive.io for any questions, comments or concerns. \n\nhttps://arweave.net/Yop13NrLwqlm36P_FDCdMaTBwSlj0sdNGAC4FqfRUgo",
        "yays": 1298640621247,
        "nays": 0,
        "voted": [
          "9Oyncaa4eROwxPZtPp7k19T3C8Y5LXHy2SOsEYMcb2s",
          "to2r4qzI2B5JGGTtFHunyoBbLpG0Ql0YvzlGScvnG5Q",
          "fQHCtGRQ4VEVdDTNOIUvcfkxX4balC-6pVYm__tt9LE",
          "x_kYqg1CbICnPcGkUVW1AHCrgq7tul-L5Egkf9VtQgQ",
          "MhO_kRT5Lz9THkDZo8GjUNGPCMEOhG3wFFLtKcMFeiI",
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 657343,
        "totalWeight": 2405302302927
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Strategic Partner 2, 36 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 655973,
        "totalWeight": 2401411616121,
        "recipient": "9WLZsqQk_1yr-Lq_ZqI9S6glHTkmuQdkdIVNR0XwxXE",
        "qty": 20000,
        "lockLength": 788400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Strategic Partner 2, 30 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 655973,
        "totalWeight": 2401411616121,
        "recipient": "9WLZsqQk_1yr-Lq_ZqI9S6glHTkmuQdkdIVNR0XwxXE",
        "qty": 20000,
        "lockLength": 657000
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Strategic Partner 2, 12 month lock",
        "yays": 1287352576800,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4",
          "RnM2eNUqwDrLSxDcX2UY68jUKZhYoAOY8ysSeH7f7Gg"
        ],
        "start": 655971,
        "totalWeight": 2401411616121,
        "recipient": "9WLZsqQk_1yr-Lq_ZqI9S6glHTkmuQdkdIVNR0XwxXE",
        "qty": 20000,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Strategic Partner 2, 24 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 655971,
        "totalWeight": 2401411616121,
        "recipient": "9WLZsqQk_1yr-Lq_ZqI9S6glHTkmuQdkdIVNR0XwxXE",
        "qty": 20000,
        "lockLength": 525600
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Strategic Partner 2, 18 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 655970,
        "totalWeight": 2401411616121,
        "recipient": "9WLZsqQk_1yr-Lq_ZqI9S6glHTkmuQdkdIVNR0XwxXE",
        "qty": 20000,
        "lockLength": 394200
      },
      {
        "status": "quorumFailed",
        "type": "indicative",
        "note": "Vote to implement the Community Improvement Plan 2021!  \n\nPlease read the CIP below.  Contact phil@ardrive.io for any questions, comments or concerns.\n\nhttps://5x6s6ccomn2bvoktrj45woxismtipj6nwfs6lelpo6swtayudrda.arweave.net/7f0vCE5jdBq5U4p52zrokyaHp82xZeWRb3elaYMUHEY",
        "yays": 414016434000,
        "nays": 0,
        "voted": [
          "DtTSW9Sua_LjzZlImC4QbcHw3dow6duMh2mfEOCSf70",
          "Th7VysYPJEzvWynOLVKzDovDkJ1SFF7oON4obKzEq7U",
          "pcXbai9GoRbtBWrAgb8RkyEuDXYy5DBn0rMNfg6azGg",
          "9Oyncaa4eROwxPZtPp7k19T3C8Y5LXHy2SOsEYMcb2s"
        ],
        "start": 645799,
        "totalWeight": 2401491298400
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "Community Distribution, 36 month lock",
        "yays": 399233934000,
        "nays": 0,
        "voted": [
          "DtTSW9Sua_LjzZlImC4QbcHw3dow6duMh2mfEOCSf70",
          "pcXbai9GoRbtBWrAgb8RkyEuDXYy5DBn0rMNfg6azGg"
        ],
        "start": 645792,
        "totalWeight": 2401491298400,
        "recipient": "i325n3L2UvgcavEM8UnFfY0OWBiyf2RrbNsLStPI73o",
        "qty": 300000,
        "lockLength": 788400
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "Community Distribution, 30 month lock",
        "yays": 399233934000,
        "nays": 0,
        "voted": [
          "DtTSW9Sua_LjzZlImC4QbcHw3dow6duMh2mfEOCSf70",
          "pcXbai9GoRbtBWrAgb8RkyEuDXYy5DBn0rMNfg6azGg"
        ],
        "start": 645792,
        "totalWeight": 2401491298400,
        "recipient": "i325n3L2UvgcavEM8UnFfY0OWBiyf2RrbNsLStPI73o",
        "qty": 300000,
        "lockLength": 657000
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "Community Distribution, 24 month lock",
        "yays": 399233934000,
        "nays": 0,
        "voted": [
          "DtTSW9Sua_LjzZlImC4QbcHw3dow6duMh2mfEOCSf70",
          "pcXbai9GoRbtBWrAgb8RkyEuDXYy5DBn0rMNfg6azGg"
        ],
        "start": 645791,
        "totalWeight": 2401491298400,
        "recipient": "i325n3L2UvgcavEM8UnFfY0OWBiyf2RrbNsLStPI73o",
        "qty": 300000,
        "lockLength": 525600
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "Community Distribution, 12 month lock",
        "yays": 399233934000,
        "nays": 0,
        "voted": [
          "DtTSW9Sua_LjzZlImC4QbcHw3dow6duMh2mfEOCSf70",
          "pcXbai9GoRbtBWrAgb8RkyEuDXYy5DBn0rMNfg6azGg"
        ],
        "start": 645790,
        "totalWeight": 2401491298400,
        "recipient": "i325n3L2UvgcavEM8UnFfY0OWBiyf2RrbNsLStPI73o",
        "qty": 300000,
        "lockLength": 262800
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "Community Distribution, 18 month lock",
        "yays": 399233934000,
        "nays": 0,
        "voted": [
          "DtTSW9Sua_LjzZlImC4QbcHw3dow6duMh2mfEOCSf70",
          "pcXbai9GoRbtBWrAgb8RkyEuDXYy5DBn0rMNfg6azGg"
        ],
        "start": 645790,
        "totalWeight": 2401491298400,
        "recipient": "i325n3L2UvgcavEM8UnFfY0OWBiyf2RrbNsLStPI73o",
        "qty": 300000,
        "lockLength": 394200
      },
      {
        "status": "quorumFailed",
        "type": "mint",
        "note": "Community Distribution, unlocked",
        "yays": 399233934000,
        "nays": 0,
        "voted": [
          "DtTSW9Sua_LjzZlImC4QbcHw3dow6duMh2mfEOCSf70",
          "pcXbai9GoRbtBWrAgb8RkyEuDXYy5DBn0rMNfg6azGg"
        ],
        "start": 645787,
        "totalWeight": 2401491298400,
        "recipient": "i325n3L2UvgcavEM8UnFfY0OWBiyf2RrbNsLStPI73o",
        "qty": 550000
      },
      {
        "status": "passed",
        "type": "set",
        "note": "Set to 7 days",
        "yays": 1292384934000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4",
          "pcXbai9GoRbtBWrAgb8RkyEuDXYy5DBn0rMNfg6azGg"
        ],
        "start": 644904,
        "totalWeight": 1553304298400,
        "key": "lockMinLength",
        "value": 5040
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Team, 24 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 642955,
        "totalWeight": 1553304298400,
        "recipient": "aVHpFhSorIljeZ9so8unOEnPkW3YqRbqG5cfM4aXxBI",
        "qty": 7500,
        "lockLength": 525600
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Team, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 642950,
        "totalWeight": 1553304298400,
        "recipient": "aVHpFhSorIljeZ9so8unOEnPkW3YqRbqG5cfM4aXxBI",
        "qty": 5000,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Team, 18 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 642950,
        "totalWeight": 1553304298400,
        "recipient": "aVHpFhSorIljeZ9so8unOEnPkW3YqRbqG5cfM4aXxBI",
        "qty": 5000,
        "lockLength": 394200
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "Team, 6 month lock",
        "yays": 0,
        "nays": 0,
        "voted": [],
        "start": 642950,
        "totalWeight": 1553304298400,
        "recipient": "aVHpFhSorIljeZ9so8unOEnPkW3YqRbqG5cfM4aXxBI",
        "qty": 7500,
        "lockLength": 131400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Warchest, 36 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 642894,
        "totalWeight": 1553304298400,
        "recipient": "-OtTqVqAGqTBzhviZptnUTys7rWenNrnQcjGtvDBDdo",
        "qty": 500000,
        "lockLength": 788400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Team, 36 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 642888,
        "totalWeight": 1553304298400,
        "recipient": "DtTSW9Sua_LjzZlImC4QbcHw3dow6duMh2mfEOCSf70",
        "qty": 500000,
        "lockLength": 788400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Team, 36 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 642873,
        "totalWeight": 1553304298400,
        "recipient": "lqY49mllPGIRB_SfBtJo35JK86HbPlGgiheMZHxhD08",
        "qty": 20000,
        "lockLength": 788400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Team, 30 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 642872,
        "totalWeight": 1553304298400,
        "recipient": "lqY49mllPGIRB_SfBtJo35JK86HbPlGgiheMZHxhD08",
        "qty": 20000,
        "lockLength": 657000
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Team, 24 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 642872,
        "totalWeight": 1553304298400,
        "recipient": "lqY49mllPGIRB_SfBtJo35JK86HbPlGgiheMZHxhD08",
        "qty": 20000,
        "lockLength": 525600
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Team, 18 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 642871,
        "totalWeight": 1553304298400,
        "recipient": "lqY49mllPGIRB_SfBtJo35JK86HbPlGgiheMZHxhD08",
        "qty": 20000,
        "lockLength": 394200
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Team, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 642867,
        "totalWeight": 1553304298400,
        "recipient": "lqY49mllPGIRB_SfBtJo35JK86HbPlGgiheMZHxhD08",
        "qty": 20000,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Updated advisor tokens, continuing lock at 26 months",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 624766,
        "totalWeight": 1662889518400,
        "recipient": "rcO1Hi4_chcHVFBpSGOAVHVBBcljdypxlCBCbPfnu-c",
        "qty": 20000,
        "lockLength": 561781
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Updated advisor tokens, continuing lock at 32 months",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 624766,
        "totalWeight": 1662889518400,
        "recipient": "rcO1Hi4_chcHVFBpSGOAVHVBBcljdypxlCBCbPfnu-c",
        "qty": 20000,
        "lockLength": 693193
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Updated advisor tokens, continuing lock at 20 months",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 624765,
        "totalWeight": 1662889518400,
        "recipient": "rcO1Hi4_chcHVFBpSGOAVHVBBcljdypxlCBCbPfnu-c",
        "qty": 20000,
        "lockLength": 430394
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Updated advisor tokens, continuing lock at 14 months",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 624765,
        "totalWeight": 1662889518400,
        "recipient": "rcO1Hi4_chcHVFBpSGOAVHVBBcljdypxlCBCbPfnu-c",
        "qty": 20000,
        "lockLength": 298991
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Updated advisor tokens, continuing lock at 8 months",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 624760,
        "totalWeight": 1662889518400,
        "recipient": "rcO1Hi4_chcHVFBpSGOAVHVBBcljdypxlCBCbPfnu-c",
        "qty": 20000,
        "lockLength": 167589
      },
      {
        "status": "passed",
        "type": "burnVault",
        "note": "Renegotiated token allocation",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 624751,
        "totalWeight": 1662889518400,
        "target": "rcO1Hi4_chcHVFBpSGOAVHVBBcljdypxlCBCbPfnu-c"
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Strategic Partner, 24 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 606211,
        "totalWeight": 1618516981200,
        "recipient": "kZUUKhbSOieqAWLNKdwEakpNOpSE622xxS8DVG2VbYo",
        "qty": 33000,
        "lockLength": 525600
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Strategic Partner, 18 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 606209,
        "totalWeight": 1618516981200,
        "recipient": "kZUUKhbSOieqAWLNKdwEakpNOpSE622xxS8DVG2VbYo",
        "qty": 33000,
        "lockLength": 394200
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Strategic Partner, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 606206,
        "totalWeight": 1618516981200,
        "recipient": "kZUUKhbSOieqAWLNKdwEakpNOpSE622xxS8DVG2VbYo",
        "qty": 34000,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mint",
        "note": "Due to some Astatine bugs, several thousand additional tokens will be required to complete the first Community Distribution, Aztec Phase 2",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 596026,
        "totalWeight": 1618516981200,
        "recipient": "2ZaUGqVCPxst5s0XO933HbZmksnLixpXkt6Sh2re0hg",
        "qty": 100000
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Marketing and Content, 6 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 583958,
        "totalWeight": 1603684484400,
        "recipient": "Th7VysYPJEzvWynOLVKzDovDkJ1SFF7oON4obKzEq7U",
        "qty": 18750,
        "lockLength": 131400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Marketing and Content, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 583958,
        "totalWeight": 1603684484400,
        "recipient": "Th7VysYPJEzvWynOLVKzDovDkJ1SFF7oON4obKzEq7U",
        "qty": 18750,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Marketing and Design, 6 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 583728,
        "totalWeight": 1603684484400,
        "recipient": "9Oyncaa4eROwxPZtPp7k19T3C8Y5LXHy2SOsEYMcb2s",
        "qty": 18750,
        "lockLength": 131400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Marketing and Design, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 583728,
        "totalWeight": 1603684484400,
        "recipient": "9Oyncaa4eROwxPZtPp7k19T3C8Y5LXHy2SOsEYMcb2s",
        "qty": 18750,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "set",
        "note": "Setting ArDrive Data Upload fee",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 578358,
        "totalWeight": 1603684484400,
        "key": "fee",
        "value": 15
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Early Investor, 18 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 562780,
        "totalWeight": 1565488747200,
        "recipient": "37pyn-zUBM0iYLjSmPqrkUeBW4nuUtO4BKJ3zXyNuaY",
        "qty": 16667,
        "lockLength": 381960
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Early Investor, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 562780,
        "totalWeight": 1565488747200,
        "recipient": "37pyn-zUBM0iYLjSmPqrkUeBW4nuUtO4BKJ3zXyNuaY",
        "qty": 16667,
        "lockLength": 250560
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Early Investor, 24 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 562780,
        "totalWeight": 1565488747200,
        "recipient": "37pyn-zUBM0iYLjSmPqrkUeBW4nuUtO4BKJ3zXyNuaY",
        "qty": 16666,
        "lockLength": 513360
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Early Investor, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 562774,
        "totalWeight": 1565488747200,
        "recipient": "jTA8_iBEM8wkjWRdPIneXa2tJW9mDAV59-ZHIb5KXsU",
        "qty": 16667,
        "lockLength": 250560
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Early Investor, 18 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 562774,
        "totalWeight": 1565488747200,
        "recipient": "jTA8_iBEM8wkjWRdPIneXa2tJW9mDAV59-ZHIb5KXsU",
        "qty": 16667,
        "lockLength": 381960
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Early Investor, 24 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 562774,
        "totalWeight": 1565488747200,
        "recipient": "jTA8_iBEM8wkjWRdPIneXa2tJW9mDAV59-ZHIb5KXsU",
        "qty": 16666,
        "lockLength": 513360
      },
      {
        "status": "passed",
        "type": "mint",
        "note": "Minting additional tokens needed (3% total) for ArDrive Community Distribution Phase 1 \"Aztec\"",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 562079,
        "totalWeight": 1565488747200,
        "recipient": "2ZaUGqVCPxst5s0XO933HbZmksnLixpXkt6Sh2re0hg",
        "qty": 251000
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Early Investor, 24 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 558283,
        "totalWeight": 1549961010000,
        "recipient": "YQGYA7WH6TqMoLBOigEpIQwW1eRqeUvSsYDEQUyMdT0",
        "qty": 6666,
        "lockLength": 518400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Early Investor, 18 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 558283,
        "totalWeight": 1549961010000,
        "recipient": "YQGYA7WH6TqMoLBOigEpIQwW1eRqeUvSsYDEQUyMdT0",
        "qty": 6667,
        "lockLength": 387000
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Early Investor, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 558281,
        "totalWeight": 1549961010000,
        "recipient": "YQGYA7WH6TqMoLBOigEpIQwW1eRqeUvSsYDEQUyMdT0",
        "qty": 6667,
        "lockLength": 255600
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Early Investor, 24 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 558164,
        "totalWeight": 1549961010000,
        "recipient": "qBsg4NuN3Slbt9C3S0SpfahdQl1L0y_UCFzoxXw_KnI",
        "qty": 6666,
        "lockLength": 520800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Early Investor, 18 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 558163,
        "totalWeight": 1549961010000,
        "recipient": "qBsg4NuN3Slbt9C3S0SpfahdQl1L0y_UCFzoxXw_KnI",
        "qty": 6667,
        "lockLength": 389400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Early Investor, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 558163,
        "totalWeight": 1549961010000,
        "recipient": "qBsg4NuN3Slbt9C3S0SpfahdQl1L0y_UCFzoxXw_KnI",
        "qty": 6667,
        "lockLength": 258000
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Early Investor, 18 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 555845,
        "totalWeight": 1526453010000,
        "recipient": "1bNfiHtlAXRdB0Z5aBWj0JUur0zcKkgbmLZAq_mADWs",
        "qty": 20000,
        "lockLength": 391800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Early Investor, 24 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 555845,
        "totalWeight": 1526453010000,
        "recipient": "1bNfiHtlAXRdB0Z5aBWj0JUur0zcKkgbmLZAq_mADWs",
        "qty": 20000,
        "lockLength": 523200
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Early Investor, 12 month lock",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 555845,
        "totalWeight": 1526453010000,
        "recipient": "1bNfiHtlAXRdB0Z5aBWj0JUur0zcKkgbmLZAq_mADWs",
        "qty": 20000,
        "lockLength": 260400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Early Investor, 18 month lock.",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 552966,
        "totalWeight": 1504161000000,
        "recipient": "sLg2atBkYDRceUuiqnSAa6tEIg5B6uXl2KXVeMMhXjA",
        "qty": 18850,
        "lockLength": 394200
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Early Investor, 24 month lock.",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 552966,
        "totalWeight": 1504161000000,
        "recipient": "sLg2atBkYDRceUuiqnSAa6tEIg5B6uXl2KXVeMMhXjA",
        "qty": 18850,
        "lockLength": 525600
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Early Investor, 12 month lock.",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 552966,
        "totalWeight": 1504161000000,
        "recipient": "sLg2atBkYDRceUuiqnSAa6tEIg5B6uXl2KXVeMMhXjA",
        "qty": 18850,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "set",
        "note": "Setting ArDrive Twitter and Discord",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 551852,
        "totalWeight": 1504161000000,
        "key": "communityLogo",
        "value": "1xQvwhgFF7573l5Ejb-5DHudo16R7aF0cTEKJMwsLAs"
      },
      {
        "status": "passed",
        "type": "set",
        "note": "Setting ArDrive Twitter and Discord",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 551852,
        "totalWeight": 1504161000000,
        "key": "communityDiscussionLinks",
        "value": [
          "https://discord.gg/ya4hf2H",
          "https://twitter.com/ardriveapp"
        ]
      },
      {
        "status": "passed",
        "type": "set",
        "note": "Set ArDrive app url to the main ArDrive public site",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 551850,
        "totalWeight": 1504161000000,
        "key": "communityAppUrl",
        "value": "https://ardrive.io"
      },
      {
        "status": "passed",
        "type": "set",
        "note": "Set ArDrive description",
        "yays": 1287351000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 551850,
        "totalWeight": 1504161000000,
        "key": "communityDescription",
        "value": "We are a community focused on building the best private, secure, decentralized, pay-as-you-go, censorship-resistant and permanent data storage solution, for everyone.  With ArDrive's desktop, mobile and web apps, you can easily sync and share your public and private files from the PermaWeb."
      },
      {
        "status": "passed",
        "type": "burnVault",
        "note": "Changing founder stake from 3,000,000 tokens to 2,500,000 tokens.  Burning the vault to support this.",
        "yays": 1576800000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 537553,
        "totalWeight": 1793610000000,
        "target": "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
      },
      {
        "status": "passed",
        "type": "mint",
        "note": "Reducing founder cap from 30% to 25%, so provisioning 2500000 tokens and burning existing 3000000",
        "yays": 1576800000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 537552,
        "totalWeight": 1793610000000,
        "recipient": "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4",
        "qty": 2500000
      },
      {
        "status": "passed",
        "type": "burnVault",
        "note": "Burning tokens that were mistakenly made.",
        "yays": 2233800000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 528387,
        "totalWeight": 3198110000000,
        "target": "2ZaUGqVCPxst5s0XO933HbZmksnLixpXkt6Sh2re0hg"
      },
      {
        "status": "passed",
        "type": "burnVault",
        "note": "Changing Founder total cap.  Burning tokens to readjust",
        "yays": 2233800000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 526795,
        "totalWeight": 2516310000000,
        "target": "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
      },
      {
        "status": "passed",
        "type": "mint",
        "note": "ArDrive Warchest tokens",
        "yays": 2233800000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 525778,
        "totalWeight": 2516310000000,
        "recipient": "2ZaUGqVCPxst5s0XO933HbZmksnLixpXkt6Sh2re0hg",
        "qty": 20000000
      },
      {
        "status": "passed",
        "type": "burnVault",
        "note": "This was a mistake.  Tokens should not have been vaulted :(",
        "yays": 2233800000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 525774,
        "totalWeight": 2516310000000,
        "target": "5i7xQFhpVSjLHsER1ZajupX9ulqkt7uYOIfLVgjrMPM"
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Founder tokens, 6 month lockup",
        "yays": 2233800000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 522223,
        "totalWeight": 2444040000000,
        "recipient": "5i7xQFhpVSjLHsER1ZajupX9ulqkt7uYOIfLVgjrMPM",
        "qty": 500000,
        "lockLength": 131400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Advisory tokens, 6 month lockup",
        "yays": 2233800000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 522223,
        "totalWeight": 2444040000000,
        "recipient": "3mxGJ4xLcQQNv6_TiKx0F0d5XVE0mNvONQI5GZXJXtk",
        "qty": 25000,
        "lockLength": 131400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Advisory tokens, 6 month lockup",
        "yays": 2233800000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 522221,
        "totalWeight": 2444040000000,
        "recipient": "rcO1Hi4_chcHVFBpSGOAVHVBBcljdypxlCBCbPfnu-c",
        "qty": 25000,
        "lockLength": 131400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Advisory tokens, 30 month lockup",
        "yays": 1182600000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 519554,
        "totalWeight": 1277208000000,
        "recipient": "rcO1Hi4_chcHVFBpSGOAVHVBBcljdypxlCBCbPfnu-c",
        "qty": 50000,
        "lockLength": 657000
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Advisory tokens, 36 month lockup",
        "yays": 1182600000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 519554,
        "totalWeight": 1277208000000,
        "recipient": "rcO1Hi4_chcHVFBpSGOAVHVBBcljdypxlCBCbPfnu-c",
        "qty": 50000,
        "lockLength": 788400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Advisory tokens, 30 month lockup",
        "yays": 1182600000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 519552,
        "totalWeight": 1277208000000,
        "recipient": "3mxGJ4xLcQQNv6_TiKx0F0d5XVE0mNvONQI5GZXJXtk",
        "qty": 30000,
        "lockLength": 657000
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Advisory tokens, 36 month lockup",
        "yays": 1182600000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 519552,
        "totalWeight": 1277208000000,
        "recipient": "3mxGJ4xLcQQNv6_TiKx0F0d5XVE0mNvONQI5GZXJXtk",
        "qty": 30000,
        "lockLength": 788400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Advisory tokens, 12 month lockup",
        "yays": 1182600000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 516929,
        "totalWeight": 1182600000000,
        "recipient": "3mxGJ4xLcQQNv6_TiKx0F0d5XVE0mNvONQI5GZXJXtk",
        "qty": 30000,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Advisory tokens, 24 month lockup",
        "yays": 1182600000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 516928,
        "totalWeight": 1182600000000,
        "recipient": "3mxGJ4xLcQQNv6_TiKx0F0d5XVE0mNvONQI5GZXJXtk",
        "qty": 30000,
        "lockLength": 525600
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Advisory tokens, 18 month lockup",
        "yays": 1182600000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 516928,
        "totalWeight": 1182600000000,
        "recipient": "3mxGJ4xLcQQNv6_TiKx0F0d5XVE0mNvONQI5GZXJXtk",
        "qty": 30000,
        "lockLength": 394200
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Advisory tokens, 24 month lockup",
        "yays": 1182600000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 516927,
        "totalWeight": 1182600000000,
        "recipient": "rcO1Hi4_chcHVFBpSGOAVHVBBcljdypxlCBCbPfnu-c",
        "qty": 50000,
        "lockLength": 525600
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Advisory tokens, 18 month lockup",
        "yays": 1182600000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 516927,
        "totalWeight": 1182600000000,
        "recipient": "rcO1Hi4_chcHVFBpSGOAVHVBBcljdypxlCBCbPfnu-c",
        "qty": 50000,
        "lockLength": 394200
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "Advisory tokens, 12 month lockup",
        "yays": 1182600000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 516926,
        "totalWeight": 1182600000000,
        "recipient": "rcO1Hi4_chcHVFBpSGOAVHVBBcljdypxlCBCbPfnu-c",
        "qty": 50000,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "set",
        "note": "Changing max lock time to 3 years.",
        "yays": 1182600000000,
        "nays": 0,
        "voted": [
          "Zznp65qgTIm2QBMjjoEaHKOmQrpTu0tfOcdbkm_qoL4"
        ],
        "start": 516926,
        "totalWeight": 1182600000000,
        "key": "lockMaxLength",
        "value": 788400
      }
    ],
    "roles": {},
    "settings": [
      [
        "quorum",
        0.15
      ],
      [
        "support",
        0.5
      ],
      [
        "voteLength",
        2160
      ],
      [
        "lockMinLength",
        5040
      ],
      [
        "lockMaxLength",
        788400
      ],
      [
        "communityAppUrl",
        "https://ardrive.io"
      ],
      [
        "communityDiscussionLinks",
        [
          "https://discord.gg/ya4hf2H",
          "https://twitter.com/ardriveapp"
        ]
      ],
      [
        "communityDescription",
        "We are a community focused on building the best private, secure, decentralized, pay-as-you-go, censorship-resistant and permanent data storage solution, for everyone.  With ArDrive's desktop, mobile and web apps, you can easily sync and share your public and private files from the PermaWeb."
      ],
      [
        "communityLogo",
        "tN4vheZxrAIjqCfbs3MDdWTXg8a_57JUNyoqA4uwr1k"
      ],
      [
        "fee",
        15
      ]
    ]
  }`;

  const vertoSource = `export function handle(state, action) {
    const settings = new Map(state.settings);
    const balances = state.balances;
    const vault = state.vault;
    const votes = state.votes;
    const input = action.input;
    const caller = action.caller;
    if (input.function === "transfer") {
        const target = input.target;
        const qty = input.qty;
        if (!Number.isInteger(qty)) {
        throw new ContractError('Invalid value for "qty". Must be an integer.');
        }
        if (!target) {
        throw new ContractError("No target specified.");
        }
        if (qty <= 0 || caller === target) {
        throw new ContractError("Invalid token transfer.");
        }
        if (!(caller in balances)) {
        throw new ContractError("Caller doesn't own any DAO balance.");
        }
        if (balances[caller] < qty) {
        throw new ContractError(\`Caller balance not high enough to send \${qty} token(s)!\`);
        }
        balances[caller] -= qty;
        if (target in balances) {
        balances[target] += qty;
        } else {
        balances[target] = qty;
        }
        return {state};
    }
    if (input.function === "balance") {
        const target = input.target || caller;
        if (typeof target !== "string") {
        throw new ContractError("Must specificy target to get balance for.");
        }
        let balance = 0;
        if (target in balances) {
        balance = balances[target];
        }
        if (target in vault && vault[target].length) {
        try {
            balance += vault[target].map((a) => a.balance).reduce((a, b) => a + b, 0);
        } catch (e) {
        }
        }
        return {result: {target, balance}};
    }
    if (input.function === "unlockedBalance") {
        const target = input.target || caller;
        if (typeof target !== "string") {
        throw new ContractError("Must specificy target to get balance for.");
        }
        if (!(target in balances)) {
        throw new ContractError("Cannnot get balance, target does not exist.");
        }
        let balance = balances[target];
        return {result: {target, balance}};
    }
    if (input.function === "lock") {
        const qty = input.qty;
        const lockLength = input.lockLength;
        if (!Number.isInteger(qty) || qty <= 0) {
        throw new ContractError("Quantity must be a positive integer.");
        }
        if (!Number.isInteger(lockLength) || lockLength < settings.get("lockMinLength") || lockLength > settings.get("lockMaxLength")) {
        throw new ContractError(\`lockLength is out of range. lockLength must be between \${settings.get("lockMinLength")} - \${settings.get("lockMaxLength")}.\`);
        }
        const balance = balances[caller];
        if (isNaN(balance) || balance < qty) {
        throw new ContractError("Not enough balance.");
        }
        balances[caller] -= qty;
        const start = +SmartWeave.block.height;
        const end = start + lockLength;
        if (caller in vault) {
        vault[caller].push({
            balance: qty,
            end,
            start
        });
        } else {
        vault[caller] = [{
            balance: qty,
            end,
            start
        }];
        }
        return {state};
    }
    if (input.function === "increaseVault") {
        const lockLength = input.lockLength;
        const id = input.id;
        if (!Number.isInteger(lockLength) || lockLength < settings.get("lockMinLength") || lockLength > settings.get("lockMaxLength")) {
        throw new ContractError(\`lockLength is out of range. lockLength must be between \${settings.get("lockMinLength")} - \${settings.get("lockMaxLength")}.\`);
        }
        if (caller in vault) {
        if (!vault[caller][id]) {
            throw new ContractError("Invalid vault ID.");
        }
        } else {
        throw new ContractError("Caller does not have a vault.");
        }
        if (+SmartWeave.block.height >= vault[caller][id].end) {
        throw new ContractError("This vault has ended.");
        }
        vault[caller][id].end = +SmartWeave.block.height + lockLength;
        return {state};
    }
    if (input.function === "unlock") {
        if (caller in vault && vault[caller].length) {
        let i = vault[caller].length;
        while (i--) {
            const locked = vault[caller][i];
            if (+SmartWeave.block.height >= locked.end) {
            if (caller in balances && typeof balances[caller] === "number") {
                balances[caller] += locked.balance;
            } else {
                balances[caller] = locked.balance;
            }
            vault[caller].splice(i, 1);
            }
        }
        }
        return {state};
    }
    if (input.function === "vaultBalance") {
        const target = input.target || caller;
        let balance = 0;
        if (target in vault) {
        const blockHeight = +SmartWeave.block.height;
        const filtered = vault[target].filter((a) => blockHeight < a.end);
        for (let i = 0, j = filtered.length; i < j; i++) {
            balance += filtered[i].balance;
        }
        }
        return {result: {target, balance}};
    }
    if (input.function === "propose") {
        const voteType = input.type;
        const note = input.note;
        if (typeof note !== "string") {
        throw new ContractError("Note format not recognized.");
        }
        if (!(caller in vault)) {
        throw new ContractError("Caller needs to have locked balances.");
        }
        const hasBalance = vault[caller] && !!vault[caller].filter((a) => a.balance > 0).length;
        if (!hasBalance) {
        throw new ContractError("Caller doesn't have any locked balance.");
        }
        let totalWeight = 0;
        const vaultValues = Object.values(vault);
        for (let i = 0, j = vaultValues.length; i < j; i++) {
        const locked = vaultValues[i];
        for (let j2 = 0, k = locked.length; j2 < k; j2++) {
            totalWeight += locked[j2].balance * (locked[j2].end - locked[j2].start);
        }
        }
        let vote = {
        status: "active",
        type: voteType,
        note,
        yays: 0,
        nays: 0,
        voted: [],
        start: +SmartWeave.block.height,
        totalWeight
        };
        if (voteType === "mint" || voteType === "mintLocked") {
        const recipient = input.recipient;
        const qty = +input.qty;
        if (!recipient) {
            throw new ContractError("No recipient specified");
        }
        if (!Number.isInteger(qty) || qty <= 0) {
            throw new ContractError('Invalid value for "qty". Must be a positive integer.');
        }
        let totalSupply = 0;
        const vaultValues2 = Object.values(vault);
        for (let i = 0, j = vaultValues2.length; i < j; i++) {
            const locked = vaultValues2[i];
            for (let j2 = 0, k = locked.length; j2 < k; j2++) {
            totalSupply += locked[j2].balance;
            }
        }
        const balancesValues = Object.values(balances);
        for (let i = 0, j = balancesValues.length; i < j; i++) {
            totalSupply += balancesValues[i];
        }
        if (totalSupply + qty > Number.MAX_SAFE_INTEGER) {
            throw new ContractError("Quantity too large.");
        }
        let lockLength = {};
        if (input.lockLength) {
            if (!Number.isInteger(input.lockLength) || input.lockLength < settings.get("lockMinLength") || input.lockLength > settings.get("lockMaxLength")) {
            throw new ContractError(\`lockLength is out of range. lockLength must be between \${settings.get("lockMinLength")} - \${settings.get("lockMaxLength")}.\`);
            }
            lockLength = {lockLength: input.lockLength};
        }
        Object.assign(vote, {
            recipient,
            qty
        }, lockLength);
        votes.push(vote);
        } else if (voteType === "burnVault") {
        const target = input.target;
        if (!target || typeof target !== "string") {
            throw new ContractError("Target is required.");
        }
        Object.assign(vote, {
            target
        });
        votes.push(vote);
        } else if (voteType === "set") {
        if (typeof input.key !== "string") {
            throw new ContractError("Data type of key not supported.");
        }
        if (input.key === "quorum" || input.key === "support" || input.key === "lockMinLength" || input.key === "lockMaxLength") {
            input.value = +input.value;
        }
        if (input.key === "quorum") {
            if (isNaN(input.value) || input.value < 0.01 || input.value > 0.99) {
            throw new ContractError("Quorum must be between 0.01 and 0.99.");
            }
        } else if (input.key === "support") {
            if (isNaN(input.value) || input.value < 0.01 || input.value > 0.99) {
            throw new ContractError("Support must be between 0.01 and 0.99.");
            }
        } else if (input.key === "lockMinLength") {
            if (!Number.isInteger(input.value) || input.value < 1 || input.value >= settings.get("lockMaxLength")) {
            throw new ContractError("lockMinLength cannot be less than 1 and cannot be equal or greater than lockMaxLength.");
            }
        } else if (input.key === "lockMaxLength") {
            if (!Number.isInteger(input.value) || input.value <= settings.get("lockMinLength")) {
            throw new ContractError("lockMaxLength cannot be less than or equal to lockMinLength.");
            }
        }
        if (input.key === "role") {
            const recipient = input.recipient;
            if (!recipient) {
            throw new ContractError("No recipient specified");
            }
            Object.assign(vote, {
            key: input.key,
            value: input.value,
            recipient
            });
        } else {
            Object.assign(vote, {
            key: input.key,
            value: input.value
            });
        }
        votes.push(vote);
        } else if (voteType === "indicative") {
        votes.push(vote);
        } else {
        throw new ContractError("Invalid vote type.");
        }
        return {state};
    }
    if (input.function === "vote") {
        const id = input.id;
        const cast = input.cast;
        if (!Number.isInteger(id)) {
        throw new ContractError('Invalid value for "id". Must be an integer.');
        }
        const vote = votes[id];
        let voterBalance = 0;
        if (caller in vault) {
        for (let i = 0, j = vault[caller].length; i < j; i++) {
            const locked = vault[caller][i];
            if (locked.start < vote.start && locked.end >= vote.start) {
            voterBalance += locked.balance * (locked.end - locked.start);
            }
        }
        }
        if (voterBalance <= 0) {
        throw new ContractError("Caller does not have locked balances for this vote.");
        }
        if (vote.voted.includes(caller)) {
        throw new ContractError("Caller has already voted.");
        }
        if (+SmartWeave.block.height >= vote.start + settings.get("voteLength")) {
        throw new ContractError("Vote has already concluded.");
        }
        if (cast === "yay") {
        vote.yays += voterBalance;
        } else if (cast === "nay") {
        vote.nays += voterBalance;
        } else {
        throw new ContractError("Vote cast type unrecognised.");
        }
        vote.voted.push(caller);
        return {state};
    }
    if (input.function === "finalize") {
        const id = input.id;
        const vote = votes[id];
        const qty = vote.qty;
        if (!vote) {
        throw new ContractError("This vote doesn't exists.");
        }
        if (+SmartWeave.block.height < vote.start + settings.get("voteLength")) {
        throw new ContractError("Vote has not yet concluded.");
        }
        if (vote.status !== "active") {
        throw new ContractError("Vote is not active.");
        }
        if (vote.totalWeight * settings.get("quorum") > vote.yays + vote.nays) {
        vote.status = "quorumFailed";
        return {state};
        }
        if (vote.yays !== 0 && (vote.nays === 0 || vote.yays / vote.nays > settings.get("support"))) {
        vote.status = "passed";
        if (vote.type === "mint" || vote.type === "mintLocked") {
            let totalSupply = 0;
            const vaultValues = Object.values(vault);
            for (let i = 0, j = vaultValues.length; i < j; i++) {
            const locked = vaultValues[i];
            for (let j2 = 0, k = locked.length; j2 < k; j2++) {
                totalSupply += locked[j2].balance;
            }
            }
            const balancesValues = Object.values(balances);
            for (let i = 0, j = balancesValues.length; i < j; i++) {
            totalSupply += balancesValues[i];
            }
            if (totalSupply + qty > Number.MAX_SAFE_INTEGER) {
            throw new ContractError("Quantity too large.");
            }
        }
        if (vote.type === "mint") {
            if (vote.recipient in balances) {
            balances[vote.recipient] += qty;
            } else {
            balances[vote.recipient] = qty;
            }
        } else if (vote.type === "mintLocked") {
            const start = +SmartWeave.block.height;
            const end = start + vote.lockLength;
            const locked = {
            balance: qty,
            start,
            end
            };
            if (vote.recipient in vault) {
            vault[vote.recipient].push(locked);
            } else {
            vault[vote.recipient] = [locked];
            }
        } else if (vote.type === "burnVault") {
            if (vote.target in vault) {
            delete vault[vote.target];
            } else {
            vote.status = "failed";
            }
        } else if (vote.type === "set") {
            if (vote.key === "role") {
            state.roles[vote.recipient] = vote.value;
            } else {
            settings.set(vote.key, vote.value);
            state.settings = Array.from(settings);
            }
        }
        } else {
        vote.status = "failed";
        }
        return {state};
    }
    if (input.function === "role") {
        const target = input.target || caller;
        const role = target in state.roles ? state.roles[target] : "";
        if (!role.trim().length) {
        throw new Error("Target doesn't have a role specified.");
        }
        return {result: {target, role}};
    }
    throw new ContractError(\`No function supplied or function not recognised: "\${input.function}"\`);
    }`;

let vertoState = `{
    "name": "Verto",
    "ticker": "VRT",
    "balances": {
      "aLemOhg9OGovn-0o4cOCbueiHT9VgdYnpJpq7NgMA1A": 177871712,
      "uIkyQyMOxOlUZRPPnCm0n0l0fqRowt1KAKu6NTq8xBo": 1056696,
      "WNeEQzI24ZKWslZkQT573JZ8bhatwDVx6XVDrrGbUyk": 217829,
      "BPr7vrFduuQqqVMu_tftxsScTKUq9ke0rx4q5C9ieQU": 0,
      "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls": 0,
      "GVgzvPOB0aZfsHr9HR1ljlfwTE7193dI0bnoWv_vwwA": 99095,
      "6xZ19AHfJqPBbKFfcV5feWmpHVopHVUA1RQ48S9O_pM": 366532,
      "L4Kwxs0yEjAC1tKjH9J3V9Zvs-u4e2LUw3uugMAeW_Y": 1736854,
      "C6nBlkd7pKRxPiUk1AaGeCrup7XiVQow40NO6c9RDGg": 1801843,
      "VovTpJyt97jf0WuE0eb8SujuQJ-IWi4OntFshIv9PV0": 1049937,
      "vLRHFqCw1uHu75xqB4fCDW-QxpkpJxBtFD9g4QYUbfw": 1387,
      "XKVU3cnfIXOSQkAAiTse7C2_xnzBkVxeKQ3oXGqAt_4": 40,
      "XUAeWrINohr3c-x7Nm3x7n7hjbtzxFyjX5Bn0JZ_8a8": 888488,
      "gDYOOmQNlSKdELG5UsZXqlPWdGnFjqLUF4CVAEO413Y": 1913767,
      "dQzTM9hXV5MD1fRniOKI3MvPF_-8b2XDLmpfcMN9hi8": 16,
      "CH_52MZm60ewLdc-HGGM1DEk7hljT37Gf45JT5CoHUQ": 87,
      "NFDGgwMk52QJkX4jIu_aOFJzv7mqs7UMvCJc5Ij480g": 7480,
      "FWlLi87gg_ZU5guWirjLCp-7TyzcK8CgVdOCng5Rgzk": 605845,
      "IICUqQaniNk2IM7NL98fKus1By6Y-JlI5TJ05MLpC7M": 216,
      "abd7DMW1A8-XiGUVn5qxHLseNhkJ5C1Cxjjbj6XC3M8": 407804,
      "tNGSQylZv2XyXEdxG-MeahZTLESNdw35mT3uy4aTdqg": 30,
      "5Q8HNWffEyM5AEqmzPNsTGdMBLVqe1P0i2ReeP8-hWA": 55474,
      "j68QtBALEP-Z06NBBGlu5cBeqkDgL2Ulb1VbMw6GPfI": 3,
      "69JfzFt0P0oKbcQoK8MPE862n9TZZFe-Jkrf7_j8s5U": 3047,
      "Sm3gExQPRCpjB9Fv6PsK_UQKwwaonnrPUhz1UqT7_xs": 693,
      "vxUdiv2fGHMiIoek5E4l3M5qSuKCZtSaOBYjMRc94JU": 28,
      "9Oyncaa4eROwxPZtPp7k19T3C8Y5LXHy2SOsEYMcb2s": 808,
      "D6FrWGDzFMdt0P9sXnMu6dYsQY-YL_THFA0jBpHD4LU": 1,
      "gTgVpgUip8s359Ec3lRcERdJDd_zMYWgjF5N6KWOxzo": 5,
      "to2r4qzI2B5JGGTtFHunyoBbLpG0Ql0YvzlGScvnG5Q": 202,
      "-KLhW3spI7GVcWB4oZeqd_AEo6jg7Ha7-R3zH7qXPjY": 20,
      "XDknMVRjwFoIeo7BN1y3CY1EnZPQLBesQUVmgghRu8Y": 1325,
      "SMft-XozLyxl0ztM-gPSYKvlZVCBiiftNIb4kGFI7wg": 130,
      "pcXbai9GoRbtBWrAgb8RkyEuDXYy5DBn0rMNfg6azGg": 10,
      "oxq7mVUflRzz8E75dgvOlWYZW4klIqUjGFW7qVlvwi0": 10,
      "dJ3OhQSm7N86bIx__dp9-hdDScsV_Uta6YFAdmBm2Bk": 1,
      "Uq-n_p2qPtdWv4c9fSH58Y0xA3svSUHJtsCPDkCkeSg": 0,
      "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4": 937500,
      "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU": 1241008,
      "ljvCPN31XCLPkBo9FUeB7vAK0VC6-eY52-CS-6Iho8U": 625026,
      "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0": 0,
      "1gBiM3n-vG7TQ9qP0E_ouq6-zOyQvtQ_CgOUbvGO4dc": 301,
      "vT90H6CshD4xHzIU9h6gUF3WsTOuj2a4cpn1v2CfvkQ": 2,
      "aPptIV4y-PbOx_KmMdVWGGbmD9zE2eND5Y1C4y76IjU": 11,
      "dxGmt44SZenqmHa-_IEl8AmuejgITs4pB3oe-xUR36A": 14569,
      "-CZI5_c-SA_0gnwyXxE9zJyBvEvy5gxEoTwtxLID9UE": 0,
      "KSg_CV-9087g_Sqrdpwh9qxV9-qa4JB7LrUQEHXihZo": 10,
      "_xc1kiKnRYeMKBGmPvfUwSkcCkxt-18djbVDgJFvu6Y": 10,
      "jM402DHNU1y0GJ53BNh3n6Osk_1iEljGNHLRuUbedE0": 10,
      "T_kwtK6EIrmeljyknG_3AF3ubDk9pCz5YBzuI0Zc2Ng": 100,
      "FeSD9TV8aB0GK0yby8A40KEX1N-3wrJQTDbRW4uUiEA": 0,
      "YbLmKtDxf2mKLff_P3HV1rtchKhgkBn6NaT3XxClVY4": 10,
      "vb5lNHhmEbFmkUUwHaLfQO2kN-P83lEuT0N-0am0qsU": 664,
      "obZ0Zc9sA6tEYvPTR2IVEGHAxaUitpX-vV2aq_z2fPA": 101,
      "oP8eDBQUQYbI1e2C6qxd3ouQWQ3WU9m9kBXnPWM4eO8": 1700,
      "RnM2eNUqwDrLSxDcX2UY68jUKZhYoAOY8ysSeH7f7Gg": 0,
      "Nipmsoh9zoti7Wlo8W-gu98HYGd7fYncdf0f6rN9dcw": 235,
      "GTu1Pq-PtMWIRcmKJDXv0QevarT-iqwUfq6WiuKzylo": 3500,
      "s-hGrOFm1YysWGC3wXkNaFVpyrjdinVpRKiVnhbo2so": 90,
      "I1trB2wjtfggJsywry2GTesjG_83RWbUPZ3ytXyYprk": 400,
      "h4v1V0yPjGhlhzhGwomr-fTo3opjuJMzpyg3rgUqIzA": 100,
      "eoyljXxYnN03zbPYBpZdPThrQao6-yvWPnysan7MIx8": 46,
      "9b_LQSnjm7UhdrPLhOIn78c3KgCxnTKm5gnVHiaO8e0": 100,
      "h-Bgr13OWUOkRGWrnMT0LuUKfJhRss5pfTdxHmNcXyw": 100,
      "LA10KNfQBFy7rLOGHmUu5qHFeZLdJU0XSfVTwBbs_FI": 100,
      "OvNZGr0rBqYpicHpEnMefh0RsqMLzHCxyc7_YL3aPwk": 100,
      "71GK4WhJQ2m7m_eJxQVjD96mtZ03OYDEgi7Yn9Ej4UA": 100,
      "v2XXwq_FvVqH2KR4p_x8H-SQ7rDwZBbykSv-59__Avc": 100,
      "fmTpIBFrCbAyUjV-f3VOq7Szs5RaMovb1Pf9MlUnjVk": 140,
      "GhKQg518VXQtnUm5Y9aFpL-l_xWO-f6an3skh-yxRA4": 100,
      "j6WHJ64nkAFMamkBj4tNBHG4AsIzSEFn7abWulbPNIk": 0,
      "9hoV_lkmZAN5rHDqBDWS7iMTgV19ZJ_VO9uIz2XDEbc": 100,
      "G2p6qraLOEiTzAtFQedhyDt7u9ffUUSUoZmZqlacpRw": 800,
      "FgqixQSdScWmFY4O3dvm04e-DGM0Z8bWyyW-pDmbyGk": 100,
      "_9K7_5Ntxwn7h1-JcgM_rtoBC2yH-coq0NcDHWhsuwE": 100,
      "NGQl4RsiTdcxUlTrr7dwfXyt7cvJc8wis8OyqE9NlN0": 100,
      "LdSse4Z82ZeHaed6i1vk-wT9GoJVGTquzminqDkHVk0": 100,
      "XztOOhBZXGflJTPrxacRPhHEuvaWIrhmNb2nCsAv_XI": 100,
      "h8pFLXAO5Pcd2iguUTfiZi5yBOXvl7pSES96nzTiEVQ": 100,
      "ivuY1YVWN-kMWNMwV6smGTmOAL-EtiLe4sZ2T3S54_E": 2100,
      "4GW_Ld53my8nUtoZpVB_W0I_xZFMEthVgmRXmfrbJK0": 100,
      "LrSyi_hBqzO-JRSZUJcjf1fcdB_JlDLiU71lwRoWcRY": 100,
      "dqk3UTpSjoIrFX2p2iwt23lMX7FQMwG0g60hGpRse1c": 100,
      "yyISnAMZUBuJ1bRxtDWAPUl3irF_5yP6V6LSjCInIsY": 0,
      "kmtKTyd_S_eZO3gag2qAspIMtAopJ_wN6qQ5Np0HQVo": 300,
      "kUcVsTXgXBGi09dArMJFb2rHngt-7BE2EpjS6SxBmiM": 100,
      "4XWQR94uTQ4WyWHrHne8yV20GRMJ3RDSfY6QwmixUEE": 100,
      "6UTUty6yyAg3Q_0cZHB15H3wTVxq-a11tmiY2Ihk_O4": 115,
      "H-W34yslJhHqB_twZ01KMw1lzb-ED-_GXwUs5L_41Ys": 100,
      "emdLOMu8imk4FKi6KZtIYMdRgkJWdk6Ta4Ji-Iy-qr4": 100,
      "rFtJVmOFB9Bs_2Y0YVIe4R61RNtt2Vqg17bOVNzifA0": 100,
      "PqfUQGM-NfANu38VFC5vT7vkMMCOXQGBdM-hKmTJW-U": 100,
      "fQHCtGRQ4VEVdDTNOIUvcfkxX4balC-6pVYm__tt9LE": 100,
      "MtegmuV0WEccXQDHIgdrb4sKqiLN4IfqpgAZE9NsmC8": 100,
      "7YkpxaZg3wjNLR4TcqhClngUg46dt2scBLf8IWQvMOA": 100,
      "MZN_kcDMHpGKP7JjgJxUuFsxF5l3dd9jOP6HYHChWoI": 0,
      "73JmD246_J2wNOU-JKm05KqFBwrT-sqUq2w1u8kbE9U": 100,
      "8GtwIhcuZ1rA_3LN1pZCitd_4KJptLWs-2YG9dW1Y1c": 100,
      "q3OBvb_qm3d8T5yhomKF8fA4WvOz8IT0xf26tRJIG_Y": 100,
      "J3vCwzjmVCuJKde03aI7XCRBsJ-rzSD16L1RelriAIg": 100,
      "B8MejajG4yXaSWEdcukIr0y1Z9ZHbG9imTp9PNagcUo": 100,
      "jvlgWOVeQwHZIimnswNQUe_CwKnodspFyY5HWc2M1jY": 100,
      "8QJJnpwNbpRg74BLJW5ft6PlJX-0kV_kxXwH7G00njY": 100,
      "X4T-2TvuNB3n8P68prAmmuCu5IqfR9BvgS7pqOe_yBw": 100,
      "E7bGBGVlG7U_l3wJ7xSdPvjOE51PrVbgNrCn_H2eeOc": 100,
      "1E2MajrDWWQss6cxjj-_C-KnngOrljifOoXMhyGjtZU": 100,
      "ddRX2gO4Sn8h1lTTB2U1ZsSEqEb9dg6TLcc02MVlPHY": 100,
      "OCQfp7mVo0j0OygBdv7S8kwwAbhQr6dsZAY7DkEKcAw": 100,
      "YHAzM1-loDWut730I3nf2AcZu2xK8X9GUcOZdSV6kTU": 100,
      "Yr0K-Zd3KTh95s5p67p_DAVvzjGTMYbuHt0EnKbvLww": 100,
      "791eT281RJTtmzUgE413lg-uOqGAHt581XhkQpVrrU8": 86,
      "oXPkFpvvpI0EDdbBUVz1sOEf8LAcx7pZqTduB70jEvo": 0,
      "Myg_rC5z6G9GyC3lOTeMuk8cPeGeKoirwd_VyV7aRsk": 0,
      "5mpsk_SraooCh8DysgZATwBYnae0_ffRXZYqUeVEvdI": 1,
      "bLhVi4VSuuwngQsPRgPHJGnwG1o2BL-P2LkvToA5M7A": 100,
      "71_oSI6eSEML-ReVI-FwezXa8o1ap6eDBU_y2PbozAM": 100,
      "C5OwFYXZT7C4xsXUKUexhi9jG6KbbXefia6-oPx3WCc": 100,
      "6ecKD_mP5o3QM3DSkLN-pIEa-jBotp69qLq1lGZRN_I": 1,
      "2UV_USFFJxFWUygX8vFiPMaZP4y1IP30Wqc4LI-ceAs": 10,
      "wMwLSEQx9YKgApYes-iTRrbko4ZCS3CZCgBCPoSoFzY": 14,
      "cmB3r44wI1iiGdm8M1dVTv3LFWT5UkAO5B8L5klyvVE": 1675,
      "vzRbXnPQFKxYydN9bjpBAD80rzisDm9N48RYU7nAaKw": 20,
      "7uZaYq70Cu4ekU77AUCuvOky5X_ODGG570aIoGNegiM": 9,
      "DSQfzhOk75tIqafUIEQ0tF0zzeI-BrfjrrS9CfrFet0": 1,
      "fcMxhaBLYpFEzS4eWqsazA27IVPh738Kh6d6VXSclcA": 0,
      "hnAy-Hp5eI8Hss4FbO0ahUhdJ_cJoQi5HfkNQNMRG08": 3700,
      "VlpcjrQ8mirGC-gsnkYbSscYY-sFkLxkRhjPrbdDfyU": 114584,
      "0hhWG79LLWeA__rcSTrcLVr1VeRB7_pVTpAH8ywrbeU": 2327,
      "vHMUY4A8YQHgg4l3O8PgjlJI79TEeMjw_he7a6gAMys": 2188,
      "3kN6ZCAWshR2RuSksjHavXJZqh7ZwRamFQlKYSP70ao": 100,
      "jTA8_iBEM8wkjWRdPIneXa2tJW9mDAV59-ZHIb5KXsU": 51,
      "4mNZJLxIjPXkOPC6jerSt3KM8kx-MzQKGhXm8poqlFY": 78,
      "FtFP7M086Ut_WPb61r5S9WuTa3WXW8H_WadcToAXukc": 600,
      "ZjVVVE0wwI0Lafg488ykJJc4J-bl4I_9PBPYp7epNJQ": 100,
      "IMlFU8txOvVHiHZJJGcEV9PTCXhELZ_VYOx4ELuPGCs": 100,
      "lOU42Burb3tTXOoRABpKdcQY8hYX6FOlyc3p2bBM2aI": 100,
      "nqdiNMQb3ig-dULLMU84LI8BEP0fiohnfka1eHqguN4": 100,
      "3YiKT6_-5yMGr8eY4BCaXXOzjeV_MC9k0lp_awuOvL8": 100,
      "PhDSS2ppuR7KKVEPJ4fW5XU1NshEaIpKoev_mV_jzZY": 100,
      "w8C5zIQN3exSgsPuGO5xSWdC3wwRmcvrbneq9pSLIBc": 100,
      "xvOqDAdRpzE1h5Z3tinL9XKgxTFMR84evwsLEx1-ylw": 100,
      "KU_23P1cBpEI_ln7NjvqkNC2oY_3lwTdYKl-qi7tHbY": 10,
      "vjMc8f7oxBqY79lGSDkFxCsZ2DWbSX1JD2CATzLzJME": 19919,
      "B4tNEWR75LMax8C3lBWcvN-kNZGbCZW0Itu7HX7jCTA": 22,
      "nj7AwoC8YN6Qn2SUxFFQHMlePacvrqDlm4VXcs8qsX8": 50,
      "Ex5WxelNLFnXx0MmL4N6F3pnv1A9VN-W0u3S1JZAqwc": 25,
      "wQ3d8kTxwTuWf9c9x_b-r6zQzgmzYD0-6OlbvnOguWY": 50000,
      "D_baH0Gq9bGFzSTlMmqqVl29RkX3FYt_CSP36zoIR6k": 5,
      "oZQsPiMeLGkPJ2UqBX8a5xw6n8l1guNYpWmZ4WA9wg8": 0,
      "kaYP9bJtpqON8Kyy3RbqnqdtDBDUsPTQTNUCvZtKiFI": 1,
      "XIAsjsPC01wttnoMp0lVmC-FOxyB-7uwo8qgHTDEQLQ": 2,
      "91zzeHI7qmNThI1yO5T12WujAPDqVi3zml-bCAack98": 9019,
      "oupvoo1x2PleGJDKLV0UvXiMdus2KBA3QufJJvuLXc8": 11236,
      "6p817XK-yIX-hBCQ0qD5wbcP05WPQgPKFmwNYC2xtwM": 9000,
      "cSYOy8-p1QFenktkDBFyRM3cwZSTrQ_J4EsELLho_UE": 71,
      "Ii5wAMlLNz13n26nYY45mcZErwZLjICmYd46GZvn4ck": 1,
      "STdoQcDVftwCrUN_oTsOSClFgG-PoQCRkYmHVgrGkBA": 100,
      "FyINHRSrHW0teUhvJzd6R33Tl50qxLnSj8LJCP5puiI": 26,
      "3tot2o_PcueolCwU0cVCDpBIuPC2c5F5dB0vI9zLmrM": 2
    },
    "vault": {
      "WNeEQzI24ZKWslZkQT573JZ8bhatwDVx6XVDrrGbUyk": [
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
      "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls": [
        {
          "balance": 1000000,
          "end": 1581361,
          "start": 530161
        }
      ],
      "XKVU3cnfIXOSQkAAiTse7C2_xnzBkVxeKQ3oXGqAt_4": [
        {
          "balance": 3,
          "end": 659878,
          "start": 530278
        }
      ],
      "BPr7vrFduuQqqVMu_tftxsScTKUq9ke0rx4q5C9ieQU": [
        {
          "balance": 1000,
          "end": 663764,
          "start": 534164
        }
      ],
      "3kN6ZCAWshR2RuSksjHavXJZqh7ZwRamFQlKYSP70ao": [
        {
          "balance": 625000,
          "start": 581699,
          "end": 844499
        },
        {
          "balance": 625000,
          "start": 581699,
          "end": 1107299
        },
        {
          "balance": 625000,
          "start": 581699,
          "end": 975899
        }
      ],
      "jTA8_iBEM8wkjWRdPIneXa2tJW9mDAV59-ZHIb5KXsU": [
        {
          "balance": 2083333,
          "start": 581699,
          "end": 975899
        },
        {
          "balance": 2083333,
          "start": 581699,
          "end": 844499
        },
        {
          "balance": 2083334,
          "start": 581699,
          "end": 1107299
        }
      ],
      "SMft-XozLyxl0ztM-gPSYKvlZVCBiiftNIb4kGFI7wg": [
        {
          "balance": 25000000,
          "end": 720673,
          "start": 591073
        }
      ],
      "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4": [
        {
          "balance": 937500,
          "end": 1525520,
          "start": 605720
        },
        {
          "balance": 937500,
          "end": 1394120,
          "start": 605720
        },
        {
          "balance": 937500,
          "end": 868520,
          "start": 605720
        },
        {
          "balance": 937500,
          "end": 1262720,
          "start": 605720
        },
        {
          "balance": 937500,
          "end": 1131320,
          "start": 605720
        },
        {
          "balance": 937500,
          "end": 1656920,
          "start": 605720
        },
        {
          "balance": 937500,
          "end": 999920,
          "start": 605720
        }
      ],
      "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU": [
        {
          "balance": 1250000,
          "end": 1656934,
          "start": 605734
        },
        {
          "balance": 1250000,
          "end": 999934,
          "start": 605734
        },
        {
          "balance": 1250000,
          "end": 1394134,
          "start": 605734
        },
        {
          "balance": 1250000,
          "end": 868534,
          "start": 605734
        },
        {
          "balance": 1250000,
          "end": 1131334,
          "start": 605734
        },
        {
          "balance": 1250000,
          "end": 1262734,
          "start": 605734
        },
        {
          "balance": 1250000,
          "end": 1525534,
          "start": 605734
        }
      ],
      "ljvCPN31XCLPkBo9FUeB7vAK0VC6-eY52-CS-6Iho8U": [
        {
          "balance": 625000,
          "end": 869063,
          "start": 606263
        },
        {
          "balance": 625000,
          "end": 1131863,
          "start": 606263
        },
        {
          "balance": 625000,
          "end": 1657463,
          "start": 606263
        },
        {
          "balance": 625000,
          "end": 1000463,
          "start": 606263
        },
        {
          "balance": 625000,
          "end": 1526064,
          "start": 606264
        },
        {
          "balance": 625000,
          "end": 1263264,
          "start": 606264
        },
        {
          "balance": 625000,
          "end": 1394664,
          "start": 606264
        }
      ],
      "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0": [
        {
          "balance": 625000,
          "end": 1264573,
          "start": 607573
        },
        {
          "balance": 625000,
          "end": 738973,
          "start": 607573
        },
        {
          "balance": 625000,
          "end": 1658773,
          "start": 607573
        },
        {
          "balance": 625000,
          "end": 1001773,
          "start": 607573
        },
        {
          "balance": 625000,
          "end": 1527373,
          "start": 607573
        },
        {
          "balance": 625000,
          "end": 870373,
          "start": 607573
        },
        {
          "balance": 625000,
          "end": 1133173,
          "start": 607573
        },
        {
          "balance": 625000,
          "end": 1395973,
          "start": 607573
        }
      ],
      "VOVgJ8yrpsYTHxI4ElnQfja49J_bT4urMufJPcfLvmg": [
        {
          "balance": 625000,
          "start": 608226,
          "end": 1133826
        },
        {
          "balance": 625000,
          "start": 608226,
          "end": 1002426
        },
        {
          "balance": 625000,
          "start": 608227,
          "end": 871027
        }
      ],
      "Apba2kQp8U1Rq1K-0YaX0M4POgaC8d0jEGRzIx0vMQQ": [
        {
          "balance": 260417,
          "start": 608226,
          "end": 1133826
        },
        {
          "balance": 260416,
          "start": 608226,
          "end": 871026
        },
        {
          "balance": 260417,
          "start": 608226,
          "end": 1002426
        }
      ],
      "3CbmnFJnY3uwrT6EYh3GoJ0bo-fWfUh9hS6XNQAEavY": [
        {
          "balance": 729166,
          "start": 608226,
          "end": 871026
        },
        {
          "balance": 729167,
          "start": 608226,
          "end": 1133826
        },
        {
          "balance": 729167,
          "start": 608226,
          "end": 1002426
        }
      ],
      "--X7CXQPTIKbyY4hbBLDnjIiEU9R433sI__HO_TPHm4": [
        {
          "balance": 208334,
          "start": 608226,
          "end": 1133826
        },
        {
          "balance": 208333,
          "start": 608226,
          "end": 871026
        },
        {
          "balance": 208333,
          "start": 608226,
          "end": 1002426
        }
      ],
      "kVTh0bR5pGGwr7Hv3NDp7rC-B14MxqsYWMKTQyJ2RP0": [
        {
          "balance": 333750,
          "start": 608226,
          "end": 1002426
        },
        {
          "balance": 333750,
          "start": 608226,
          "end": 1133826
        },
        {
          "balance": 333750,
          "start": 608227,
          "end": 871027
        }
      ],
      "vT90H6CshD4xHzIU9h6gUF3WsTOuj2a4cpn1v2CfvkQ": [
        {
          "balance": 625000,
          "end": 1663633,
          "start": 612433
        },
        {
          "balance": 625000,
          "end": 1269433,
          "start": 612433
        },
        {
          "balance": 625000,
          "end": 743833,
          "start": 612433
        },
        {
          "balance": 625000,
          "end": 875233,
          "start": 612433
        },
        {
          "balance": 625000,
          "end": 1532233,
          "start": 612433
        },
        {
          "balance": 625000,
          "end": 1138033,
          "start": 612433
        },
        {
          "balance": 625000,
          "end": 1400833,
          "start": 612433
        },
        {
          "balance": 625000,
          "end": 1006633,
          "start": 612433
        }
      ],
      "dxGmt44SZenqmHa-_IEl8AmuejgITs4pB3oe-xUR36A": [
        {
          "balance": 50,
          "end": 747872,
          "start": 618272
        },
        {
          "balance": 10000,
          "end": 759198,
          "start": 629598
        },
        {
          "balance": 833000,
          "start": 646429,
          "end": 909229
        }
      ],
      "h1ubFR8QUumVdTGtZ4spwqolmJUq1dsWVDWsS0Dsyw0": [
        {
          "balance": 104167,
          "start": 626058,
          "end": 1151658
        },
        {
          "balance": 104167,
          "start": 626058,
          "end": 1020258
        },
        {
          "balance": 104166,
          "start": 626058,
          "end": 888858
        }
      ],
      "jM402DHNU1y0GJ53BNh3n6Osk_1iEljGNHLRuUbedE0": [
        {
          "balance": 75000,
          "start": 646429,
          "end": 1040629
        },
        {
          "balance": 75000,
          "start": 646429,
          "end": 777829
        },
        {
          "balance": 75000,
          "start": 646429,
          "end": 909229
        },
        {
          "balance": 75000,
          "start": 646429,
          "end": 1172029
        }
      ],
      "RnM2eNUqwDrLSxDcX2UY68jUKZhYoAOY8ysSeH7f7Gg": [
        {
          "balance": 10,
          "end": 777448,
          "start": 647448
        },
        {
          "balance": 30,
          "end": 1698649,
          "start": 647449
        }
      ],
      "s-hGrOFm1YysWGC3wXkNaFVpyrjdinVpRKiVnhbo2so": [
        {
          "balance": 10,
          "end": 780776,
          "start": 651176
        }
      ],
      "j6WHJ64nkAFMamkBj4tNBHG4AsIzSEFn7abWulbPNIk": [
        {
          "balance": 100,
          "end": 959252,
          "start": 659252
        }
      ],
      "VlpcjrQ8mirGC-gsnkYbSscYY-sFkLxkRhjPrbdDfyU": [
        {
          "balance": 725694,
          "start": 692542,
          "end": 1062977
        },
        {
          "balance": 725695,
          "start": 692542,
          "end": 1194377
        },
        {
          "balance": 725694,
          "start": 692542,
          "end": 931577
        }
      ],
      "oZQsPiMeLGkPJ2UqBX8a5xw6n8l1guNYpWmZ4WA9wg8": [
        {
          "balance": 1041667,
          "end": 1003841,
          "start": 741041
        },
        {
          "balance": 1041667,
          "end": 1135242,
          "start": 741042
        },
        {
          "balance": 1041666,
          "end": 1266644,
          "start": 741044
        }
      ]
    },
    "votes": [
      {
        "status": "active",
        "type": "set",
        "note": "Create a setting that includes all contract IDs used by the protocol",
        "yays": 5748750000000,
        "nays": 0,
        "voted": [
          "ljvCPN31XCLPkBo9FUeB7vAK0VC6-eY52-CS-6Iho8U",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0"
        ],
        "start": 793974,
        "totalWeight": 31735074398905,
        "key": "contracts",
        "value": "{\"COMMUNITY\":\"t9T7DIOGxx4VWXoCEeYYarFYeERTpWIC1V3y-BPZgKE\",\"INVITE\":\"8X7JO-F6sumwynRXbi5YhXHuqKbGlMLPE6zMOR_rWXc\",\"CLOB\":\"\"}"
      },
      {
        "status": "active",
        "type": "set",
        "note": "Update community logo to https://github.com/useverto/design/blob/master/logo/community.png",
        "yays": 0,
        "nays": 2874375000000,
        "voted": [
          "ljvCPN31XCLPkBo9FUeB7vAK0VC6-eY52-CS-6Iho8U"
        ],
        "start": 766163,
        "totalWeight": 31735074398905,
        "key": "communityLogo",
        "value": ""
      },
      {
        "status": "passed",
        "type": "set",
        "note": "Proposal to evolve the current contract source to support transferring locked balances.",
        "yays": 20551950000000,
        "nays": 0,
        "voted": [
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls",
          "vT90H6CshD4xHzIU9h6gUF3WsTOuj2a4cpn1v2CfvkQ",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0",
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "SMft-XozLyxl0ztM-gPSYKvlZVCBiiftNIb4kGFI7wg"
        ],
        "start": 720400,
        "totalWeight": 30872762030305,
        "key": "evolve",
        "value": "40tPvYdnGiSpwgnqrS2xJ2dqSvA6h8K11HjJxMs1cbI"
      },
      {
        "status": "quorumFailed",
        "type": "set",
        "note": "Test proposal to evolve contract.\n\nDO NOT VOTE TO PASS",
        "yays": 0,
        "nays": 0,
        "voted": [],
        "start": 693172,
        "totalWeight": 30872762030305,
        "key": "evolve",
        "value": "aZYlh2545yGyQyx370R5LXPty-cJM0SwoaAhAkUw4Y4"
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#2) Strategic Partner 12-Month Mint Lock",
        "yays": 19217250000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "vT90H6CshD4xHzIU9h6gUF3WsTOuj2a4cpn1v2CfvkQ",
          "ljvCPN31XCLPkBo9FUeB7vAK0VC6-eY52-CS-6Iho8U"
        ],
        "start": 679084,
        "totalWeight": 30066294157800,
        "recipient": "VlpcjrQ8mirGC-gsnkYbSscYY-sFkLxkRhjPrbdDfyU",
        "qty": 725694,
        "lockLength": 239035
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#2) Strategic Partner 18-Month Mint Lock",
        "yays": 19217250000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "vT90H6CshD4xHzIU9h6gUF3WsTOuj2a4cpn1v2CfvkQ",
          "ljvCPN31XCLPkBo9FUeB7vAK0VC6-eY52-CS-6Iho8U"
        ],
        "start": 679084,
        "totalWeight": 30066294157800,
        "recipient": "VlpcjrQ8mirGC-gsnkYbSscYY-sFkLxkRhjPrbdDfyU",
        "qty": 725694,
        "lockLength": 370435
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#2) Strategic Partner 24-Month Mint Lock",
        "yays": 19217250000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "vT90H6CshD4xHzIU9h6gUF3WsTOuj2a4cpn1v2CfvkQ",
          "ljvCPN31XCLPkBo9FUeB7vAK0VC6-eY52-CS-6Iho8U"
        ],
        "start": 679084,
        "totalWeight": 30066294157800,
        "recipient": "VlpcjrQ8mirGC-gsnkYbSscYY-sFkLxkRhjPrbdDfyU",
        "qty": 725695,
        "lockLength": 501835
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#1) Strategic Partner 24-Month Mint Lock",
        "yays": 20268450000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "ljvCPN31XCLPkBo9FUeB7vAK0VC6-eY52-CS-6Iho8U",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0",
          "vT90H6CshD4xHzIU9h6gUF3WsTOuj2a4cpn1v2CfvkQ"
        ],
        "start": 644124,
        "totalWeight": 29390307625800,
        "recipient": "jM402DHNU1y0GJ53BNh3n6Osk_1iEljGNHLRuUbedE0",
        "qty": 75000,
        "lockLength": 525600
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#1) Strategic Partner 18-Month Mint Lock",
        "yays": 20268450000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls",
          "ljvCPN31XCLPkBo9FUeB7vAK0VC6-eY52-CS-6Iho8U",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0",
          "vT90H6CshD4xHzIU9h6gUF3WsTOuj2a4cpn1v2CfvkQ"
        ],
        "start": 644124,
        "totalWeight": 29390307625800,
        "recipient": "jM402DHNU1y0GJ53BNh3n6Osk_1iEljGNHLRuUbedE0",
        "qty": 75000,
        "lockLength": 394200
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#1) Strategic Partner 6-Month Mint Lock",
        "yays": 20268450000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "ljvCPN31XCLPkBo9FUeB7vAK0VC6-eY52-CS-6Iho8U",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0",
          "vT90H6CshD4xHzIU9h6gUF3WsTOuj2a4cpn1v2CfvkQ"
        ],
        "start": 644123,
        "totalWeight": 29390307625800,
        "recipient": "jM402DHNU1y0GJ53BNh3n6Osk_1iEljGNHLRuUbedE0",
        "qty": 75000,
        "lockLength": 131400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#1) Private Trading Post Incentive Agreement",
        "yays": 20268450000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls",
          "ljvCPN31XCLPkBo9FUeB7vAK0VC6-eY52-CS-6Iho8U",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0",
          "vT90H6CshD4xHzIU9h6gUF3WsTOuj2a4cpn1v2CfvkQ"
        ],
        "start": 644123,
        "totalWeight": 29390307625800,
        "recipient": "WNeEQzI24ZKWslZkQT573JZ8bhatwDVx6XVDrrGbUyk",
        "qty": 2500000,
        "lockLength": 143384
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#1) Strategic Partner 12-Month Mint Lock",
        "yays": 20268450000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls",
          "ljvCPN31XCLPkBo9FUeB7vAK0VC6-eY52-CS-6Iho8U",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0",
          "vT90H6CshD4xHzIU9h6gUF3WsTOuj2a4cpn1v2CfvkQ"
        ],
        "start": 644123,
        "totalWeight": 29390307625800,
        "recipient": "jM402DHNU1y0GJ53BNh3n6Osk_1iEljGNHLRuUbedE0",
        "qty": 75000,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#2) Private Trading Post Incentive Agreement",
        "yays": 20268450000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls",
          "ljvCPN31XCLPkBo9FUeB7vAK0VC6-eY52-CS-6Iho8U",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0",
          "vT90H6CshD4xHzIU9h6gUF3WsTOuj2a4cpn1v2CfvkQ"
        ],
        "start": 644108,
        "totalWeight": 29390307625800,
        "recipient": "dxGmt44SZenqmHa-_IEl8AmuejgITs4pB3oe-xUR36A",
        "qty": 833000,
        "lockLength": 262800
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#1) Strategic Partner 24-Month Mint Lock",
        "yays": 14355450000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0"
        ],
        "start": 641631,
        "totalWeight": 29390307625800,
        "recipient": "jM402DHNU1y0GJ53BNh3n6Osk_1iEljGNHLRuUbedE0",
        "qty": 75000,
        "lockLength": 525600
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#1) Strategic Partner 18-Month Mint Lock",
        "yays": 14355450000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0"
        ],
        "start": 641631,
        "totalWeight": 29390307625800,
        "recipient": "jM402DHNU1y0GJ53BNh3n6Osk_1iEljGNHLRuUbedE0",
        "qty": 75000,
        "lockLength": 394200
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#1) Strategic Partner 6-Month Mint Lock",
        "yays": 14355450000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0"
        ],
        "start": 641631,
        "totalWeight": 29390307625800,
        "recipient": "jM402DHNU1y0GJ53BNh3n6Osk_1iEljGNHLRuUbedE0",
        "qty": 75000,
        "lockLength": 131400
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#1) Strategic Partner 12-Month Mint Lock",
        "yays": 14355450000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0"
        ],
        "start": 641631,
        "totalWeight": 29390307625800,
        "recipient": "jM402DHNU1y0GJ53BNh3n6Osk_1iEljGNHLRuUbedE0",
        "qty": 75000,
        "lockLength": 262800
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#1) Private Trading Post Incentive Agreement",
        "yays": 14355450000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0"
        ],
        "start": 641631,
        "totalWeight": 29390307625800,
        "recipient": "WNeEQzI24ZKWslZkQT573JZ8bhatwDVx6XVDrrGbUyk",
        "qty": 2500000,
        "lockLength": 146060
      },
      {
        "status": "active",
        "type": "mintLocked",
        "note": "(#10) Private Investor 24-Month Mint Lock",
        "yays": 17311950000000,
        "nays": 0,
        "voted": [
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "ljvCPN31XCLPkBo9FUeB7vAK0VC6-eY52-CS-6Iho8U",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0"
        ],
        "start": 631496,
        "totalWeight": 29390307625800,
        "recipient": "v5dkRRBuneSHb4Vsj4R1YZuZscq6hAIuRuwOTFpgj1Y",
        "qty": 1041667,
        "lockLength": 525600
      },
      {
        "status": "active",
        "type": "mintLocked",
        "note": "(#10) Private Investor 18-Month Mint Lock",
        "yays": 17311950000000,
        "nays": 0,
        "voted": [
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "ljvCPN31XCLPkBo9FUeB7vAK0VC6-eY52-CS-6Iho8U",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0"
        ],
        "start": 631496,
        "totalWeight": 29390307625800,
        "recipient": "v5dkRRBuneSHb4Vsj4R1YZuZscq6hAIuRuwOTFpgj1Y",
        "qty": 1041667,
        "lockLength": 394200
      },
      {
        "status": "active",
        "type": "mintLocked",
        "note": "(#10) Private Investor 12-Month Mint Lock",
        "yays": 17311950000000,
        "nays": 0,
        "voted": [
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "ljvCPN31XCLPkBo9FUeB7vAK0VC6-eY52-CS-6Iho8U",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0"
        ],
        "start": 631496,
        "totalWeight": 29390307625800,
        "recipient": "v5dkRRBuneSHb4Vsj4R1YZuZscq6hAIuRuwOTFpgj1Y",
        "qty": 1041666,
        "lockLength": 262800
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "Private Trading Post Incentive Agreement",
        "yays": 13304250000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0",
          "ljvCPN31XCLPkBo9FUeB7vAK0VC6-eY52-CS-6Iho8U",
          "vT90H6CshD4xHzIU9h6gUF3WsTOuj2a4cpn1v2CfvkQ"
        ],
        "start": 624227,
        "totalWeight": 29265823994400,
        "recipient": "WNeEQzI24ZKWslZkQT573JZ8bhatwDVx6XVDrrGbUyk",
        "qty": 2500000,
        "lockLength": 438480
      },
      {
        "status": "quorumFailed",
        "type": "mint",
        "note": "This is a test vote. Please do not vote \"yay\"",
        "yays": 0,
        "nays": 0,
        "voted": [],
        "start": 619735,
        "totalWeight": 29265823994400,
        "recipient": "0x00000000000000000000000000000000000000000",
        "qty": 1
      },
      {
        "status": "quorumFailed",
        "type": "indicative",
        "note": "This is a test vote. Lorem ipsum dolor sit amet.",
        "yays": 0,
        "nays": 0,
        "voted": [],
        "start": 619733,
        "totalWeight": 29265823994400
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#8) Private Investor 24-Month Mint Lock",
        "yays": 19217250000000,
        "nays": 0,
        "voted": [
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "vT90H6CshD4xHzIU9h6gUF3WsTOuj2a4cpn1v2CfvkQ",
          "ljvCPN31XCLPkBo9FUeB7vAK0VC6-eY52-CS-6Iho8U",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0"
        ],
        "start": 618772,
        "totalWeight": 29265823994400,
        "recipient": "h1ubFR8QUumVdTGtZ4spwqolmJUq1dsWVDWsS0Dsyw0",
        "qty": 104167,
        "lockLength": 525600
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#8) Private Investor 12-Month Mint Lock",
        "yays": 19217250000000,
        "nays": 0,
        "voted": [
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "vT90H6CshD4xHzIU9h6gUF3WsTOuj2a4cpn1v2CfvkQ",
          "ljvCPN31XCLPkBo9FUeB7vAK0VC6-eY52-CS-6Iho8U",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0"
        ],
        "start": 618772,
        "totalWeight": 29265823994400,
        "recipient": "h1ubFR8QUumVdTGtZ4spwqolmJUq1dsWVDWsS0Dsyw0",
        "qty": 104166,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#8) Private Investor 18-Month Mint Lock",
        "yays": 19217250000000,
        "nays": 0,
        "voted": [
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "vT90H6CshD4xHzIU9h6gUF3WsTOuj2a4cpn1v2CfvkQ",
          "ljvCPN31XCLPkBo9FUeB7vAK0VC6-eY52-CS-6Iho8U",
          "WIJQX-GCz_ahWqGhqjd0wO_rpSzncwcADxLHSR_Oit0"
        ],
        "start": 618772,
        "totalWeight": 29265823994400,
        "recipient": "h1ubFR8QUumVdTGtZ4spwqolmJUq1dsWVDWsS0Dsyw0",
        "qty": 104167,
        "lockLength": 394200
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#6) Private Investor 18-Month Mint Lock",
        "yays": 11398950000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 605739,
        "totalWeight": 17845843120200,
        "recipient": "3CbmnFJnY3uwrT6EYh3GoJ0bo-fWfUh9hS6XNQAEavY",
        "qty": 729167,
        "lockLength": 394200
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#4) Private Investor 12-Month Mint Lock",
        "yays": 11398950000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 605739,
        "totalWeight": 17845843120200,
        "recipient": "Apba2kQp8U1Rq1K-0YaX0M4POgaC8d0jEGRzIx0vMQQ",
        "qty": 260416,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#7) Private Investor 18-Month Mint Lock",
        "yays": 11398950000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 605738,
        "totalWeight": 17845843120200,
        "recipient": "kVTh0bR5pGGwr7Hv3NDp7rC-B14MxqsYWMKTQyJ2RP0",
        "qty": 333750,
        "lockLength": 394200
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#5) Private Investor 12-Month Mint Lock",
        "yays": 11398950000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 605738,
        "totalWeight": 17845843120200,
        "recipient": "--X7CXQPTIKbyY4hbBLDnjIiEU9R433sI__HO_TPHm4",
        "qty": 208333,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#6) Private Investor 24-Month Mint Lock",
        "yays": 11398950000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 605738,
        "totalWeight": 17845843120200,
        "recipient": "3CbmnFJnY3uwrT6EYh3GoJ0bo-fWfUh9hS6XNQAEavY",
        "qty": 729167,
        "lockLength": 525600
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#4) Private Investor 24-Month Mint Lock",
        "yays": 11398950000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 605738,
        "totalWeight": 17845843120200,
        "recipient": "Apba2kQp8U1Rq1K-0YaX0M4POgaC8d0jEGRzIx0vMQQ",
        "qty": 260417,
        "lockLength": 525600
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#3) Private Investor 12-Month Mint Lock",
        "yays": 11398950000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 605738,
        "totalWeight": 17845843120200,
        "recipient": "VOVgJ8yrpsYTHxI4ElnQfja49J_bT4urMufJPcfLvmg",
        "qty": 625000,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#5) Private Investor 24-Month Mint Lock",
        "yays": 11398950000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 605738,
        "totalWeight": 17845843120200,
        "recipient": "--X7CXQPTIKbyY4hbBLDnjIiEU9R433sI__HO_TPHm4",
        "qty": 208334,
        "lockLength": 525600
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#7) Private Investor 12-Month Mint Lock",
        "yays": 11398950000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 605738,
        "totalWeight": 17845843120200,
        "recipient": "kVTh0bR5pGGwr7Hv3NDp7rC-B14MxqsYWMKTQyJ2RP0",
        "qty": 333750,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#7) Private Investor 24-Month Mint Lock",
        "yays": 11398950000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 605738,
        "totalWeight": 17845843120200,
        "recipient": "kVTh0bR5pGGwr7Hv3NDp7rC-B14MxqsYWMKTQyJ2RP0",
        "qty": 333750,
        "lockLength": 525600
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#3) Private Investor 18-Month Mint Lock",
        "yays": 11398950000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 605738,
        "totalWeight": 17845843120200,
        "recipient": "VOVgJ8yrpsYTHxI4ElnQfja49J_bT4urMufJPcfLvmg",
        "qty": 625000,
        "lockLength": 394200
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#4) Private Investor 18-Month Mint Lock",
        "yays": 11398950000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 605738,
        "totalWeight": 17845843120200,
        "recipient": "Apba2kQp8U1Rq1K-0YaX0M4POgaC8d0jEGRzIx0vMQQ",
        "qty": 260417,
        "lockLength": 394200
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#5) Private Investor 18-Month Mint Lock",
        "yays": 11398950000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 605738,
        "totalWeight": 17845843120200,
        "recipient": "--X7CXQPTIKbyY4hbBLDnjIiEU9R433sI__HO_TPHm4",
        "qty": 208333,
        "lockLength": 394200
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#6) Private Investor 12-Month Mint Lock",
        "yays": 11398950000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 605738,
        "totalWeight": 17845843120200,
        "recipient": "3CbmnFJnY3uwrT6EYh3GoJ0bo-fWfUh9hS6XNQAEavY",
        "qty": 729166,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#3) Private Investor 24-Month Mint Lock",
        "yays": 11398950000000,
        "nays": 0,
        "voted": [
          "feXSjpWp0gTkr4201FzYwzTXnuxlUqtrhhw59YyP8I4",
          "pm8uOdHKOoqWheDFYQ7RW_N934UFqvb3T5vC4qHLQoU",
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 605738,
        "totalWeight": 17845843120200,
        "recipient": "VOVgJ8yrpsYTHxI4ElnQfja49J_bT4urMufJPcfLvmg",
        "qty": 625000,
        "lockLength": 525600
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#3) Private Investor 12-Month Mint Lock",
        "yays": 3240000000000,
        "nays": 0,
        "voted": [
          "SMft-XozLyxl0ztM-gPSYKvlZVCBiiftNIb4kGFI7wg"
        ],
        "start": 602565,
        "totalWeight": 7498093120200,
        "recipient": "VOVgJ8yrpsYTHxI4ElnQfja49J_bT4urMufJPcfLvmg",
        "qty": 625000,
        "lockLength": 262800
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#5) Private Investor 18-Month Mint Lock",
        "yays": 3240000000000,
        "nays": 0,
        "voted": [
          "SMft-XozLyxl0ztM-gPSYKvlZVCBiiftNIb4kGFI7wg"
        ],
        "start": 602564,
        "totalWeight": 7498093120200,
        "recipient": "--X7CXQPTIKbyY4hbBLDnjIiEU9R433sI__HO_TPHm4",
        "qty": 208333,
        "lockLength": 394200
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#3) Private Investor 18-Month Mint Lock",
        "yays": 3240000000000,
        "nays": 0,
        "voted": [
          "SMft-XozLyxl0ztM-gPSYKvlZVCBiiftNIb4kGFI7wg"
        ],
        "start": 602561,
        "totalWeight": 7498093120200,
        "recipient": "VOVgJ8yrpsYTHxI4ElnQfja49J_bT4urMufJPcfLvmg",
        "qty": 625000,
        "lockLength": 394200
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#7) Private Investor 12-Month Mint Lock",
        "yays": 3240000000000,
        "nays": 0,
        "voted": [
          "SMft-XozLyxl0ztM-gPSYKvlZVCBiiftNIb4kGFI7wg"
        ],
        "start": 602561,
        "totalWeight": 7498093120200,
        "recipient": "kVTh0bR5pGGwr7Hv3NDp7rC-B14MxqsYWMKTQyJ2RP0",
        "qty": 333750,
        "lockLength": 262800
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#3) Private Investor 24-Month Mint Lock",
        "yays": 3240000000000,
        "nays": 0,
        "voted": [
          "SMft-XozLyxl0ztM-gPSYKvlZVCBiiftNIb4kGFI7wg"
        ],
        "start": 602561,
        "totalWeight": 7498093120200,
        "recipient": "VOVgJ8yrpsYTHxI4ElnQfja49J_bT4urMufJPcfLvmg",
        "qty": 625000,
        "lockLength": 525600
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#7) Private Investor 24-Month Mint Lock",
        "yays": 3240000000000,
        "nays": 0,
        "voted": [
          "SMft-XozLyxl0ztM-gPSYKvlZVCBiiftNIb4kGFI7wg"
        ],
        "start": 602558,
        "totalWeight": 7498093120200,
        "recipient": "kVTh0bR5pGGwr7Hv3NDp7rC-B14MxqsYWMKTQyJ2RP0",
        "qty": 333750,
        "lockLength": 525600
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#5) Private Investor 12-Month Mint Lock",
        "yays": 3240000000000,
        "nays": 0,
        "voted": [
          "SMft-XozLyxl0ztM-gPSYKvlZVCBiiftNIb4kGFI7wg"
        ],
        "start": 602558,
        "totalWeight": 7498093120200,
        "recipient": "--X7CXQPTIKbyY4hbBLDnjIiEU9R433sI__HO_TPHm4",
        "qty": 208333,
        "lockLength": 262800
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#4) Private Investor 12-Month Mint Lock",
        "yays": 3240000000000,
        "nays": 0,
        "voted": [
          "SMft-XozLyxl0ztM-gPSYKvlZVCBiiftNIb4kGFI7wg"
        ],
        "start": 602557,
        "totalWeight": 7498093120200,
        "recipient": "Apba2kQp8U1Rq1K-0YaX0M4POgaC8d0jEGRzIx0vMQQ",
        "qty": 260416,
        "lockLength": 262800
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#6) Private Investor 12-Month Mint Lock",
        "yays": 3240000000000,
        "nays": 0,
        "voted": [
          "SMft-XozLyxl0ztM-gPSYKvlZVCBiiftNIb4kGFI7wg"
        ],
        "start": 602557,
        "totalWeight": 7498093120200,
        "recipient": "3CbmnFJnY3uwrT6EYh3GoJ0bo-fWfUh9hS6XNQAEavY",
        "qty": 729166,
        "lockLength": 262800
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#6) Private Investor 18-Month Mint Lock",
        "yays": 3240000000000,
        "nays": 0,
        "voted": [
          "SMft-XozLyxl0ztM-gPSYKvlZVCBiiftNIb4kGFI7wg"
        ],
        "start": 602556,
        "totalWeight": 7498093120200,
        "recipient": "3CbmnFJnY3uwrT6EYh3GoJ0bo-fWfUh9hS6XNQAEavY",
        "qty": 729167,
        "lockLength": 394200
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#7) Private Investor 18-Month Mint Lock",
        "yays": 3240000000000,
        "nays": 0,
        "voted": [
          "SMft-XozLyxl0ztM-gPSYKvlZVCBiiftNIb4kGFI7wg"
        ],
        "start": 602556,
        "totalWeight": 7498093120200,
        "recipient": "kVTh0bR5pGGwr7Hv3NDp7rC-B14MxqsYWMKTQyJ2RP0",
        "qty": 333750,
        "lockLength": 394200
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#5) Private Investor 24-Month Mint Lock",
        "yays": 3240000000000,
        "nays": 0,
        "voted": [
          "SMft-XozLyxl0ztM-gPSYKvlZVCBiiftNIb4kGFI7wg"
        ],
        "start": 602556,
        "totalWeight": 7498093120200,
        "recipient": "--X7CXQPTIKbyY4hbBLDnjIiEU9R433sI__HO_TPHm4",
        "qty": 208334,
        "lockLength": 525600
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#6) Private Investor 24-Month Mint Lock",
        "yays": 3240000000000,
        "nays": 0,
        "voted": [
          "SMft-XozLyxl0ztM-gPSYKvlZVCBiiftNIb4kGFI7wg"
        ],
        "start": 602556,
        "totalWeight": 7498093120200,
        "recipient": "3CbmnFJnY3uwrT6EYh3GoJ0bo-fWfUh9hS6XNQAEavY",
        "qty": 729167,
        "lockLength": 525600
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#4) Private Investor 18-Month Mint Lock",
        "yays": 3240000000000,
        "nays": 0,
        "voted": [
          "SMft-XozLyxl0ztM-gPSYKvlZVCBiiftNIb4kGFI7wg"
        ],
        "start": 602556,
        "totalWeight": 7498093120200,
        "recipient": "Apba2kQp8U1Rq1K-0YaX0M4POgaC8d0jEGRzIx0vMQQ",
        "qty": 260417,
        "lockLength": 394200
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#4) Private Investor 24-Month Mint Lock",
        "yays": 3240000000000,
        "nays": 0,
        "voted": [
          "SMft-XozLyxl0ztM-gPSYKvlZVCBiiftNIb4kGFI7wg"
        ],
        "start": 602556,
        "totalWeight": 7498093120200,
        "recipient": "Apba2kQp8U1Rq1K-0YaX0M4POgaC8d0jEGRzIx0vMQQ",
        "qty": 260417,
        "lockLength": 525600
      },
      {
        "status": "quorumFailed",
        "type": "burnVault",
        "note": "Burning tokens for ghost wallet",
        "yays": 3240000000000,
        "nays": 0,
        "voted": [
          "SMft-XozLyxl0ztM-gPSYKvlZVCBiiftNIb4kGFI7wg"
        ],
        "start": 602523,
        "totalWeight": 7498093120200,
        "target": "SMft-XozLyxl0ztM-gPSYKvlZVCBiiftNIb4kGFI7wg"
      },
      {
        "status": "active",
        "type": "mintLocked",
        "note": "(#4) Private Investor 12-Month Mint Lock",
        "yays": 0,
        "nays": 0,
        "voted": [],
        "start": 589789,
        "totalWeight": 4258093120200,
        "recipient": "Apba2kQp8U1Rq1K-0YaX0M4POgaC8d0jEGRzIx0vMQQ",
        "qty": 260416,
        "lockLength": 262800
      },
      {
        "status": "active",
        "type": "mintLocked",
        "note": "(#4) Private Investor 24-Month Mint Lock",
        "yays": 0,
        "nays": 0,
        "voted": [],
        "start": 589789,
        "totalWeight": 4258093120200,
        "recipient": "Apba2kQp8U1Rq1K-0YaX0M4POgaC8d0jEGRzIx0vMQQ",
        "qty": 260417,
        "lockLength": 525600
      },
      {
        "status": "active",
        "type": "mintLocked",
        "note": "(#4) Private Investor 18-Month Mint Lock",
        "yays": 0,
        "nays": 0,
        "voted": [],
        "start": 589789,
        "totalWeight": 4258093120200,
        "recipient": "Apba2kQp8U1Rq1K-0YaX0M4POgaC8d0jEGRzIx0vMQQ",
        "qty": 260417,
        "lockLength": 394200
      },
      {
        "status": "active",
        "type": "mintLocked",
        "note": "(#3) Private Investor 24-Month Mint Lock",
        "yays": 0,
        "nays": 0,
        "voted": [],
        "start": 589788,
        "totalWeight": 4258093120200,
        "recipient": "VOVgJ8yrpsYTHxI4ElnQfja49J_bT4urMufJPcfLvmg",
        "qty": 625000,
        "lockLength": 525600
      },
      {
        "status": "active",
        "type": "mintLocked",
        "note": "(#3) Private Investor 12-Month Mint Lock",
        "yays": 0,
        "nays": 0,
        "voted": [],
        "start": 589786,
        "totalWeight": 4258093120200,
        "recipient": "VOVgJ8yrpsYTHxI4ElnQfja49J_bT4urMufJPcfLvmg",
        "qty": 625000,
        "lockLength": 262800
      },
      {
        "status": "active",
        "type": "mintLocked",
        "note": "(#3) Private Investor 18-Month Mint Lock",
        "yays": 0,
        "nays": 0,
        "voted": [],
        "start": 589786,
        "totalWeight": 4258093120200,
        "recipient": "VOVgJ8yrpsYTHxI4ElnQfja49J_bT4urMufJPcfLvmg",
        "qty": 625000,
        "lockLength": 394200
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#3) Private Investor 24-Month Mint Lock",
        "yays": 1051200000000,
        "nays": 0,
        "voted": [
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 584556,
        "totalWeight": 4258093120200,
        "recipient": "VOVgJ8yrpsYTHxI4ElnQfja49J_bT4urMufJPcfLvmg",
        "qty": 625000,
        "lockLength": 525600
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#3) Private Investor 18-Month Mint Lock",
        "yays": 1051200000000,
        "nays": 0,
        "voted": [
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 584556,
        "totalWeight": 4258093120200,
        "recipient": "VOVgJ8yrpsYTHxI4ElnQfja49J_bT4urMufJPcfLvmg",
        "qty": 625000,
        "lockLength": 394200
      },
      {
        "status": "quorumFailed",
        "type": "mintLocked",
        "note": "(#3) Private Investor 12-Month Mint Lock",
        "yays": 1051200000000,
        "nays": 0,
        "voted": [
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 584556,
        "totalWeight": 4258093120200,
        "recipient": "VOVgJ8yrpsYTHxI4ElnQfja49J_bT4urMufJPcfLvmg",
        "qty": 625000,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#2) Private Investor 18-Month Mint Lock",
        "yays": 1051200000000,
        "nays": 0,
        "voted": [
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 579282,
        "totalWeight": 1055217988800,
        "recipient": "3kN6ZCAWshR2RuSksjHavXJZqh7ZwRamFQlKYSP70ao",
        "qty": 625000,
        "lockLength": 394200
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#2) Private Investor 24-Month Mint Lock",
        "yays": 1051200000000,
        "nays": 0,
        "voted": [
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 579282,
        "totalWeight": 1055217988800,
        "recipient": "3kN6ZCAWshR2RuSksjHavXJZqh7ZwRamFQlKYSP70ao",
        "qty": 625000,
        "lockLength": 525600
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#2) Private Investor 12-Month Mint Lock",
        "yays": 1051200000000,
        "nays": 0,
        "voted": [
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 579281,
        "totalWeight": 1055217988800,
        "recipient": "3kN6ZCAWshR2RuSksjHavXJZqh7ZwRamFQlKYSP70ao",
        "qty": 625000,
        "lockLength": 262800
      },
      {
        "status": "passed",
        "type": "set",
        "note": "Set the community description",
        "yays": 1051200000000,
        "nays": 0,
        "voted": [
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 578654,
        "totalWeight": 1055217988800,
        "key": "communityDescription",
        "value": "A decentralized token exchange protocol on Arweave."
      },
      {
        "status": "passed",
        "type": "set",
        "note": "Set the community logo",
        "yays": 1051200000000,
        "nays": 0,
        "voted": [
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 578652,
        "totalWeight": 1055217988800,
        "key": "communityLogo",
        "value": "9CYPS85KChE_zQxNLi2y5r2FLG-YE6HiphYYTlgtrtg"
      },
      {
        "status": "passed",
        "type": "set",
        "note": "Set the community Discord link",
        "yays": 1051200000000,
        "nays": 0,
        "voted": [
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 578652,
        "totalWeight": 1055217988800,
        "key": "communityDiscussionLinks",
        "value": [
          "https://verto.exchange/chat"
        ]
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#1) Private Investor 18-Month Mint Lock",
        "yays": 1051200000000,
        "nays": 0,
        "voted": [
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 578638,
        "totalWeight": 1055217988800,
        "recipient": "jTA8_iBEM8wkjWRdPIneXa2tJW9mDAV59-ZHIb5KXsU",
        "qty": 2083333,
        "lockLength": 394200
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#1) Private Investor 24-Month Mint Lock",
        "yays": 1051200000000,
        "nays": 0,
        "voted": [
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 578638,
        "totalWeight": 1055217988800,
        "recipient": "jTA8_iBEM8wkjWRdPIneXa2tJW9mDAV59-ZHIb5KXsU",
        "qty": 2083334,
        "lockLength": 525600
      },
      {
        "status": "passed",
        "type": "mintLocked",
        "note": "(#1) Private Investor 12-Month Mint Lock",
        "yays": 1051200000000,
        "nays": 0,
        "voted": [
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 578637,
        "totalWeight": 1055217988800,
        "recipient": "jTA8_iBEM8wkjWRdPIneXa2tJW9mDAV59-ZHIb5KXsU",
        "qty": 2083333,
        "lockLength": 262800
      },
      {
        "status": "quorumFailed",
        "type": "set",
        "note": "Adding the Verto logo",
        "yays": 0,
        "nays": 0,
        "voted": [],
        "start": 552581,
        "totalWeight": 1055217988800,
        "key": "communityLogo",
        "value": "lD6n95Kf1V8kVSU99MSJeX7wLycpm0JLKnU0IEMWtl8"
      },
      {
        "status": "quorumFailed",
        "type": "set",
        "note": "Adding the Discord chat link",
        "yays": 0,
        "nays": 0,
        "voted": [],
        "start": 552580,
        "totalWeight": 1055217988800,
        "key": "communityDiscussionLinks",
        "value": [
          "https://verto.exchange/chat"
        ]
      },
      {
        "status": "quorumFailed",
        "type": "set",
        "note": "Adding the description",
        "yays": 0,
        "nays": 0,
        "voted": [],
        "start": 552580,
        "totalWeight": 1055217988800,
        "key": "communityDescription",
        "value": "🦔 A decentralized PST exchange for Arweave"
      },
      {
        "status": "passed",
        "type": "set",
        "note": "Adding the application url",
        "yays": 1051200000000,
        "nays": 0,
        "voted": [
          "pvPWBZ8A5HLpGSEfhEmK1A3PfMgB_an8vVS6L14Hsls"
        ],
        "start": 552578,
        "totalWeight": 1055217988800,
        "key": "communityAppUrl",
        "value": "https://verto.exchange"
      }
    ],
    "roles": {},
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
        2160
      ],
      [
        "lockMinLength",
        129600
      ],
      [
        "lockMaxLength",
        1051200
      ],
      [
        "communityAppUrl",
        "https://verto.exchange"
      ],
      [
        "communityDiscussionLinks",
        [
          "https://verto.exchange/chat"
        ]
      ],
      [
        "communityDescription",
        "A decentralized token exchange protocol on Arweave."
      ],
      [
        "communityLogo",
        "9CYPS85KChE_zQxNLi2y5r2FLG-YE6HiphYYTlgtrtg"
      ],
      [
        "evolve",
        "40tPvYdnGiSpwgnqrS2xJ2dqSvA6h8K11HjJxMs1cbI"
      ]
    ]
  }`;

  createContract();