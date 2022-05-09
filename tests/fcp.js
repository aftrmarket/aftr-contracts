import Arweave from 'arweave';
import { createContractFromTx, createContract, readContract, interactWrite, interactRead, interactWriteDryRun } from 'smartweave';
import path from 'path';
import fs from 'fs';

/******* MODIFY INPUTS */

const contractIdSource = "e4yVjNmOkiXLCWd93uymrbLc2sKM3m8bpOSBWWSZxUs"; // Chillin
const contractIdTarget = "8UQdXTWddWcutCopXDJDRXZc4L7ivscAh6favS7A74I";
const walletAddr = "ewTkY6Mytg6C0AtYU6QlkEg1oH-9J2PPS0CM83RL9rk";

const input1 = { 
        function: "invoke",
        foreignContract: contractIdTarget,
        invocation: {
            function: "transfer",
            target: walletAddr,
            qty: 1
        }
};

const input2 = {
    function: "readOutbox",
    contract: contractIdSource
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

// Telling Chilling to transfer 1 ARHD token to your personal address
async function test() {
    const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json')));
    const addr = await arweave.wallets.jwkToAddress(wallet);

    // Call ARHD from Chillin
    let tx = await interactWrite(arweave, wallet, contractIdSource, input1);
    await mine();
    console.log("Interaction 1: " + tx);

    // Tell ARHD to readOutbox
    tx = await interactWrite(arweave, wallet, contractIdTarget, input2);
    await mine();
    console.log("Interaction 2: " + tx);

    let token = await readContract(arweave, contractIdSource, undefined, true);
    console.log("CHILL: " + JSON.stringify(token));
    token = await readContract(arweave, contractIdTarget, undefined, true);
    console.log("ARHD: " + JSON.stringify(token));
}


async function initFcp() {
    const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json')));
    const addr = await arweave.wallets.jwkToAddress(wallet);

    // Create FCP contracts
    let contractSource = fs.readFileSync(path.join(__dirname, '/tests/contracts/fcp-abc.js'), "utf8");
    let initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/fcp-abcInitState.json'), "utf8");
    let contractTxId = await createContract(arweave, wallet, contractSource, initState);
    console.log("ABC: " + contractTxId);
    contractSource = fs.readFileSync(path.join(__dirname, '/tests/contracts/fcp-def.js'), "utf8");
    initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/fcp-defInitState.json'), "utf8");
    contractTxId = await createContract(arweave, wallet, contractSource, initState);
    console.log("DEF: " + contractTxId);
    await mine();


}
//await initFcp();
await test();