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
import { stringToB64Url } from 'arweave/node/lib/utils';


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

const contractSource = fs.readFileSync(path.join(__dirname, '../build/vehicle/contract.js'), "utf8");
let arweave = <Arweave>arweaveInit();

// jest.setTimeout(1200000);

/**
 * Contains all tests for the AFTR Contract
 */
describe('Test the AFTR Contract', () => {
    let arlocal = new ArLocal(PORT, false);
    let walletBuilder = new WalletGenerator(arweave);
    let master: Wallet;
    let wallet: Wallet;
    let wallets: Wallet[] = [];

    /**
     * Interface for convenience
     */
    interface TxIds {
        contractTxId: string,
        srcTxId: string
    };

    beforeAll(async () => {
        await arlocal.start();
        /**
         * Calling of arweaveInit multiple times through warpUtils
         */
        //@ts-ignore
        arweave = arweaveInit();

        master = await walletBuilder.buildWalletFromFile('test-wallet.json');
        wallets = await walletBuilder.generate(5);
        wallet = wallets[0];
    });

    /**
     * Contains tests for a Single-Owned Vehicle
     */
    describe('Single-Owned Vehicle Test Suite', () => {
        let AFTR_SINGLE_OWNED_CONTRACT_ID: string;
        let CONTRACT_SRC_ID: string;
        const singleOwnedInitState = fs.readFileSync(path.join(__dirname, './files/aftrBaseInitState-singleOwned.json'), "utf8");

        // Create the AFTR Vehicle, and store its contract ID
        beforeAll(async () => {
            const txIds: TxIds = await warpCreateContract(master.jwk, contractSource, singleOwnedInitState, undefined, true);
            AFTR_SINGLE_OWNED_CONTRACT_ID = txIds.contractTxId;
            CONTRACT_SRC_ID = txIds.srcTxId;
        })

        describe('Balance Tests', () => {
            /* test balance (MASTER) */
            it('should return the balance for a vehicle owner\'s wallet', async () => {
                const expectBal = 25000
                const input = {
                    "function": "balance",
                    "target": master.address
                };
                const res = (await warpDryWrite(master.jwk, AFTR_SINGLE_OWNED_CONTRACT_ID, input)).result;

                expect(res.target).toBe(master.address);
                expect(res.balance).toBe(expectBal);
                expect(res.vaultBal).toBe(0);
            });

            /* test balance (TARGET) */
            it('should return 0 for a non-member\'s wallet', async () => {
                const input = {
                    "function": "balance",
                    "target": wallet.address
                };
                // warpDryWrite(wallet.jwk, AFTR_CONTRACT_ID, input) returns a JSON object containing the result and the state of the vehicle
                const res = (await warpDryWrite(wallet.jwk, AFTR_SINGLE_OWNED_CONTRACT_ID, input)).result;

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
        })

        describe('Transfer Tests', () => {
            /* test transfer */
            it('should transfer tokens from Alice to Bob (non-member) within the vehicle', async () => {
                const amt = 1299;

                const alice = master;
                const bob = wallet;
                const balances = {
                    alice: await getBalance(alice, AFTR_SINGLE_OWNED_CONTRACT_ID),
                    bob: await getBalance(bob, AFTR_SINGLE_OWNED_CONTRACT_ID)
                }

                // This will automatically add bob to the vehicle if he is not a member
                const input = {
                    "function": "transfer",
                    "target": bob.address,
                    "qty": amt,
                }
                // Write the transaction
                const result = await warpWrite(alice.jwk, AFTR_SINGLE_OWNED_CONTRACT_ID, input);

                expect(await getBalance(alice, AFTR_SINGLE_OWNED_CONTRACT_ID)).toBe(balances.alice - amt);
                expect(await getBalance(bob, AFTR_SINGLE_OWNED_CONTRACT_ID)).toBe(balances.bob + amt);
            });
        });

        describe('Propose Tests', () => {
            describe('Settings Tests', () => {
                /* test set quorum */
                it('should set the quorum of the vehicl to 0.51', async () => {
                    const quorum = 0.51;
                    const input = {
                        "function": "propose",
                        "type": "set",
                        "key": "settings.quorum",
                        "value": quorum
                    };
                    const result = await warpWrite(master.jwk, AFTR_SINGLE_OWNED_CONTRACT_ID, input);
                    const state = (await warpRead(AFTR_SINGLE_OWNED_CONTRACT_ID)).state;
                    const settings = new Map(state.settings);
                    expect(settings.get('quorum')).toBe(0.51);
                });
            });
            describe('Mint Tests', () => {
                it('should mint 400000 tokens to the vehicle owner', async () => {
                    const oldBal = await getBalance(master, AFTR_SINGLE_OWNED_CONTRACT_ID);
                    const mintAmt = 400000;

                    const input = {
                        "function": "propose",
                        "type": "mint",
                        "recipient": master.address,
                        "qty": mintAmt
                    };
                    const result = await warpWrite(master.jwk, AFTR_SINGLE_OWNED_CONTRACT_ID, input);
                    const state = (await warpRead(AFTR_SINGLE_OWNED_CONTRACT_ID)).state;
                    const balance = state.balances[master.address];

                    expect(balance).toBe(oldBal + mintAmt);
                });
            });
            describe('Add Member Tests', () => {
                it('should add a new member to the vehicle and mint them 9000 tokens', async () => {
                    const newMember = wallets[1];
                    const mintAmt = 9000;

                    const input = {
                        "function": "propose",
                        "type": "addMember",
                        "recipient": newMember.address,
                        "qty": mintAmt
                    };
                    const result = await warpWrite(master.jwk, AFTR_SINGLE_OWNED_CONTRACT_ID, input);
                    const state = (await warpRead(AFTR_SINGLE_OWNED_CONTRACT_ID)).state;
                    const balance = state.balances[newMember.address];

                    expect(mintAmt > 0).toBeTruthy()
                    expect(balance).toBe(mintAmt)
                });
            });
            describe('Remove Member Tests', () => {
                it('should remove a member from the vehicle', async () => {
                    const member = wallets[1];

                    const input = {
                        "function": "propose",
                        "type": "removeMember",
                        "recipient": member.address
                    };
                    const result = await warpWrite(master.jwk, AFTR_SINGLE_OWNED_CONTRACT_ID, input);
                    const state = (await warpRead(AFTR_SINGLE_OWNED_CONTRACT_ID)).state;
                    const balance = state.balances[member.address];

                    console.log(state.balances);


                    expect(balance).toBe(0)
                });
            });
        });
    });

    /**
     * Contains tests for a DAO-Owned Vehicle
     */
    describe("DAO-Owned Vehicle Test Suite", () => {
        let AFTR_DAO_OWNED_CONTRACT_ID: string;
        let CONTRACT_SRC_ID: string;
        const daoOwnedInitState = fs.readFileSync(path.join(__dirname, './files/aftrBaseInitState-daoOwned.json'), "utf8");

        // Create the AFTR Vehicle, and store its contract ID
        beforeAll(async () => {
            let txIds: TxIds = await warpCreateContract(master.jwk, contractSource, daoOwnedInitState, undefined, true);
            AFTR_DAO_OWNED_CONTRACT_ID = txIds.contractTxId;
            CONTRACT_SRC_ID = txIds.srcTxId;
        });

        describe('Balance Tests', () => {
            it('should return the balance for a vehicle owner\'s wallet', async () => {
                const expectBal = 25000
                let input = {
                    "function": "balance",
                    "target": master.address
                };
                let res = (await warpDryWrite(master.jwk, AFTR_DAO_OWNED_CONTRACT_ID, input)).result;
                console.log(res)

                expect(res.target).toBe(master.address);
                expect(res.balance).toBe(expectBal);
                expect(res.vaultBal).toBe(0);
            });
        });

        describe('Propose Tests', () => {
            it('should propose a vote to the DAO-OWNED vehicle', async () => {
                let quorum = 0.51
                let input = {
                    "function": "propose",
                    "type": "set",
                    "key": "settings.quorum",
                    "value": quorum
                }
                let result = await warpWrite(master.jwk, AFTR_DAO_OWNED_CONTRACT_ID, input);
                let state = (await warpRead(AFTR_DAO_OWNED_CONTRACT_ID)).state;

                let votes = state.votes;
                let voteSet = votes[0];
                expect(voteSet.type == 'set'
                    && voteSet.key == 'settings.quorum'
                    && voteSet.value == quorum).toBeTruthy()

                let settings = new Map(state.settings);
                expect(settings.get('quorum') != quorum).toBeTruthy();
            });
        })

    })

    afterAll(async () => {
        // After we are done with our tests, let's close the connection.
        await arlocal.stop();
    });

    async function getBalance(wallet: Wallet, vehicleContractId: string): Promise<number> {
        let input = {
            "function": "balance",
            "target": wallet.address
        };
        let res = (await warpDryWrite(wallet.jwk, vehicleContractId, input)).result;
        return res.balance;
    }
});



