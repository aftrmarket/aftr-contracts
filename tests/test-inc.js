import Arweave from 'arweave';
import { createContractFromTx, readContract, interactWrite, interactRead, interactWriteDryRun } from 'smartweave';
import path from 'path';
import fs from 'fs';

/******* MODIFY INPUTS */

// const input = {
//     function: "increment"
// };

// const input = {
//     "function": "propose",
//     "recipient": "abd7DMW1A8-XiGUVn5qxHLseNhkJ5C1Cxjjbj6XC3M8",
//     "qty": 300,
//     "type": "burn",
//     "note": "Burn 300 for abd7DMW1A8-XiGUVn5qxHLseNhkJ5C1Cxjjbj6XC3M8"
//   }
let input = {
    "function": "balance",
    "target": "abd7DMW1A8-XiGUVn5qxHLseNhkJ5C1Cxjjbj6XC3M8"
};
const contractId = "mQgkB52ZAi7ip5a-fC8rWSs3CtnlukL3iN8_1QdNRcg";

/******* MODIFY INPUTS */

const arweave = Arweave.init({
    // host: process.env.ARWEAVE_HOST,
    // protocol: process.env.ARWEAVE_PROTOCOL,
    // port: process.env.ARWEAVE_PORT,
    // logging: true
    host: "www.arweave.run",
    protocol: "https",
    port: 443
});

const __dirname = path.resolve();
const mine = () => arweave.api.get("mine");

async function testInput() {
    const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json')));
    const addr = await arweave.wallets.jwkToAddress(wallet);

    //let txId = await interactWriteDryRun(arweave, wallet, contractId, input);
    let txId = await interactWrite(arweave, wallet, contractId, input);
    console.log("RESPONSE = " + JSON.stringify(txId));

    await mine();

    console.log("READ CONTRACT...");

    let vehicle = await readContract(arweave, contractId, undefined, true);
    console.log(JSON.stringify(vehicle));
}

testInput();