import Arweave from 'arweave';
import { createContractFromTx, readContract, interactWrite, interactRead, interactWriteDryRun } from 'smartweave';
import path from 'path';
import fs from 'fs';

/******* MODIFY INPUTS */

const contractId = "lpzmKDo3zLkSiTYPHUzk7MxSg7l9bFI-rNH1AQB-r8A";
const input = { 
        function: 'balance',
        target: 'abd7DMW1A8-XiGUVn5qxHLseNhkJ5C1Cxjjbj6XC3M8'
}

/******* MODIFY INPUTS */

const arweave = Arweave.init({
    host: process.env.ARWEAVE_HOST,
    protocol: process.env.ARWEAVE_PROTOCOL,
    port: process.env.ARWEAVE_PORT,
    logging: true
});

const __dirname = path.resolve();

async function test() {
    //let vehicle = await readContract(arweave, contractId);
    const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json')));
    //let vehicle = await interactRead(arweave, wallet, contractId, input);
    let vehicle = await interactWrite(arweave, wallet, contractId, input);

    //console.log(await readContract(arweave, contractId));

    console.log("VEHICLE: " + JSON.stringify(vehicle));
}

test();