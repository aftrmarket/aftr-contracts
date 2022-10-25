import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from "arweave/node/lib/wallet";
import { PstState, Warp, PstContract, LoggerFactory, WarpFactory } from 'warp-contracts';
import fs from 'fs';
import fsAsync from 'fs/promises';
import path from 'path';
import request from 'supertest';

import { warpInit, warpRead, warpWrite, warpDryWrite, warpCreateContract, warpCreateFromTx, arweaveInit } from './utils/warpUtils';
import { Wallet, WalletGenerator } from './utils/walletUtils';


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
let initialState: PstState;
let warp: Warp;
let pst: PstContract;

let arweave: Arweave;
let arlocal: ArLocal;
let port = 1999;
let walletGenerator: WalletGenerator;

// jest.setTimeout(1200000);


describe("Test the AFTR Contract", () => {
    let AFTR_CONTRACT_ID: string;
    let AFTR_SRC_ID: string;
    let wallets: Wallet[] = [];
    let wallet: Wallet;

    beforeAll(async () => {
        arlocal = new ArLocal(port);
        // Start is a Promise, we need to start it inside an async function.
        await arlocal.start();

        //@ts-ignore
        arweave = arweaveInit();
        walletGenerator = new WalletGenerator(arweave);

        // wallet.jwk = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-wallet.json'), 'utf-8'));
        // wallet.address = await arweave.wallets.jwkToAddress(wallet.jwk);
        wallets = await walletGenerator.generate();
        wallet = wallets[0];

        console.log(wallets);


        // Give wallet a balance
        const server = "http://localhost:" + port;
        const route = '/mint/' + wallet.address + '/100000000000000';     // Amount in Winstons
        const mintRes = await request(server).get(route);

        console.log(wallet.jwk);

        // Create the AFTR vehicles
        const contractSource = fs.readFileSync(path.join(__dirname, '../build/vehicle/contract.js'), "utf8");
        const initState = fs.readFileSync(path.join(__dirname, './files/aftrBaseInitState.json'), "utf8");

        let txIds = await warpCreateContract(wallet.jwk, contractSource, initState, undefined, true);

        AFTR_CONTRACT_ID = txIds.contractTxId;
        AFTR_SRC_ID = txIds.srcTxId;
    });

    afterAll(async () => {
        // After we are done with our tests, let's close the connection.
        await arlocal.stop();
    });

    /* test_balance */
    it('should return balance result for target address', async () => {
        let input = {
            "function": "balance",
            "target": wallet.address
        };
        // warpDryWrite(wallet.jwk, AFTR_CONTRACT_ID, input) returns a JSON object containing the result and the state of the vehicle
        let res = (await warpDryWrite(wallet.jwk, AFTR_CONTRACT_ID, input)).result;
        console.log(res);
        expect(res.target).toBe(wallet.address);
        expect(res.balance).toBe(0);
        expect(res.vaultBal).toBe(0);

        /* < Testing no address ? > */
        // input.target = ""
        // try {
        //     res = await warpDryWrite(wallet.jwk, AFTR_CONTRACT_ID, input);
        // } catch (e) {
        //     console.log(e);
        // }
        // console.log("newRes: " + res.result);
    });

    it('should transfer tokens from Alice to Bob', async () => {
        let input = {
            "function": "transfer",
            "target": "",
            "qty": 1,
        }
    })

});