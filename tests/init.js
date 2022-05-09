import Arweave from 'arweave';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { createContractFromTx, createContract } from 'smartweave';

/***
 * This test script assumes an instance of Arweave is running
 * The script loads several contracts and initial states to the Arweave node
 * and then loads the base AFTR contract and state.
 * Once loaded, then tests can be run to test the AFTR contract and/or
 * utitilze the AFTR source to create new AFTR vehicles from the AFTR.Market website.
 ***/

const arweave = Arweave.init({
    host: process.env.ARWEAVE_HOST,
    protocol: process.env.ARWEAVE_PROTOCOL,
    port: process.env.ARWEAVE_PORT
});

const __dirname = path.resolve();
const mine = () => arweave.api.get("mine");

async function arLocalInit() {
    const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json')));
    const addr = await arweave.wallets.jwkToAddress(wallet);

    const server = process.env.ARWEAVE_HOST + ':' + process.env.ARWEAVE_PORT;
    const route = '/mint/' + addr + '/10000000000000';     // Amount in Winstons
    const mintRes = await request(server).get(route);

    console.log("WALLET: " + addr);
    let balance = await arweave.wallets.getBalance(addr);
    console.log("BALANCE: " + balance);

    // Create ArDrive contract
    let contractSource = fs.readFileSync(path.join(__dirname, '/tests/contracts/arDriveSource.js'), "utf8");
    let initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/arDriveInitState.json'), "utf8");
    let contractTxId = await createContract(arweave, wallet, contractSource, initState);
    await mine();
    console.log("ArDrive Contract ID: " + contractTxId);

    // Create Verto contract
    contractSource = fs.readFileSync(path.join(__dirname, '/tests/contracts/vertoSource.js'), "utf8");
    initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/vertoInitState.json'), "utf8");
    contractTxId = await createContract(arweave, wallet, contractSource, initState);
    await mine();
    console.log("Verto Contract ID: " + contractTxId);

    // Create Increment contract
    contractSource = fs.readFileSync(path.join(__dirname, '/tests/contracts/increment.js'), "utf8");
    initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/incrementInit.json'), "utf8");
    contractTxId = await createContract(arweave, wallet, contractSource, initState);
    await mine();
    console.log("Increment Contract ID: " + contractTxId);

    // Create AFTR Protocol base contract
    contractSource = fs.readFileSync(path.join(__dirname, '/build/vehicle/contract.js'), "utf8");
    initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/aftrInitState.json'), "utf8");
    contractTxId = await createContract(arweave, wallet, contractSource, initState);
    await mine();
    console.log("AFTR Contract ID: " + contractTxId);

    const aftrSourceId = await getContractSourceId(contractTxId);
    
    // Create some AFTR vehicles for Testing using AFTR's contract source
    initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/aftrAlquipaInitState.json'), "utf8");
    //contractTxId = await createContract(arweave, wallet, contractSource, initState);
    contractTxId = await createAftrVehicle(wallet, aftrSourceId, initState);
    await mine();
    console.log("AFTR Vehicle - Alquipa: " + contractTxId);

    initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/aftrBlueHorizonInitState.json'), "utf8");
    //contractTxId = await createContract(arweave, wallet, contractSource, initState);
    contractTxId = await createAftrVehicle(wallet, aftrSourceId, initState);
    await mine();
    console.log("AFTR Vehicle - Blue Horizon: " + contractTxId);

    initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/aftrChillinInitState.json'), "utf8");
    //contractTxId = await createContract(arweave, wallet, contractSource, initState);
    contractTxId = await createAftrVehicle(wallet, aftrSourceId, initState);
    await mine();
    console.log("AFTR Vehicle - Chillin: " + contractTxId);

    balance = await arweave.wallets.getBalance(addr);
    console.log("BALANCE: " + balance);

    //await readTags("k98IUd62AZZQ75Dv9RZpy0WaBkxIwVJQ8IS0FaaLYhc");
}

async function readTags(txId) {
    let tx = await arweave.transactions.get(txId);

    tx.get('tags').forEach(tag => {
        let key = tag.get('name', {decode: true, string: true});
        let value = tag.get('value', {decode: true, string: true});
        console.log(`${key} : ${value}`);    
    })
}

async function getContractSourceId(txId) {
    let tx = await arweave.transactions.get(txId);
    let allTags = [];
    tx.get('tags').forEach(tag => {
        let key = tag.get('name', {decode: true, string: true});
        let value = tag.get('value', {decode: true, string: true});
        allTags.push({
            key,
            value
        });
    });
    for (let i = 0; i < allTags.length; i++) {
        if (allTags[i].key === 'Contract-Src') {
            console.log(`${allTags[i].key} : ${allTags[i].value}`); 
            return allTags[i].value;
        }
    }
}

async function createAftrVehicle(wallet, aftrId, initState) {
    let swTags = [
        { name: 'Protocol', value:  process.env.SMARTWEAVE_TAG_PROTOCOL }
    ];
    let contractTxId = await createContractFromTx(arweave, wallet, aftrId, initState, swTags);

    return contractTxId;
}

arLocalInit();
//readTags("dqHBM990sXmxx964wPC9_2ZTPeAWLEyka0NuvejYb54");
// getContractSourceId("dqHBM990sXmxx964wPC9_2ZTPeAWLEyka0NuvejYb54");