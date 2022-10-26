import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from "arweave/node/lib/wallet";
import { PstState, Warp, PstContract, LoggerFactory, WarpFactory } from 'warp-contracts';
import fs from 'fs';
import fsAsync from 'fs/promises';
import path from 'path';
import request from 'supertest';

import { warpInit, warpRead, warpWrite, warpDryWrite, warpCreateContract, warpCreateFromTx, arweaveInit, PORT } from './utils/warpUtils';
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

/**
 *     function: 'balance' | 'lease' | 'propose' | 'vote' | 'transfer' | 'withdrawal' | 'multiInteraction';
 */

let contractSrc: string;
let initialState: PstState;
let warp: Warp;
let pst: PstContract;

let arweave: Arweave;
let arlocal: ArLocal;
let walletBuilder: WalletGenerator;

// jest.setTimeout(1200000);

describe("Test the AFTR Contract", () => {
    let AFTR_SINGLE_OWNED_CONTRACT_ID: string;
    let AFTR_DAO_OWNED_CONTRACT_ID: string;
    let AFTR_SRC_ID: string;
    let wallets: Wallet[] = [];
    let wallet: Wallet;
    let master: Wallet;

    beforeAll(async () => {
        arlocal = new ArLocal(PORT);
        // Start is a Promise, we need to start it inside an async function.
        await arlocal.start();

        /**
         * Calling of arweaveInit multiple times through warpUtils
         */

        //@ts-ignore
        arweave = arweaveInit();
        walletBuilder = new WalletGenerator(arweave);
        master = await walletBuilder.buildWalletFromFile('test-wallet.json');

        wallets = await walletBuilder.generate();
        wallet = wallets[0];

        // Getting the balance of an Arweave wallet ...
        // let res = (await request('http://localhost:1999').get(/wallet/ + wallet.address + '/balance'));
        // console.log(res.body);

        // Create the AFTR vehicles
        const contractSource = fs.readFileSync(path.join(__dirname, '../build/vehicle/contract.js'), "utf8");
        const singleOwnedInitState = fs.readFileSync(path.join(__dirname, './files/aftrBaseInitState-singleOwned.json'), "utf8");
        const daoOwnedInitState = fs.readFileSync(path.join(__dirname, './files/aftrBaseInitState-daoOwned.json'), "utf8");

        let txIds = {
            contractTxId: "",
            srcTxId: ""
        };
        txIds = await warpCreateContract(master.jwk, contractSource, singleOwnedInitState, undefined, true);
        AFTR_SINGLE_OWNED_CONTRACT_ID = txIds.contractTxId;

        txIds = await warpCreateContract(master.jwk, contractSource, daoOwnedInitState, undefined, true);
        AFTR_DAO_OWNED_CONTRACT_ID = txIds.contractTxId;

        AFTR_SRC_ID = txIds.srcTxId;
    });

    afterAll(async () => {
        // After we are done with our tests, let's close the connection.
        await arlocal.stop();
    });

    /* test balance (MASTER) */
    it('should return balance result for MASTER address', async () => {
        let input = {
            "function": "balance",
            "target": master.address
        };
        let res = (await warpDryWrite(master.jwk, AFTR_SINGLE_OWNED_CONTRACT_ID, input)).result;

        expect(res.target).toBe(master.address);
        expect(res.balance).toBe(25000);
        expect(res.vaultBal).toBe(0);
    });

    /* test balance (TARGET) */
    it('should return balance result for TARGET address', async () => {
        let input = {
            "function": "balance",
            "target": wallet.address
        };
        // warpDryWrite(wallet.jwk, AFTR_CONTRACT_ID, input) returns a JSON object containing the result and the state of the vehicle
        let res = (await warpDryWrite(wallet.jwk, AFTR_SINGLE_OWNED_CONTRACT_ID, input)).result;
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

    /* test transfer */
    it('should transfer tokens from Alice to Bob within the vehicle', async () => {
        let wallet = wallets[0];
        let amt = 1299;

        let alice = master;
        let bob = wallet;
        let balances = {
            alice: await getBalance(alice),
            bob: await getBalance(bob)
        }

        let input = {
            "function": "transfer",
            "target": bob.address,
            "qty": amt,
        }
        // Write the transaction
        let result = await warpWrite(alice.jwk, AFTR_SINGLE_OWNED_CONTRACT_ID, input);

        expect(await getBalance(alice)).toBe(balances.alice - amt);
        expect(await getBalance(bob)).toBe(balances.bob + amt);
    });

    /* test set quorum */
    it('should set the quorum of the SINGLE-OWNED vehicle', async () => {
        let quorum = 0.51;
        let input = {
            "function": "propose",
            "type": "set",
            "key": "settings.quorum",
            "value": quorum
        }
        let result = await warpWrite(master.jwk, AFTR_SINGLE_OWNED_CONTRACT_ID, input);
        let state = (await warpRead(AFTR_SINGLE_OWNED_CONTRACT_ID)).state;

        /** 'state' object has a ... Why not a JSON obj?
         *   Why making a Map of the array
         * settings: [
            [ 'quorum', 0.5 ],
            [ 'support', 0.5 ],
            [ 'voteLength', 2000 ],
            [ 'lockMinLength', 100 ],
            [ 'lockMaxLength', 10000 ],
            [ 'communityLogo', 'nZr8RcHYY2XXloKcxtgrbssBdpvz6C2ifM92QvkYkgg' ],
            [ 'evolve', null ]
        ]
         */
        let settings = new Map(state.settings);
        expect(settings.get('quorum')).toBe(0.51);
    });

    it('', async () => {
        let quorum = 0.51
        let input = {
            "function": "propose",
            "type": "set",
            "key": "settings.quorum",
            "value": quorum
        }
        let result = await warpWrite(master.jwk, AFTR_DAO_OWNED_CONTRACT_ID, input);
        let state = (await warpRead(AFTR_DAO_OWNED_CONTRACT_ID)).state;
    });

    async function getBalance(wallet: Wallet): Promise<number> {
        let input = {
            "function": "balance",
            "target": wallet.address
        };
        let res = (await warpDryWrite(wallet.jwk, AFTR_SINGLE_OWNED_CONTRACT_ID, input)).result;
        return res.balance;
    }
});

