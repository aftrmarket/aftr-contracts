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

import { exec } from 'child_process'
import { VoteInterface } from '../contract/vehicle/faces';
import { readContract } from 'smartweave';

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
const tokenSource = fs.readFileSync(path.join(__dirname, './files/playTokenSrc.js'), "utf8")
const tokenState = fs.readFileSync(path.join(__dirname, './files/playTokenInitState.json'), "utf8")
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

    let testID = 1;
    let numTests: number;

    let TOKEN_CONTRACT_ID: string;

    /**
     * Interface for convenience
     */
    interface TxIds {
        contractTxId: string,
        srcTxId: string
    };

    beforeAll(async () => {
        exec("egrep '^\\s*it' ./__tests__/contract.test.ts | wc -l", (err, stdout, stderr) => {
            numTests = parseInt(stdout)
        })

        console.log("*** Initializing ArLocal ***");
        await arlocal.start();
        /**
         * Calling of arweaveInit multiple times through warpUtils
         */
        //@ts-ignore
        arweave = arweaveInit();

        master = await walletBuilder.buildWalletFromFile('test-wallet.json');
        // let mintTestWallet = await request('localhost:' + PORT).get('/ mint / ' + master.address + ' / 100000000000000')
        const server = "localhost:" + PORT;
        const route = '/mint/' + master.address + '/100000000000000';     // Amount in Winstons
        const mintTestWallet = await request(server).get(route);

        wallets = await walletBuilder.generate(5);
        wallet = wallets[0];

        for (const wallet of wallets) {
            const mintRes = await request(server).get(route);
        }

        const txIds: TxIds = await warpCreateContract(master.jwk, tokenSource, tokenState, undefined, false);
        TOKEN_CONTRACT_ID = txIds.contractTxId;
        // TOKEN_SRC_ID = txIds.srcTxId;
        const result = await warpRead(TOKEN_CONTRACT_ID);
        // const result = await readContract(arweave, TOKEN_CONTRACT_ID)
    });

    it('should mint all wallets some test tokens', async () => {
        const mintAmt = 50

        for (const wallet of wallets) {
            const input = {
                "function": "mint",
                "qty": mintAmt
            }
            const result = await warpWrite(wallet.jwk, TOKEN_CONTRACT_ID, input)
        }
        const state = await warpRead(TOKEN_CONTRACT_ID)
        console.log(state);
    });

    beforeEach(() => {
        console.log('*** Test #' + testID++ + '/' + numTests + ' ***');
    });

    afterEach(() => {
        expect.hasAssertions()
    })

    /**
     * Contains tests for a Single-Owned Vehicle
     */
    describe('1. Single-Owned Vehicle Test Suite', () => {
        let AFTR_SINGLE_OWNED_CONTRACT_ID: string;
        let CONTRACT_SRC_ID: string;
        const singleOwnedInitState = fs.readFileSync(path.join(__dirname, './files/aftrBaseInitState-singleOwned.json'), "utf8");

        // Create the AFTR Vehicle, and store its contract ID
        beforeAll(async () => {
            const txIds: TxIds = await warpCreateContract(master.jwk, contractSource, singleOwnedInitState, undefined, true);
            AFTR_SINGLE_OWNED_CONTRACT_ID = txIds.contractTxId;
            CONTRACT_SRC_ID = txIds.srcTxId;
        })

        describe('Propose Tests', () => {
            describe('Add Member:', () => {
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

            describe('Settings:', () => {
                /* test set quorum */
                it('should set the quorum of the vehicle to 0.51', async () => {
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
                    expect(settings.get('quorum')).toBe(quorum);
                });
            });

            describe('Mint:', () => {
                let members: string[];
                let oldBal: number;
                let recipient: string
                const mintAmt = 400000;
                beforeAll(async () => {
                    members = Object.keys((await warpRead(AFTR_SINGLE_OWNED_CONTRACT_ID)).state.balances)
                    recipient = members[members.length - 1]
                    oldBal = await getBalance(master, recipient, AFTR_SINGLE_OWNED_CONTRACT_ID);
                });

                it('should mint 400000 tokens to a non-owner', async () => {
                    const input = {
                        "function": "propose",
                        "type": "mint",
                        "recipient": recipient,
                        "qty": mintAmt
                    };
                    const result = await warpWrite(master.jwk, AFTR_SINGLE_OWNED_CONTRACT_ID, input);
                    const state = (await warpRead(AFTR_SINGLE_OWNED_CONTRACT_ID)).state;
                    const balance = state.balances[recipient];

                    expect(balance).toBe(oldBal + mintAmt);
                });
            });

            describe('Remove Member:', () => {
                it('should remove a member from the vehicle', async () => {
                    const member = wallets[1];

                    const input = {
                        "function": "propose",
                        "type": "removeMember",
                        "recipient": member.address,
                        "qty": 1
                    };
                    const result = await warpWrite(master.jwk, AFTR_SINGLE_OWNED_CONTRACT_ID, input);
                    const state = (await warpRead(AFTR_SINGLE_OWNED_CONTRACT_ID)).state;
                    const balance = state.balances[member.address];

                    console.log(state.balances);

                    // Expected that member (member.address and its associated balance) is removed from the vehicle
                    expect(balance).toBe(undefined)
                });
            });

            xdescribe('Withdrawal:', () => {
                it('should withdraw 500 tokens from the vehicle to the owner\'s wallet', async () => {
                    let tokenId = (await warpRead(AFTR_SINGLE_OWNED_CONTRACT_ID)).state.tokens[0].tokenId
                    console.log(tokenId)
                    let input = {
                        function: "propose",
                        type: "withdrawal",
                        txID: tokenId,
                        target: master.address,
                        qty: 10,
                        note: "Test Withdrawal"
                    }
                    console.log(input)
                    let result = await warpWrite(master.jwk, AFTR_SINGLE_OWNED_CONTRACT_ID, input);
                    // let state = (await warpRead(AFTR_SINGLE_OWNED_CONTRACT_ID)).state;
                    // console.log(state);

                });
            });
        });

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
            it('should return 0 for the wallet of a non-member', async () => {
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
        });

        describe('Transfer Tests', () => {
            /* test transfer */
            it('should transfer tokens from Alice to Bob (non-member) within the vehicle', async () => {
                const amt = 1299;

                const alice = master;
                const bob = wallet;
                const balances = {
                    alice: await getBalance(alice, alice.address, AFTR_SINGLE_OWNED_CONTRACT_ID),
                    bob: await getBalance(bob, bob.address, AFTR_SINGLE_OWNED_CONTRACT_ID)
                }

                // This will automatically add bob to the vehicle if he is not a member
                const input = {
                    "function": "transfer",
                    "target": bob.address,
                    "qty": amt,
                }
                // Write the transaction
                const result = await warpWrite(alice.jwk, AFTR_SINGLE_OWNED_CONTRACT_ID, input);

                expect(await getBalance(alice, alice.address, AFTR_SINGLE_OWNED_CONTRACT_ID)).toBe(balances.alice - amt);
                expect(await getBalance(bob, bob.address, AFTR_SINGLE_OWNED_CONTRACT_ID)).toBe(balances.bob + amt);
            });
        });

        describe('Allow Tests', () => {
            it('should setup a claim on the asset being deposited in the vehicle', async () => {
                let quantity = 6700

                const inputAllow = {
                    "function": "allow",
                    "target": AFTR_SINGLE_OWNED_CONTRACT_ID,
                    "qty": quantity
                }
                const claimTx = await warpWrite(master.jwk, TOKEN_CONTRACT_ID, inputAllow);
                let state = (await warpRead(AFTR_SINGLE_OWNED_CONTRACT_ID)).state;
                console.log(claimTx)

                // const inputDep = {
                //     function: "deposit",
                //     tokenId: TOKEN_CONTRACT_ID,
                //     qty: quantity,
                //     txID: claimTx // TX ID from the first interaction
                // };
                // const depositTx = await warpWrite(master.jwk, AFTR_SINGLE_OWNED_CONTRACT_ID, inputDep);
                // console.log(depositTx)
                // state = (await warpRead(AFTR_SINGLE_OWNED_CONTRACT_ID)).state;
                // console.log(state)
            })
        });
    });

    /**
     * Propose to remove member [1000, 3000, 500]
     * Propose to change name [1000, 3000, 500] : voting power = 4500
     * Vote yay remove member [1000, 500]
     * Change name proposal : voting power = still 4500
     * if everyone in the vehicle votes yes, the vote will not pass ?
     */

    /**
     * Contains tests for a DAO-Owned Vehicle
     */
    describe("2. DAO-Owned Vehicle Test Suite", () => {
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

                expect(res.target).toBe(master.address);
                expect(res.balance).toBe(expectBal);
                expect(res.vaultBal).toBe(0);
            });
        });

        describe('Propose Tests', () => {
            describe('Add Member:', () => {
                let newMember: Wallet;
                let mintAmt: number;

                beforeAll(async () => {
                    newMember = wallets[1];
                    mintAmt = 9700;
                });

                it('should submit a proposal to add a new member to the vehicle and mint them 9000 tokens', async () => {
                    console.log(newMember)
                    const addInput = {
                        "function": "propose",
                        "type": "addMember",
                        "recipient": newMember.address,
                        "qty": mintAmt
                    };
                    const result = await warpWrite(master.jwk, AFTR_DAO_OWNED_CONTRACT_ID, addInput);
                    const state = (await warpRead(AFTR_DAO_OWNED_CONTRACT_ID)).state;
                    const votes = state.votes;
                    const vote = votes[votes.length - 1]
                    console.log(state);
                    expect(vote.type).toBe('addMember')
                    expect(vote.recipient).toBe(newMember.address)
                });

                it('should cast a vote to add the new member', async () => {
                    let state = (await warpRead(AFTR_DAO_OWNED_CONTRACT_ID)).state;
                    console.log(state)
                    let votes = state.votes;
                    let vote: VoteInterface = votes[votes.length - 1]
                    const voteInput = {
                        "function": "vote",
                        "voteId": vote.id,
                        "cast": "yay"
                    };
                    let result = await warpWrite(master.jwk, AFTR_DAO_OWNED_CONTRACT_ID, voteInput);
                    state = (await warpRead(AFTR_DAO_OWNED_CONTRACT_ID)).state;

                    // TODO assertions
                    console.log(state)
                    let members = Object.keys((await warpRead(AFTR_DAO_OWNED_CONTRACT_ID)).state.balances)
                    expect(members.includes(newMember.address)).toBeTruthy();
                    let recipient = members[members.length - 1]
                    let oldBal = await getBalance(master, recipient, AFTR_DAO_OWNED_CONTRACT_ID);
                    const mintAmt = 3000;

                    let input = {
                        "function": "propose",
                        "type": "mint",
                        "recipient": recipient,
                        "qty": mintAmt
                    };
                    result = await warpWrite(master.jwk, AFTR_DAO_OWNED_CONTRACT_ID, input);
                    state = (await warpRead(AFTR_DAO_OWNED_CONTRACT_ID)).state;
                    console.log(state)
                })

                // xit('should propose to mint and vote to pass it', async () => {
                //     let members = Object.keys((await warpRead(AFTR_DAO_OWNED_CONTRACT_ID)).state.balances)

                //     let votes = state.votes;
                //     let vote = votes[votes.length - 1]
                //     console.log(vote);

                //     let voteInput = {
                //         "function": "vote",
                //         "voteId": vote.id,
                //         "cast": "yay"
                //     };
                //     result = await warpWrite(master.jwk, AFTR_DAO_OWNED_CONTRACT_ID, voteInput);
                //     state = (await warpRead(AFTR_DAO_OWNED_CONTRACT_ID)).state
                //     console.log(state.votes)
                //     const balance = state.balances[recipient];
                //     console.log(balance)
                //     expect(balance).toBe(oldBal + mintAmt);

                //     console.log("Mint Vote:\n" + JSON.stringify(vote, null, '\t'))
                // });
            });

            describe('Settings:', () => {
                it('should submit a proposal to change the quorum to 0.51. the quorum should not change until voted on.', async () => {
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
                    let voteSet = votes[votes.length - 1]

                    expect(voteSet.type == 'set'
                        && voteSet.key == 'settings.quorum'
                        && voteSet.value == quorum).toBeTruthy()

                    let settings = new Map(state.settings);
                    expect(settings.get('quorum') != quorum).toBeTruthy();
                });

                it('should vote on the proposed quorum change (0.51), to pass the proposal', async () => {
                    let state = (await warpRead(AFTR_DAO_OWNED_CONTRACT_ID)).state;
                    let votes = state.votes;

                    let vote = votes[votes.length - 1]
                    let input = {
                        "function": "vote",
                        "voteId": vote.id,
                        "cast": "yay"
                    };

                    let result = await warpWrite(master.jwk, AFTR_DAO_OWNED_CONTRACT_ID, input);
                    console.log(result)
                    // TODO assertions
                    state = (await warpRead(AFTR_DAO_OWNED_CONTRACT_ID)).state;
                    console.log(state.votes);

                    const settings = new Map(state.settings);

                    expect(settings.get('quorum')).toBe(0.51);
                });

                it('should submit a proposal to change the quorum to 0.6. the quorum should not change until voted on.', async () => {
                    let oldQuorum = new Map((await warpRead(AFTR_DAO_OWNED_CONTRACT_ID)).state.settings).get('quorum')
                    let quorum = 0.6
                    let input = {
                        "function": "propose",
                        "type": "set",
                        "key": "settings.quorum",
                        "value": quorum
                    }
                    let result = await warpWrite(master.jwk, AFTR_DAO_OWNED_CONTRACT_ID, input);
                    let state = (await warpRead(AFTR_DAO_OWNED_CONTRACT_ID)).state

                    const settings = new Map(state.settings);
                    expect(settings.get('quorum')).toBe(oldQuorum);
                });

                it('should vote on the proposed quorum change (0.6), to pass the proposal', async () => {
                    let state = (await warpRead(AFTR_DAO_OWNED_CONTRACT_ID)).state;
                    let votes = state.votes;

                    let vote = votes[votes.length - 1]
                    let input = {
                        "function": "vote",
                        "voteId": vote.id,
                        "cast": "yay"
                    };

                    let result = await warpWrite(master.jwk, AFTR_DAO_OWNED_CONTRACT_ID, input);
                    console.log(result)
                    // TODO assertions
                    state = (await warpRead(AFTR_DAO_OWNED_CONTRACT_ID)).state;
                    console.log(state.votes);

                    const settings = new Map(state.settings);

                    expect(settings.get('quorum')).toBe(0.6);
                });
                it('should submit a proposal to change the quorum to 0.3. the quorum should not change until voted on.', async () => {
                    let oldQuorum = new Map((await warpRead(AFTR_DAO_OWNED_CONTRACT_ID)).state.settings).get('quorum')
                    let quorum = 0.3
                    let input = {
                        "function": "propose",
                        "type": "set",
                        "key": "settings.quorum",
                        "value": quorum
                    }
                    let result = await warpWrite(master.jwk, AFTR_DAO_OWNED_CONTRACT_ID, input);
                    let state = (await warpRead(AFTR_DAO_OWNED_CONTRACT_ID)).state

                    const settings = new Map(state.settings);
                    expect(settings.get('quorum')).toBe(oldQuorum);
                });

                it('should vote on the proposed quorum change (0.3), to pass the proposal', async () => {
                    let state = (await warpRead(AFTR_DAO_OWNED_CONTRACT_ID)).state;
                    let votes = state.votes;

                    let vote = votes[votes.length - 1]
                    let input = {
                        "function": "vote",
                        "voteId": vote.id,
                        "cast": "yay"
                    };

                    let result = await warpWrite(master.jwk, AFTR_DAO_OWNED_CONTRACT_ID, input);
                    console.log(result)
                    // TODO assertions
                    let stateObj = (await warpRead(AFTR_DAO_OWNED_CONTRACT_ID));
                    state = stateObj.state;
                    console.log(state);

                    const settings = new Map(state.settings);

                    expect(settings.get('quorum')).toBe(0.3);
                });
            });

            describe('Burn:', () => {
                let members: string[];
                let oldBal: number;
                let recipient: string
                const burnAmt = 3000;
                beforeAll(async () => {
                    members = Object.keys((await warpRead(AFTR_DAO_OWNED_CONTRACT_ID)).state.balances)
                    recipient = members[members.length - 1]
                    oldBal = await getBalance(master, recipient, AFTR_DAO_OWNED_CONTRACT_ID);
                });

                it('should submit a proposal to burn 3000 tokens from the new member', async () => {
                    let input = {
                        "function": "propose",
                        "type": "burn",
                        "recipient": recipient,
                        "qty": burnAmt
                    };
                    let result = await warpWrite(master.jwk, AFTR_DAO_OWNED_CONTRACT_ID, input)

                    // Could replace with getBalance() ?
                    let state = (await warpRead(AFTR_DAO_OWNED_CONTRACT_ID)).state
                    // TODO Change 
                    const balance = state.balances[recipient];

                    // Balance unchanged because proposal has not been passed yet
                    expect(balance).toBe(oldBal);
                });

                // FAIL
                it('should vote on the proposed burn, passing the proposal', async () => {
                    let state = (await warpRead(AFTR_DAO_OWNED_CONTRACT_ID)).state;
                    let votes = state.votes;

                    let vote = votes[votes.length - 1]
                    console.log("Burn Vote:\n" + JSON.stringify(vote, null, '\t'))
                    let input = {
                        "function": "vote",
                        "voteId": vote.id,
                        "cast": "yay"
                    };

                    let result = await warpWrite(master.jwk, AFTR_DAO_OWNED_CONTRACT_ID, input);
                    console.log("votetxid: "
                        + result)
                    state = (await warpRead(AFTR_DAO_OWNED_CONTRACT_ID)).state;

                    console.log("Vehicle Balances:\n"
                        + JSON.stringify(state.balances, null, '\t'))

                    console.log("Votes:\n"
                        + JSON.stringify(votes, null, '\t'))

                    const balance = state.balances[recipient];
                    expect(balance).toBe(oldBal - burnAmt);
                    // console.log(state.settings)
                });
            });
        });

    })

    afterAll(async () => {
        // After we are done with our tests, let's close the connection.
        console.log('*** Closing connection to ArLocal ***');
        await arlocal.stop();
    });

    async function getBalance(caller: Wallet, target: string, vehicleContractId: string): Promise<number> {
        let input = {
            "function": "balance",
            "target": target
        };
        console.log(caller)
        let res = (await warpDryWrite(caller.jwk, vehicleContractId, input)).result;
        return res.balance;
    }

    async function addMemberToVehicle(caller: Wallet, vehicleContractId: string, newMember: Wallet) {
        let input = {
            "function": "propose",
            "type": "addMember",
            "recipient": newMember.address,
            "qty": 20000
        }
        return await warpWrite(caller.jwk, vehicleContractId, input);
    }
});


/**
 * ## Notes ##
 * * * * * * * * * 
 * add beforeEach block to update the state of the vehicle? (warpRead)
 * 
 * update addMemberToVehicle function to pass the vote through
 * 
 * how to see casted votes?
 * 
 * 
 * 
 * DAO Propose:Add breaks contract?
 * comment out propose:add and tests run
 * or
 * comment out last warpRead statement: 
 *      Error: Unable to retrieve tx usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A. 404. undefined     <<< VINT token
 * 
 * 
 * Reading the contract after adding a member "breaks" the contract ?
 * Also occurring after proposing a burn vote
 * 
 * TODO * * * * * *
 * Helper functions needed:
 *      get members in a vehicle
 *      get vehicle owner
 * 
 * Integrate VoteInterface (and other faces)
 *      
 */
