import Arweave from 'arweave';
import { createContractFromTx, readContract, interactWrite, interactRead, interactWriteDryRun } from 'smartweave';
import path from 'path';
import fs, { read } from 'fs';

/******* MODIFY INPUTS */

const contractIdBH = "2lcSq_k36DeM62JqZoRzDiaMCW4pDuHsAPELcop3kGA";
const contractIdVerto = "qdn_eAblcIWHJs2NgQ1UabD92pcbxqwR649AG-EWHCk"; 

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
    let vehicle = await readContract(arweave, contractIdBH, undefined, true);
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

testInput();
//readTags(contractIdVerto);
//readOut(contractIdBH);