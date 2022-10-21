import { WarpFactory } from "warp-contracts";
import path from 'path';
import fs from 'fs';

const __dirname = path.resolve();
const contractId = "QcERUuU3hoygsIa3laD5_0n0MBzGsWaeNSh-FF4qgYs";
const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json')));
async function warpTest() {
    const warp = WarpFactory.forLocal();
    const contract = warp.contract(contractId).setEvaluationOptions( { internalWrites: true }).connect(wallet);


    // 1. Setup Claim
    const inputAllow = {
        function: "allow",
        target: contractId,
        qty: 1
    };
    const allowTxId = await contract.writeInteraction(inputAllow);
    console.log(allowTxId);

    // 2. Claim tokens
    const inputDep = {
        function: "deposit",
        tokenId: contractId,
        qty: 1,
        txID: allowTxId
    };

    const depTxId = await contract.writeInteraction(inputDep);
    console.log(depTxId);

    // const input = {
    //     function: 'deposit',
    //     type: 'set',
    //     key: 'creator',
    //     value: "1234"
    // };
    // const { originalTxId } = await contract.writeInteraction(input);
    // console.log(originalTxId);
}

await warpTest();