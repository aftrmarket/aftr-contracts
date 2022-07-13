import Arweave from 'arweave';
import { createContractFromTx, readContract, interactWrite, interactRead, interactWriteDryRun } from 'smartweave';
import path from 'path';
import fs, { read } from 'fs';

const contractSourceAftr = "1VW2-RdW4PFsqnFOZ2qbX34hqWZGzw1nqFU28ip7n94";

const arweave = Arweave.init({
    host: process.env.ARWEAVE_HOST,
    protocol: process.env.ARWEAVE_PROTOCOL,
    port: process.env.ARWEAVE_PORT,
    logging: true
});

const __dirname = path.resolve();
const mine = () => arweave.api.get("mine");

async function test() {
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
        "creator": "ewTkY6Mytg6C0AtYU6QlkEg1oH-9J2PPS0CM83RL9rk",
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
    const initTags = [
        { name: "Protocol", value: "AFTR-BETA" },
        //{ name: "Contract-Src", value: "YOU ASS" }

    ];
    
    await mine();

    const txid = await createContractFromTx(
        arweave, wallet, contractSourceAftr, JSON.stringify(vehicle), initTags
    );

    await mine();

    console.log("READING CONTRACT...");

    let result = await readContract(arweave, txid);

    console.log(JSON.stringify(result));

    console.log("READING TAGS...");
    readTags(txid);

}

//testInput();
//readTags(contractIdVerto);
//readOut(contractIdBH);
createVehicle();