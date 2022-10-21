import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { fuzz, Fuzzers } from 'arweave-jest-fuzzing'
import { JWKInterface } from "arweave/node/lib/wallet";
import { PstState, Warp, PstContract, LoggerFactory, WarpFactory } from 'warp-contracts';
import fs from 'fs';
import fsAsync from 'fs/promises';
import path from 'path';
import request from 'supertest';

// import { warpInit, warpRead, warpWrite, warpCreateContract, warpCreateFromTx, arweaveInit } from './utils/warpUtils';


/***
 * Setup
 *      Spin up Arlocal instance
 *      Create wallets
 *      Do the wallets need funds? minting -> localhost:1984/mint
 *      Set initState (JSON string) -> Store JSON of initStates in various stages
 *      Set source (JS)
 *      Create contracts if necessary
 * Run your tests
 *      Call contract interactions -> writeInteraction (generate a new state)
 * Assertions
 * Spin down
 */

let contractSrc: string;
let wallet: JWKInterface;
let walletAddress: string;
let initialState: PstState;
let warp: Warp;
let pst: PstContract;

let arweave: Arweave;
let arlocal: ArLocal;
let port = 1999
// jest.setTimeout(1200000);
describe("Test the AFTR Contract", () => {

    let wallet: {
        address: string;
        jwk: JWKInterface;
    } = { address: "", jwk: undefined };

    beforeAll(async () => {
        arlocal = new ArLocal(1999);
        // Start is a Promise, we need to start it inside an async function.
        await arlocal.start();

        //@ts-expect-error
        arweave = arweaveInit();

        wallet.jwk = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-wallet.json'), 'utf-8'));
        wallet.address = await arweave.wallets.jwkToAddress(wallet.jwk);
    })


    // Your tests here...

    // Give wallet a balance
    const server = "http://localhost:" + port;
    const route = '/mint/' + addr + '/100000000000000';     // Amount in Winstons
    const mintRes = await request(server).get(route);

    // Create the AFTR vehicles
    let contractSource = fs.readFileSync(path.join(__dirname, '../build/vehicle/contract.js'), "utf8");
    let initState = fs.readFileSync(path.join(__dirname, './files/aftrBaseInitState.json'), "utf8");

    let txIds = await warpCreateContract(wallet, contractSource, initState, undefined, true);

    const aftrContractId = txIds.contractTxId;
    const aftrSrcId = txIds.srcTxId;

    const input = {
        "function": "balance",
        "target": addr
    };

    const res = await warpDryWrite(wallet, aftrContractId, input);
    expect(res.result.target).toBe("bAJYgxGXt9KE4g8H7l7u80iFaBIgzpUQNUgycJby0lU");

    //{ result: { target: "", balance: 0, vaultBal: 0 } }
    // const id = result.result.target;
    // const balance = result.result.balance;
    // const vaultBal = result.result.vaultBal;

    // const balance = result.keys[1];
    // const locked = result.keys[2];
    // After we are done with our tests, let's close the connection.


    await arlocal.stop();
    // expect(balance).toBe(25000);
    // expect(vaultBal).toBe(0);

});

function warpInit() {
    let warp = {};

    try {
        const arweave = arweaveInit();
        //@ts-expect-error
        warp = WarpFactory.forLocal(port, arweave);
    } catch (e) {
        console.log(e);
    }
    return warp;
};

async function warpRead(contractId, internalWrites = true) {
    const warp = warpInit();

    try {
        //@ts-expect-error
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

async function warpWrite(wallet, contractId, input, internalWrites = true, bundling = true) {
    const warp = warpInit();
    try {
        //@ts-expect-error
        const contract = warp.contract(contractId)
            .setEvaluationOptions({
                internalWrites: internalWrites,
                disableBundling: !bundling
            })
            .connect(wallet);
        const { originalTxId } = await contract.writeInteraction(input);
        return originalTxId;
    } catch (e) {
        console.log(e);
        return "";
    }
};
async function warpDryWrite(wallet, contractId, input, internalWrites = true, bundling = true) {
    const warp = warpInit();
    try {
        //@ts-expect-error
        const contract = warp.contract(contractId)
            .setEvaluationOptions({
                internalWrites: internalWrites,
                disableBundling: !bundling
            })
            .connect(wallet);
        const state = await contract.dryWrite(input);
        return state;
    } catch (e) {
        console.log(e);
        return "";
    }
};

async function warpCreateContract(wallet, source, initState, currentTags = undefined, aftr = false) {
    /*** 
     * Returns:
     * { contractTxId: string, srcTxId: string }
     */

    let tags = addTags(currentTags, aftr);
    const warp = warpInit();
    try {
        //@ts-expect-error
        let txIds = await warp.createContract.deploy({
            wallet: wallet,
            initState: initState,
            src: source,
            tags
        });
        return txIds;
    } catch (e) {
        console.log("ERROR deploying AFTR contract: " + e);
        return {};
    }
};

async function warpCreateFromTx(wallet, initState, srcId, currentTags = undefined, aftr = false) {
    /*** 
     * Returns:
     * { contractTxId: string, srcTxId: string }
     */

    let tags = addTags(currentTags, aftr);

    const warp = warpInit();
    try {
        //@ts-expect-error
        let txIds = await warp.createContract.deployFromSourceTx({
            wallet: wallet,
            initState: initState,
            srcTxId: srcId,
            tags
        });
        return txIds;
    } catch (e) {
        console.log("ERROR deploying AFTR contract: " + e);
        return {};
    }
};

function arweaveInit() {
    let arweave = {};
    try {
        arweave = Arweave.init({
            host: "localhost",
            port: port,
            protocol: "http",
            timeout: 20000,
            logging: true,
        });
    } catch (e) {
        console.log(e);
    }
    return arweave;
};

function addTags(currentTags, aftr = false) {
    let tags = [];
    if (currentTags) {
        tags = currentTags;
    }
    if (aftr) {
        tags.push({ name: "Protocol", value: "AFTR" });
        tags.push({ name: "Implements", value: ["ANS-110"] });
        tags.push({ name: "Type", value: ["token", "vehicle"] });
    }

    return tags;
};