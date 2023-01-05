import Arweave from 'arweave';
import request from 'supertest';
import { WarpFactory } from "warp-contracts";
import path from 'path';
import fs from 'fs';

const __dirname = path.resolve();
const contractId = "CBDvtZQ3wxgg7Jg3iQygjthrEQMxMDT3Zw4W7c4aQ1A";
const pstId = "CBDvtZQ3wxgg7Jg3iQygjthrEQMxMDT3Zw4W7c4aQ1A";
const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json')));

const arweave = Arweave.init({
    host: "localhost",
    protocol: "http",
    port: 1984
});

const initState = {
    "name" : "AFTR",
    "ticker" : "AFTR-v001",
    "balances" : {
        "abd7DMW1A8-XiGUVn5qxHLseNhkJ5C1Cxjjbj6XC3M8": 150000000,
        "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I" : 100000000,
        "ewTkY6Mytg6C0AtYU6QlkEg1oH-9J2PPS0CM83RL9rk": 1
    },
    "owner" : "ewTkY6Mytg6C0AtYU6QlkEg1oH-9J2PPS0CM83RL9rk",
    "ownership" : "single",
    "votingSystem": "weighted",
    "status" : "stopped",
    "claimable": [],
    "claims": [],
    "evolve": null,
    "settings" : [
        [ "quorum", 0.5 ],
        [ "support", 0.5],
        [ "voteLength", 2000 ],
        [ "lockMinLength", 100 ],
        [ "lockMaxLength", 10000 ],
        [ "communityAppUrl", "" ],
        [ "communityDiscussionLinks", "" ],
        [ "communityDescription", "" ],
        [ "communityLogo", ""]
    ]
};

const mine = () => arweave.api.get("mine");

async function warpTest() {
    const warp = WarpFactory.forLocal();

    // Make sure wallet has a balance
    const addr = await arweave.wallets.jwkToAddress(wallet);
    const server = "localhost:1984";
    const route = '/mint/' + addr + '/100000000000000';     // Amount in Winstons
    let balance = await arweave.wallets.getBalance(addr);
    if (balance < 10000000000000) {
        const mintRes = await request(server).get(route);
        balance = await arweave.wallets.getBalance(addr);
    }

    // Create base contract
    const contractSource = fs.readFileSync(path.join(__dirname, '/tests/contracts/evolveTestContractA.js'), "utf8");
    let txIds = await warpCreateContract(warp, wallet, contractSource, JSON.stringify(initState));
    let contractId = txIds.contractTxId;
    console.log("ContractID: " + contractId);

    // Save new source
    const evolveContractSource = fs.readFileSync(path.join(__dirname, '/tests/contracts/evolveTestContractB.js'), "utf8");
    let evolveTxId = await warpSaveNewSource(warp, wallet, contractId, evolveContractSource);
    //await mine();
    console.log("evolveTxId: " + evolveTxId);

    // Evolve contract
    let input = {
        function: "evolve",
        value: evolveTxId,
    };
    let evolveId = await warpWrite(warp, wallet, contractId, input);
    //await mine();
    console.log("Evolve ID: " + evolveId);


    // Test interaction - The new source has an 'evolveTest' function
    input = {
        function: "evolveTest"
    }
    
    let intId = await warpWrite(warp, wallet, contractId, input);
    console.log("Interaction ID: " + intId);


    console.log("STATE: " + JSON.stringify(await warpRead(warp, contractId)));
}


async function warpCreateContract(warp, wallet, source, initState) {
    try {
        let txIds = await warp.createContract.deploy({
            wallet: wallet,
            initState: initState,
            src: source
        });
        return txIds;
    } catch(e) {
        console.log("ERROR deploying AFTR contract: " + e);
        return {};
    }
};

async function warpRead(warp, contractId, internalWrites = true) {
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

async function warpWrite(warp, wallet, contractId, input, internalWrites = true, bundling = false) {
    try {
        const contract = warp.contract(contractId)
        .setEvaluationOptions({ 
            internalWrites: internalWrites,
            disableBundling: !bundling
         })
        .connect(wallet);
        const { originalTxId } = await contract.writeInteraction(input);
        //const result = await contract.dryWrite(input);
        return originalTxId;
        return result;
    } catch(e) {
        console.log(e);
        return "";
    }
};

async function warpSaveNewSource(warp, wallet, contractId, newSource) {
    try {
        //const newSrcTxId = await warp.contract.save({ src: newSource });

        const contract = warp.contract(contractId)
            .setEvaluationOptions({
                internalWrites: true
            })
            .connect(wallet);

        const newSrcTxId = await contract.save({ 
            src: newSource
        });
        return newSrcTxId;
    } catch(e) {
        console.log("ERROR saving new contract source: " + e);
        return "";
    }
    
};




await warpTest();