import ArLocal from 'arlocal';
import Arweave from 'arweave';
//import { fuzz, Fuzzers } from 'arweave-jest-fuzzing'
//import { JWKInterface } from "arweave/node/lib/wallet";
//import { PstState, Warp, PstContract, LoggerFactory, WarpFactory } from 'warp-contracts';
import fs from 'fs';
//import fsAsync from 'fs/promises';
import path from 'path';

import { warpInit, warpRead, warpWrite, warpCreateContract, warpCreateFromTx, arweaveInit } from '../__tests__/utils/warpUtils.js'


let contractSrc;
let wallet;
let walletAddress;
let initialState;
let arlocal;
let warp;
let pst;

// ArLocal
(async () => {
    const arLocal = new ArLocal(1999, false);

    // Start is a Promise, we need to start it inside an async function.
    await arLocal.start();

    // Your tests here...

    const arweave = arweaveInit();

    wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json'), 'utf-8'));
    const addr = await arweave.wallets.jwkToAddress(wallet);
    console.log(addr);

    // After we are done with our tests, let's close the connection.
    await arLocal.stop();
})();

// 

// contractSrc = fs.readFileSync(path.join(__dirname, '../build/vehicle/contract.js'), 'utf8');
// // const stateFromFile: PstState = JSON.parse(
// //     fs.readFileSync(path.join(__dirname, '../contract/test-veh.json'), 'utf8'));

// // Merges stateFromFile with { owner: walletAddress }
// initialState = {
//     ...stateFromFile,
//     ...{
//         owner: walletAddress,
//     },
// };

// const contractTxId = await warp.createContract.deploy({
//     wallet,
//     initState: JSON.stringify(initialState),
//     src: contractSrc,
// });