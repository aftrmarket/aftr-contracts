import { WarpFactory } from "warp-contracts";
import { readContract } from 'smartweave';
import Arweave from 'arweave';

import path from 'path';
import fs from 'fs';

const __dirname = path.resolve();
const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json')));

function warpInit(env = "") {
    let warp = {};
    if (env === "") {
        env = import.meta.env.VITE_ENV;
    }
    try {
        // Using Warp
        if (env === "PROD") {
            warp = WarpFactory.forMainnet();
        } else if (env === "TEST") {
            warp = WarpFactory.forTestnet();
        } else if (env === "DEV") {
            warp = WarpFactory.forLocal();
        } else {
            warp = WarpFactory.forTestnet();
        }
    } catch(e) {
        console.log(e);
    }
    return warp;
};

async function warpRead(contractId, internalWrites = true, env = "") {
    const warp = warpInit(env);

    try {
        const contract = warp.contract(contractId)
            .setEvaluationOptions({ 
                internalWrites: internalWrites,
            });
        const result = await contract.readState();
        return result.cachedValue;
    } catch (e) {
        console.log(e);
        return {};
    }
};

async function warpDryWrite(contractId, input, internalWrites = true, bundling = false, env = "", wallet) {
    const warp = warpInit(env);
    try {
        const contract = warp.contract(contractId)
        .setEvaluationOptions({ 
            internalWrites: internalWrites,
            disableBundling: !bundling
         })
        .connect(wallet);
        const result = await contract.dryWrite(input);
        return result;
    } catch(e) {
        console.log(e);
        return "";
    }
};

async function returnContractSrc(contractId, env = "TEST") {
    if (env === "DEV") {
        // Not using gateway on Arlocal
        return "";
    }

    const route = "https://gateway.warp.cc/gateway/contract?txId=" + contractId + (env === "TEST" ? "&testnet=true" : "");
    const response = await fetch(route);
    if (!response.ok) {
        console.log("returnContractSrc: ", "ERROR fetching transaction from gateway.");
        return "";
    }
    const data = await response.json();
    return data.srcTxId;

};
async function main() {
    const contractId = "b7_Y5foswLzlM8JrXBT7WT4ooLZnSOcWEKCcMPzsRDc";

    // Read with Warp
    let result = await warpRead(contractId, true, "TEST");
    console.log(JSON.stringify(result));
    // let vote = result.state.votes.find(vote => (vote.type === "evolve" && vote.value === "ZltjnWSiHr04ETayUyJivkUAMTHBYbgo3C6BnwNsHmA"));
    // console.log("VOTE STATUS: " + vote.status);

    // Read with SmartWeave
    // const arweave = Arweave.init({
    //     host: "arweave.net",
    //     protocol:  "https",
    //     port: "443"
    // });
    // result = await readContract(arweave, contractId);
    // vote = result.state.votes.find(vote => (vote.type === "evolve" && vote.value === "ZltjnWSiHr04ETayUyJivkUAMTHBYbgo3C6BnwNsHmA"));
    // console.log("VOTE STATUS: " + vote.status);

    // const contractSrc = await returnContractSrc(contractId, "TEST");
    // console.log("CONTRACT SOURCE: " + contractSrc);

    // const input = {
    //     function: 'propose',
    //     type: 'set',
    //     key: 'settings.custom1',
    //     value: "TEST"
    // }
    // const result = await warpDryWrite(contractId, input, true, undefined, "TEST", wallet);
    // const vote = result.state.votes.find(vote => vote.id === "1100752celZ0EaFF8uA8SCawX-aCCCsBFC3oHS4aBx5VFUebdY2");
    // // console.log(JSON.stringify(result));
    // console.log("VOTE STATUS: " + vote.status);
    // console.log("EVOLVE: " + result.state.evolve);
}

main();