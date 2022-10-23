import { WarpFactory } from "warp-contracts";
import path from 'path';
import fs from 'fs';

const __dirname = path.resolve();
const contractId = "CBDvtZQ3wxgg7Jg3iQygjthrEQMxMDT3Zw4W7c4aQ1A";
const pstId = "CBDvtZQ3wxgg7Jg3iQygjthrEQMxMDT3Zw4W7c4aQ1A";
const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json')));
async function warpTest() {
    const warp = WarpFactory.forLocal();
    let contract = warp.contract(pstId).setEvaluationOptions( { internalWrites: true }).connect(wallet);


    // 1. Setup Claim on PST
    const inputAllow = {
        function: "allow",
        target: contractId,
        qty: 1
    };
    const allowTxId = await contract.writeInteraction(inputAllow);
    console.log("*** allowTxId: " + allowTxId.originalTxId);

    contract = warp.contract(contractId).setEvaluationOptions( { internalWrites: true }).connect(wallet);

    // 2. Claim tokens
    const inputDep = {
        function: "deposit",
        tokenId: pstId,
        qty: 1,
        txID: allowTxId.originalTxId
    };

    const depTxId = await contract.writeInteraction(inputDep);
    console.log("*** depTxId: " + depTxId.originalTxId);

    // const input = {
    //     function: 'deposit',
    //     type: 'set',
    //     key: 'owner',
    //     value: "1234"
    // };
    // const { originalTxId } = await contract.writeInteraction(input);
    // console.log(originalTxId);
}

await warpTest();