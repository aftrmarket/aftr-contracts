import Arweave from 'arweave';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import { createContractFromTx, createContract, interactWrite } from 'smartweave';

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

async function playgroundInit() {
    /***  In this script, I'll need to hardcode a wallet and give it AR.
     * On the website, we'll just use ArConnect
     */
    const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json')));
    const addr = await arweave.wallets.jwkToAddress(wallet);


    // 1. Ensure wallet has some AR to make transactions 
    // Check balance of wallet. If it's less than 1AR, add 100 more (100AR = 100000000000000 mints)
    const server = process.env.ARWEAVE_HOST + ':' + process.env.ARWEAVE_PORT;
    const route = '/mint/' + addr + '/100000000000000';     // Amount in Winstons
    let balance = await arweave.wallets.getBalance(addr);
    if (balance < 10000000000000) {
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

    let contractSource;
    let initState;
    let contractTxId = "";
    if (numAftrVehicles > 0) {
        aftrContractSrcId = getContractSourceId(response.data.data.transactions.edges[0].node.id);
    } else {
        // No AFTR Contracts found, load the AFTR Base Contract
        // Create AFTR Protocol base contract
        //let contractSource = fs.readFileSync(path.join(__dirname, '/build/vehicle/contract.js'), "utf8");
        contractSource = fs.readFileSync(path.join(__dirname, '/tests/contracts/aftrSourcePlayground.js'), "utf8");
        initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/aftrInitStatePlayground.json'), "utf8");
        contractTxId = await createContract(arweave, wallet, contractSource, initState);
        await mine();
        aftrSourceId = await getContractSourceId(contractTxId);
    }

    // 3. Look for Sample AFTR Vehicles, if none found, load them
    contractTxId = createSampleAftrVehicle(wallet, aftrContractSrcId, "Chillin Treasury", "CHILL", "/tests/contracts/aftrChillinInitState.json");
    contractTxId = createSampleAftrVehicle(wallet, aftrContractSrcId, "Alquipa", "ALQPA", "/tests/contracts/aftrAlquipaInitState.json");
    contractTxId = createSampleAftrVehicle(wallet, aftrContractSrcId, "Blue Horizon", "BLUE", "/tests/contracts/aftrBlueHorizonInitState.json");

    // 4. Add the user to the Blue Horizon sample contract (if they aren't there).
    let input = {
        function: "mint",
        qty: 100000
    };
    // Calls mint function on Blue Horizon contract. If user already has a balance, nothing happens. - Last contactTxId points to Blue Horizon contract.
    contractTxId = await interactWrite(arweave, wallet, contractTxId, input);
    await mine();

    // 5. Look for sample PSTs (Tag Aftr-Playground === "Vint"), Vint is copy of Verto contract
    query = `query($cursor: String) {
        transactions(
            tags: [ 
                { name: "Aftr-Playground", values: ["Vint"] },
                { name: 'Aftr-Playground-Type', value:  'PST' }
        ]
            after: $cursor
        )
        { pageInfo { hasNextPage }
            edges { cursor node { id } }
        }
    }`;

    response = await runQuery(query, "Failure looking for Vint PST. ");

    if (response.data.data.transactions.edges.length === 0) {
        // Vint using Verto's init state and Blue Horizon's source
        initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/vertoInitState.json'), "utf8");
        let vintContractId = await createSampleContract(wallet, aftrSourceId, initState, "PST", "Vint");
        await mine();
    }

    query = `query($cursor: String) {
        transactions(
            tags: [ 
                { name: "Aftr-Playground", values: ["ArHD"] },
                { name: 'Aftr-Playground-Type', value:  'PST' }
            ]
            after: $cursor
        )
        { pageInfo { hasNextPage }
            edges { cursor node { id } }
        }
    }`;

    response = await runQuery(query, "Failure looking for ArHD PST. ");

    if (response.data.data.transactions.edges.length === 0) {
        // ArHD using ArDrive's init state and Blue Horizon's source
        initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/arDriveInitState.json'), "utf8");
        let arHdContractId = await createSampleContract(wallet, aftrSourceId, initState, "PST", "ArHD");
        await mine();
    }

    // 6. Look for images from PSTs and AFTR Market Vehicles (Tags { name: "Content-Type", values: ["image/png"] } && { name: "Aftr-Playground", values: ["Vint"] })
    let tags = [ { name: "Aftr-Playground", values: ["Vint"] },  { name: "Content-Type", values: ["image/png"] } ];
    let vintLogo = getLogoId("Vint", tags);

    tags = [ { name: "Aftr-Playground", values: ["ArHD"] },  { name: "Content-Type", values: ["image/png"] } ];
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


async function createSampleContract(wallet, aftrId, initState, type = "aftr", name) {
    let swTags = [];
    if (type === "aftr") {
        swTags = [
            { name: 'Protocol', value:  process.env.SMARTWEAVE_TAG_PROTOCOL },
            { name: 'Aftr-Playground', value:  name }
        ];
    } else {
        swTags = [
            { name: 'Aftr-Playground', value:  name },
            { name: 'Aftr-Playground-Type', value:  'PST' }
        ];
    }
    let contractTxId = await createContractFromTx(arweave, wallet, aftrId, initState, swTags);

    return contractTxId;
}

async function createSampleAftrVehicle(wallet, aftrSourceId, name, ticker, initStatePath) {
    let query = `query($cursor: String) {
        transactions(
            tags: [
                { name: "Protocol", values: ["${ process.env.SMARTWEAVE_TAG_PROTOCOL }"] },
                { name: "Aftr-Playground", values: ["${ ticker }"] }
            ]
            after: $cursor
        )
        { pageInfo { hasNextPage }
            edges { cursor node { id } }
        }
    }`;
    let response = await runQuery(query, "Failure on looking up " + name + " Vehicle. ");
    let numAftrVehicles = response.data.data.transactions.edges.length;

    if (numAftrVehicles === 0) {
        // Not found, so create vehicle
        let initState = fs.readFileSync(path.join(__dirname, initStatePath), "utf8");
        let contractTxId = await createSampleContract(wallet, aftrSourceId, initState, "aftr", ticker);
        await mine();

        // Add the logo
        /*** TODO */

        await mine();

        return contractTxId;
    }
}

playgroundInit();

