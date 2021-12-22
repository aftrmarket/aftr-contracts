import Arweave from 'arweave';
import { createContractFromTx, readContract, interactWrite, interactRead, interactWriteDryRun } from 'smartweave';
import path from 'path';
import fs from 'fs';

/******* MODIFY INPUTS */

const input = {
    function: 'propose',
    type: 'set',
    recipient: '',
    target: '',
    qty: 0,
    key: 'ownership',
    value: 'dao',
    note: ''
};

const contractId = "K72YqNaXhjogCH4KuxuOUJnuIVqo7Nq9VqM8xUV8sik";

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
    const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile.json')));
    const addr = await arweave.wallets.jwkToAddress(wallet);

    //let txId = await interactWriteDryRun(arweave, wallet, contractId, input);
    //let txId = await interactWrite(arweave, wallet, contractId, input);
    //console.log("RESPONSE = " + JSON.stringify(txId));

    //await mine();

    console.log("READ CONTRACT...");

    let vehicle = await readContract(arweave, contractId);
    console.log(JSON.stringify(vehicle));
}

testInput();