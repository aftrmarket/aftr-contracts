import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from "arweave/node/lib/wallet";
import { PstState, Warp, PstContract, LoggerFactory, WarpFactory } from 'warp-contracts';
import fs from 'fs';
import fsAsync from 'fs/promises';
import path from 'path';
import request from 'supertest';

import { warpInit, warpRead, warpWrite, warpDryWrite, warpCreateContract, warpCreateFromTx, arweaveInit } from './utils/warpUtils';


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
let port = 1999;
// jest.setTimeout(1200000);


describe("Test the AFTR Contract", () => {
    let AFTR_CONTRACT_ID: string;
    let AFTR_SRC_ID: string;

    let wallet: {
        address: string;
        jwk: JWKInterface | undefined;
    } = {
        address: "",
        jwk: undefined
    };

    beforeAll(async () => {
        arlocal = new ArLocal(port);
        // Start is a Promise, we need to start it inside an async function.
        await arlocal.start();

        //@ts-ignore
        arweave = arweaveInit();

        wallet.jwk = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-wallet.json'), 'utf-8'));
        wallet.address = await arweave.wallets.jwkToAddress(wallet.jwk);

        // Give wallet a balance
        const server = "http://localhost:" + port;
        const route = '/mint/' + wallet.address + '/100000000000000';     // Amount in Winstons
        const mintRes = await request(server).get(route);

        // Create the AFTR vehicles
        const contractSource = fs.readFileSync(path.join(__dirname, '../build/vehicle/contract.js'), "utf8");
        const initState = fs.readFileSync(path.join(__dirname, './files/aftrBaseInitState.json'), "utf8");

        let txIds = await warpCreateContract(wallet.jwk, contractSource, initState, undefined, true);

        AFTR_CONTRACT_ID = txIds.contractTxId;
        AFTR_SRC_ID = txIds.srcTxId;
    })

    afterAll(async () => {
        // After we are done with our tests, let's close the connection.
        await arlocal.stop();
    })

    /* test_balance */
    it('should return balance for target address', async () => {
        const input = {
            "function": "balance",
            "target": wallet.address
        };

        const res = await warpDryWrite(wallet.jwk, AFTR_CONTRACT_ID, input);
        console.log(res);
        expect(res.result.target).toBe("bAJYgxGXt9KE4g8H7l7u80iFaBIgzpUQNUgycJby0lU");
        expect(res.result.balance).toBe(25000);
        expect(res.result.vaultBal).toBe(0);
    })

});
