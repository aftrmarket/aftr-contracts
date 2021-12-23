import Arweave from 'arweave';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { SmartWeaveNodeFactory, LoggerFactory } from 'redstone-smartweave';
import { createContractFromTx, simulateCreateContractFromSource } from 'smartweave';

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

// Redstone SmartWeave config
LoggerFactory.INST.logLevel('error');
const redStoneSmartweave = SmartWeaveNodeFactory.memCached(arweave);

async function arLocalInit() {
    const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile.json')));
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
    let contractTxId = await createContract(wallet, contractSource, initState, 'ArDrive');
    await mine();
    console.log("ArDrive Contract Source: " + contractTxId);

    // Create Verto contract
    contractSource = fs.readFileSync(path.join(__dirname, '/tests/contracts/vertoSource.js'), "utf8");
    initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/vertoInitState.json'), "utf8");
    contractTxId = await createContract(wallet, contractSource, initState, 'Verto');
    await mine();
    console.log("Verto Contract Source: " + contractTxId);

    // Create Increment contract
    contractSource = fs.readFileSync(path.join(__dirname, '/tests/contracts/increment.js'), "utf8");
    initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/incrementInit.json'), "utf8");
    contractTxId = await createContract(wallet, contractSource, initState, 'Increment');
    await mine();
    console.log("Increment Contract Source: " + contractTxId);

    // Create AFTR Protocol base contract
    contractSource = fs.readFileSync(path.join(__dirname, '/build/vehicle/contract.js'), "utf8");
    initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/aftrInitState.json'), "utf8");
    contractTxId = await createContract(wallet, contractSource, initState, 'AFTR');
    await mine();
    console.log("AFTR Contract Source: " + contractTxId);

    //const aftrContractId = contractTxId;
    
    // Create some AFTR vehicles for Testing using AFTR's contract source
    initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/aftrAlquipaInitState.json'), "utf8");
    contractTxId = await createContract(wallet, contractSource, initState, 'AFTR - Alquipa');
    await mine();
    console.log("AFTR Vehicle - Alquipa: " + contractTxId);

    initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/aftrBlueHorizonInitState.json'), "utf8");
    contractTxId = await createContract(wallet, contractSource, initState, 'AFTR - Blue Horizon');
    await mine();
    console.log("AFTR Vehicle - Blue Horizon: " + contractTxId);

    initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/aftrChillinInitState.json'), "utf8");
    contractTxId = await createContract(wallet, contractSource, initState, 'AFTR - Chillin');
    await mine();
    console.log("AFTR Vehicle - Chillin: " + contractTxId);

    balance = await arweave.wallets.getBalance(addr);
    console.log("BALANCE: " + balance);
}

async function createContract(wallet, contractSource, initState, pst) {
    let swTags = [
        { name: 'App-Name', value: pst },
        { name: 'App-Version', value: '0.0.0'},
        { name: 'Content-Type', value: 'application/javascript' }
    ];

    if (pst.substr(0, 4) === 'AFTR') {
        swTags.push(
            { name: 'Protocol', value:  process.env.SMARTWEAVE_TAG_PROTOCOL }
        );
    }

    const contractTxId = await redStoneSmartweave.createContract.deploy({
        wallet,
        initState,
        src: contractSource,
        tags: swTags
    });

    return contractTxId;
}

async function createAftrVehicle(wallet, aftrId, initState, name) {
    let swTags = [
        { name: 'App-Name', value: name },
        { name: 'App-Version', value: '0.0.0'},
        { name: 'Content-Type', value: 'application/javascript' },
        { name: 'Protocol', value:  process.env.SMARTWEAVE_TAG_PROTOCOL }
    ];
    let contractTxId = await createContractFromTx(arweave, wallet, aftrId, initState, swTags);

    return contractTxId;
}

arLocalInit();