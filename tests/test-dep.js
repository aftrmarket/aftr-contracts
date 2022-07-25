import Arweave from 'arweave';
import { readContract, interactWrite, interactWriteDryRun } from 'smartweave';
import path from 'path';
import fs, { read } from 'fs';

/******* MODIFY INPUTS */

// Update these IDs after running init
const contractIdBH = "ZpQw2OGUg3MSrA9Hq_Z1B56pdJid6iVNTcATbRgLhoY";         // Blue Horizon Contract ID
const contractIdVerto = "PfQPUZGK2HXy9jOcBwtJ0vegvswoPjxaa4kbVh_sSOI";      // Verto Contract ID

const inputTransfer = {
    function: "transfer",
    target: contractIdBH,
    qty: 9095
};

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
    let vertoTxId = await interactWrite(arweave, wallet, undefined, inputTransfer);
    console.log("Transfer Verto = " + JSON.stringify(vertoTxId));

    await mine();

    const inputDeposit = {
        function: 'deposit',
        tokenId: contractIdVerto,
        txId: vertoTxId
    };

    let txId = await interactWrite(arweave, wallet, contractIdBH, inputDeposit);
    console.log(txId);

    await mine();

    console.log("READ CONTRACT...");
    let vehicle = await readContract(arweave, contractIdBH, undefined, true);
    console.log(JSON.stringify(vehicle));
}
async function testDepOnly() {
    const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json')));  
    const addr = await arweave.wallets.jwkToAddress(wallet);
    
    await mine();
let vertoTxId = "PfQPUZGK2HXy9jOcBwtJ0vegvswoPjxaa4kbVh_sSOI";
    const inputDeposit = {
        function: 'deposit',
        tokenId: undefined,
        txId: vertoTxId
    };

    let txId = await interactWrite(arweave, wallet, contractIdBH, inputDeposit);
    console.log(txId);

    await mine();

    console.log("READ CONTRACT...");
    let vehicle = await readContract(arweave, contractIdBH, undefined, true);
    console.log(JSON.stringify(vehicle));
}

testInput();
//testDepOnly();
