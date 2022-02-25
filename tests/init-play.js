import Arweave from 'arweave';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { createContractFromTx, createContract } from 'smartweave';

/*
    1. Ensure wallet has some AR to make transactions 
    2. Look for AFTR Base Contract
    3. Look for Sample AFTR Vehicles, if none found, load them
    4. Add the user to the Blue Horizon sampel contract (if they aren't there).
    5. Look for sample PSTs, Vint is copy of Verto contract and ArHD is a copy of the ArDrive contract
    6. Look for images from PSTs and AFTR Market Vehicles (added a addLogo contract function in order to add the logos)
    7. Give the user's wallet PSTs (added a mint contract function to the test PSTs so that we can give users sample PSTS)
 */

const arweave = Arweave.init({
    host: process.env.ARWEAVE_HOST,
    protocol: process.env.ARWEAVE_PROTOCOL,
    port: process.env.ARWEAVE_PORT
});

const __dirname = path.resolve();
const mine = () => arweave.api.get("mine");

async function arLocalInit() {
    /***  In this script, I'll need to hardcode a wallet and give it AR.
     * On the website, we'll just use ArConnect
     */
    const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json')));
    const addr = await arweave.wallets.jwkToAddress(wallet);


    // 1. Ensure wallet has some AR to make transactions 
    // Check balance of wallet. If it's less than 1AR, add 10 more (10AR = 10000000000000 mints)
    const server = process.env.ARWEAVE_HOST + ':' + process.env.ARWEAVE_PORT;
    const route = '/mint/' + addr + '/10000000000000';     // Amount in Winstons
    let balance = await arweave.wallets.getBalance(addr);
    if (balance < 1000000000000) {
        const mintRes = await request(server).get(route);
    }

    // 2. Look for AFTR Base Contract (Find 1 TX ID with Tag "Protocol" === "AFTR-BETA", then get the "Contract-Src" tag value)
    let aftrContractSrcId = "";
    let numAftrVehicles = 0;
    query = `query($cursor: String) {
                    transactions(
                        tags: [ { name: "Protocol", values: ["${ process.env.SMARTWEAVE_TAG_PROTOCOL }"] } ]
                        after: $cursor
                    )
                    { pageInfo { hasNextPage }
                        edges { cursor node { id } }
                    }
                }`;
    response = await runQuery(query, "Failure on looking up AFTR Vehicles. ");
    numAftrVehicles = response.data.data.transactions.edges.length;

    if (numAftrVehicles > 0) {
        aftrContractSrcId = getContractSourceId(response.data.data.transactions.edges[0].node.id);
    } else {
        // No AFTR Contracts found, load the AFTR Base Contract
        // Create AFTR Protocol base contract
        //let contractSource = fs.readFileSync(path.join(__dirname, '/build/vehicle/contract.js'), "utf8");
        let contractSource = fs.readFileSync(path.join(__dirname, '/tests/contracts/aftrSourcePlayground.js'), "utf8");
        let initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/aftrInitStatePlayground.json'), "utf8");
        let contractTxId = await createContract(arweave, wallet, contractSource, initState);
        await mine();
        aftrSourceId = await getContractSourceId(contractTxId);
    }

    // 3. Look for Sample AFTR Vehicles, if none found, load them
    if (numAftrVehicles === 0) {
        // Create sample vehicles

    } else {
        // 

    }
    
    // 4. Add the user to the Blue Horizon sampel contract (if they aren't there).


    // 5. Look for sample PSTs (Tag AftrPlayground === "Vint"), Vint is copy of Verto contract
    query = `query($cursor: String) {
        transactions(
            tags: [ { name: "AftrPlayground", values: ["Vint"] } ]
            after: $cursor
        )
        { pageInfo { hasNextPage }
            edges { cursor node { id } }
        }
    }`;

    response = await runQuery(query, "Failure looking for Vint PST. ");

    if (response.data.data.transactions.edges.length === 0) {
        // Create Vint PST using Verto Source
        contractSource = fs.readFileSync(path.join(__dirname, '/tests/contracts/vertoSource.js'), "utf8");
        initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/vertoInitState.json'), "utf8");
        // Add AftrPlayground tag
        contractTxId = await createContract(arweave, wallet, contractSource, initState);
        await mine();
        console.log("Vint Contract ID: " + contractTxId);
    }

    query = `query($cursor: String) {
        transactions(
            tags: [ { name: "AftrPlayground", values: ["ArHD"] } ]
            after: $cursor
        )
        { pageInfo { hasNextPage }
            edges { cursor node { id } }
        }
    }`;

    response = await runQuery(query, "Failure looking for ArHD PST. ");

    if (response.data.data.transactions.edges.length === 0) {
        contractSource = fs.readFileSync(path.join(__dirname, '/tests/contracts/arDriveSource.js'), "utf8");
        initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/arDriveInitState.json'), "utf8");
        contractTxId = await createContract(arweave, wallet, contractSource, initState);
        await mine();
        console.log("ArHD Contract ID: " + contractTxId);
    }

    // 6. Look for images from PSTs and AFTR Market Vehicles (Tags { name: "Content-Type", values: ["image/png"] } && { name: "AftrPlayground", values: ["Vint"] })
    let tags = [ { name: "AftrPlayground", values: ["Vint"] },  { name: "Content-Type", values: ["image/png"] } ];
    let vintLogo = getLogoId("Vint", tags);

    tags = [ { name: "AftrPlayground", values: ["ArHD"] },  { name: "Content-Type", values: ["image/png"] } ];
    let arHdLogo = getLogoId("ArHD", tags);

    const inputLogo = {
        function: "addLogo",
        logo: vintLogo
    };
    /*** TODO: Call interactWrite for Vint */

    // 7. Give the user's wallet PSTs (added a mint function to the test PSTs so that we can give users sample PSTS)
    // Calls mint function on contracts. If user already has a balance, nothing happens.
    const inputMint = {
        function: "mint",
        qty: 100000
    };


/*

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
*/
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

async function runQuery(query, errorMsg) {
    try {
        let response = await arweave.api.post("graphql", {
            query: query
        });

        if (response.status !== 200) {
            console.log(errorMsg + response.status + " - " + response.statusText);
            return;
        }

        return response;
    } catch(e) {
        console.log(errorMsg + e);
    }
}

async function getLogoId(name, tags) {
    let query = `query($cursor: String) {
        transactions(
            tags: ${tags}
            after: $cursor
        )
        { pageInfo { hasNextPage }
            edges { cursor node { id } }
        }
    }`;
    let response = await runQuery(query, "Failure looking for " + name + " logo. ");
    let logo = "";
    if (response.data.data.transactions.edges.length > 0) {
        logo = response.data.data.transactions.edges[0].node.id;
    } else {
        // No logo found, so load logo
        
        /*** TODO */

        await mine();
        logo = "";
    }
    return logo;
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

