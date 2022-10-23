import Arweave from 'arweave';
import { createContractFromTx, readContract, interactWrite, interactRead, interactWriteDryRun } from 'smartweave';
import { executeContract } from '@three-em/js';
import path from 'path';
import fs, { read } from 'fs';

/** MODIFIED TO USE 3EM TO EVALUATE CONTRACTS */

/******* MODIFY INPUTS */

const contractIdSource = "ZjoRUDVaxc_dBLGozlN_hU_ucnadgzEQEL7O-xNWMe0";
const contractIdTarget = "qeR-QeMZE24KYzoAqUfdfeRE6M_jUHKiSla9nxhuPDM"; 
const contractSourceAftr = "n4RxIT-IGhI8G4kBkOT2W3w1IrRiHSQRv_sGw0FKNiE";

const walletAddr = "ewTkY6Mytg6C0AtYU6QlkEg1oH-9J2PPS0CM83RL9rk";

const input1 = { 
        function: "invoke",
        foreignContract: contractIdTarget,
        invocation: "{'function': 'transfer', 'target': '" + walletAddr + "', 'qty': 1}"
};

const input2 = {
    function: "readOutbox",
    contract: contractIdSource
};


const inputTransfer = {
    function: "transfer",
    target: contractIdBH,
    qty: 9095
};


// const input = {
//     "function": "propose",
//     "type": "set",
//     "recipient": "",
//     "target": "",
//     "qty": 0,
//     "key": "name",
//     "value": "Joe Chill",
//     "note": ""
//   }

// const input = {
//     function: 'propose',
//     type: 'set',
//     recipient: '',
//     target: '',
//     qty: 0,
//     key: 'ownership',
//     value: 'dao',
//     note: ''
// };
// const input = {
//       "function": "multiInteraction",
//       "type": "set",
//       "recipient": "",
//       "target": "",
//       "qty": 0,
//       "key": "multi",
//       "value": "",
//       "note": "Multi-Interaction",
//       "actions": [
//         {
//           "input": {
//             "function": "propose",
//             "type": "set",
//             "key": "votingSystem",
//             "value": "equal"
//           }
//         },
//         {
//           "input": {
//             "function": "propose",
//             "type": "set",
//             "key": "settings.quorum",
//             "value": ".55"
//           }
//         },
//         {
//           "input": {
//             "function": "propose",
//             "type": "set",
//             "key": "settings.voteLength",
//             "value": "3000"
//           }
//         }
//       ]
//   };

/******* MODIFY INPUTS */

const arweave = Arweave.init({
    host: process.env.ARWEAVE_HOST,
    protocol: process.env.ARWEAVE_PROTOCOL,
    port: process.env.ARWEAVE_PORT,
    logging: true
});

const __dirname = path.resolve();
const mine = () => arweave.api.get("mine");

async function testInput() {
    const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json')));  
    const addr = await arweave.wallets.jwkToAddress(wallet);
    
    await mine();

    //let txId = await interactWriteDryRun(arweave, wallet, contractIdVerto, inputTransfer);
    let vertoTxId = await interactWrite(arweave, wallet, contractIdVerto, inputTransfer);
    console.log("Transfer Verto = " + JSON.stringify(vertoTxId));

    // let txId = await interactWrite(arweave, wallet, contractIdBH, input);
    // console.log("Vehicle Change = " + JSON.stringify(txId));

    await mine();

    // arweave.transactions.getStatus("IghBfQhyPEFNDfJCledlQYCCIwyPmAeykUKMpDMFUtA").then(res => {
    //     console.log(res);
    // })

    //let contractSourceIdVerto = getContractSourceId(contractIdVerto);

    const inputDeposit = {
        function: 'deposit',
        tokenId: contractIdVerto,
        txId: vertoTxId
    };

    let txId = await interactWrite(arweave, wallet, contractIdBH, inputDeposit);
    console.log(txId);
    // console.log("Deposit BH = " + JSON.stringify(txId));

    await mine();

    console.log("READ CONTRACT...");
    //let vehicle = await readContract(arweave, contractIdBH, undefined, true);
    let vehicle = await executeContract(contractIdBH);
    console.log(JSON.stringify(vehicle));
}

async function testFcp() {
    const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json')));  
    const addr = await arweave.wallets.jwkToAddress(wallet);

    let txid = await interactWrite(arweave, wallet, contractIdSource, input1);
    await mine();

    // arweave.transactions.getStatus("IghBfQhyPEFNDfJCledlQYCCIwyPmAeykUKMpDMFUtA").then(res => {
    //     console.log(res);
    // })

    //let contractSourceIdVerto = getContractSourceId(contractIdVerto);

    let txId = await interactWrite(arweave, wallet, contractIdTarget, input2);
    await mine();

    let vehicle = readContract(arweave, contractIdTarget, undefined, true);
    console.log(JSON.stringify(vehicle)); 
}

async function readTags(coolTag) {
    let tx = await arweave.transactions.get(coolTag);

    tx.get('tags').forEach(tag => {
        let key = tag.get('name', {decode: true, string: true});
        let value = tag.get('value', {decode: true, string: true});
        console.log(`${key} : ${value}`);    
    })
}

async function readOut(contractId) {
    console.log("READ CONTRACT...");
    let vehicle = await readContract(arweave, contractId, undefined, true);
    console.log(JSON.stringify(vehicle));
    //console.log("3EM *********");
    //await rt.executeContract(contractIdBH);
    //console.log(JSON.stringify(rt.state));
    // console.log("Name: " + vehicle.name);
    // console.log("Ticker: " + vehicle.ticker);
    // console.log("Vehicle: " + JSON.stringify(vehicle));
}

async function getContractSourceId(txId) {
    let tx = await arweave.transactions.get(txId);
    let allTags = [];
    tx.get('tags').forEach(tag => {
        let key = tag.get('name', {decode: true, string: true});
        let value = tag.get('value', {decode: true, string: true});
        allTags.push({
            key,
            value
        });
    });
    for (let i = 0; i < allTags.length; i++) {
        if (allTags[i].key === 'Contract-Src') {
            console.log(`${allTags[i].key} : ${allTags[i].value}`); 
            return allTags[i].value;
        }
    }
}

async function createVehicle() {
    const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json')));  
    const addr = await arweave.wallets.jwkToAddress(wallet);

    const vehicle = {
        "name": "TEST Vehicle",
        "ticker": "TEST",
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
            "communityDescription",
            ""
          ],
          [
            "communityLogo",
            ""
          ]
        ],
        "owner": "ewTkY6Mytg6C0AtYU6QlkEg1oH-9J2PPS0CM83RL9rk",
        "lockPeriod": 0,
        "ownership": "single",
        "votingSystem": "equal",
        "status": "stopped",
        "vault": {},
        "votes": [],
        "tipsAr": 0,
        "tipsMisc": 0,
        "treasury": 0,
        "balances": {
          "ewTkY6Mytg6C0AtYU6QlkEg1oH-9J2PPS0CM83RL9rk": 1000
        },
        "tokens": [],
        "interactions": [],
        "foreignCalls": []
      };
    const initTags = [{ name: "Protocol", value: "AFTR-BETA" }];
    
    await mine();

    const txid = await createContractFromTx(
        arweave, wallet, contractSourceAftr, JSON.stringify(vehicle), initTags
    );

    await mine();

    console.log("READING CONTRACT...");

    let result = await readContract(arweave, txid);

    console.log(JSON.stringify(result));

}

//testInput();
//readTags(contractIdVerto);
//readOut(contractIdBH);
//createVehicle();
testFcp();