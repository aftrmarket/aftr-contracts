import Arweave from 'arweave';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import fsAsync from 'fs/promises';
import { createContractFromTx, createContract, interactWrite, readContract } from 'smartweave';
import { WarpFactory } from 'warp-contracts';


/*
    1. Ensure wallet has some AR to make transactions
    2. Look for AFTR Base Contract, create if necessary, save the source id
    3. Look for sample PSTs, Vint is copy of Verto contract and ArHD is a copy of the ArDrive contract
        a. In order to create sample PSTs, just create test AFTR vehicles, but don’t use the standard tags for AFTR vehicles (Protocol == AFTR-BETA)
        b. This part also adds the logos to the TESTNET if necessary (communityLogo and logo inside the tokens[])
    4. Look for Sample AFTR Vehicles, if none found, load them
        a. This part also adds the logos to the TESTNET if necessary (communityLogo and logo inside the tokens[])
    5. Add the user to the Blue Horizon sample contract (if they aren't there).
    6. Give the user's wallet PSTs (added a mint contract function to the test PSTs so that we can give users sample PSTS)
 */

// const arweave = Arweave.init({
//     host: process.env.ARWEAVE_HOST,
//     protocol: process.env.ARWEAVE_PROTOCOL,
//     port: process.env.ARWEAVE_PORT
// });

const __dirname = path.resolve();
// const mine = () => arweave.api.get("mine");

let logoVint = "";
let logoArhd = "";

async function playgroundInit() {
    let arweave = arweaveInit();

    /***  In this script, I'll need to hardcode a wallet and give it AR if necessary.
     * On the website, we'll just use ArConnect as the wallet and give it AR if necessary.
     */
    const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json')));
    const addr = await arweave.wallets.jwkToAddress(wallet);


    /*** 1. Ensure wallet has some AR to make transactions */
    // Check balance of wallet. If it's less than 1AR, add 100 more (100AR = 100000000000000 mints)
    console.log("1. Ensure wallet has some AR to make transactions");

    const server = process.env.ARWEAVE_HOST + ':' + process.env.ARWEAVE_PORT;
    const route = '/mint/' + addr + '/100000000000000';     // Amount in Winstons
    let balance = await arweave.wallets.getBalance(addr);
    if (balance < 10000000000000) {
        const mintRes = await request(server).get(route);
        balance = await arweave.wallets.getBalance(addr);
    }

    console.log("Balance for " + addr + ": " + balance.toString());

    /*** 2. Look for AFTR Base Contract (Find 1 TX ID with Tag "Protocol" === "AFTR-BETA", then get the "Contract-Src" tag value) */
    console.log("2. AFTR Base Contract");
    let aftrContractSrcId = "";     // We'll save this in the AFTR Playground rather than use the env var when Creating Vehicles
    let query = `query($cursor: String) {
                    transactions(
                        tags: [ { name: "Protocol", values: ["${ process.env.SMARTWEAVE_TAG_PROTOCOL }"] } ]
                        after: $cursor
                    )
                    { pageInfo { hasNextPage }
                        edges { cursor node { id } }
                    }
                }`;
    let response = await runQuery(query, "Failure on looking up AFTR Vehicles. ");

    let numAftrVehicles = 0;
    if (response) {
        numAftrVehicles = response.data.data.transactions.edges.length;
    }

    let contractSource;
    let initState;
    let contractTxId = "";
    if (numAftrVehicles > 0) {
        aftrContractSrcId = await getContractSourceId(response.data.data.transactions.edges[0].node.id);
    } else {
        // No AFTR Contracts found, load the AFTR Base Contract
        // Create AFTR Protocol base contract
        //let contractSource = fs.readFileSync(path.join(__dirname, '/build/vehicle/contract.js'), "utf8");
        contractSource = fs.readFileSync(path.join(__dirname, '/tests/contracts/aftrSourcePlayground.js'), "utf8");
        initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/aftrInitStatePlayground.json'), "utf8");
        // contractTxId = await createContract(arweave, wallet, contractSource, initState);
        // await mine();
        // aftrContractSrcId = await getContractSourceId(contractTxId);
        let txIDs = await warpCreateContract(contractSource, initState, undefined, true, wallet);
        contractTxId = txIDs.contractTxId;
        aftrContractSrcId = txIDs.srcTxId;
        console.log(JSON.stringify(txIDs));
    }
    console.log("AFTR Source ID: " + aftrContractSrcId);

    /*** 3. Look for sample PSTs, Vint is copy of Verto contract, arHD is a copy of ArDrive */
    console.log("3. Sample PSTs");

    let vintContractId = await createSampleAftrVehicle(wallet, aftrContractSrcId, "pst", "Vint", "VINT", "/tests/contracts/vertoInitState.json");
    console.log("VINT: " + vintContractId);

    let arhdContractId = await createSampleAftrVehicle(wallet, aftrContractSrcId, "pst", "arHD", "ARHD", "/tests/contracts/arDriveInitState.json");
    console.log("ARHD: " + arhdContractId);

    /*** 4. Look for Sample AFTR Vehicles, if none found, load them */
    console.log("4. Sample AFTR Vehicles");

    let chillContractId = await createSampleAftrVehicle(wallet, aftrContractSrcId, "aftr", "Chillin Treasury", "CHILL", "/tests/contracts/aftrChillinInitState.json");
    //await updateTokensLogos(wallet, chillContractId, logoVint, logoArhd);
    //console.log("CHILL: " + chillContractId);

    let alqpaContractId = await createSampleAftrVehicle(wallet, aftrContractSrcId, "aftr", "Alquipa", "ALQPA", "/tests/contracts/aftrAlquipaInitState.json");
    //await updateTokensLogos(wallet, alqpaContractId, logoVint, logoArhd);
    //console.log("ALQPA: " + alqpaContractId);

    let blueContractId = await createSampleAftrVehicle(wallet, aftrContractSrcId, "aftr", "Blue Horizon", "BLUE", "/tests/contracts/aftrBlueHorizonInitState.json");
    //await updateTokensLogos(wallet, blueContractId, logoVint, logoArhd);
    //console.log("BLUE: " + blueContractId);

    /*** 5. Add the user to the Blue Horizon sample contract (if they aren't there). */
    console.log("5. Add user to Blue Horizon Vehicle");

    let input = {
        function: "plygnd-mint",
        qty: 100000
    };
    // Calls mint function on Blue Horizon contract. If user already has a balance, nothing happens.
    // contractTxId = await interactWrite(arweave, wallet, blueContractId, input);
    // await mine();
    contractTxId = await warpWrite(blueContractId, input, true, undefined, wallet)

    console.log("Blue Horizon Contract Write: " + contractTxId);

    /*** 6. Give the user's wallet PSTs (added a mint function to the test PSTs so that we can give users sample PSTS) */
    // Calls mint function on contracts. If user already has a balance, nothing happens.

    console.log("6. Give the user's wallet PSTs");
    input = {
        function: "plygnd-mint",
        qty: 100000
    };
    contractTxId = await warpWrite(vintContractId, input, true, undefined, wallet)
    //let pstState = await readContract(arweave, vintContractId);
    //console.log("VINT: " + JSON.stringify(pstState));
    console.log("User Wallet VINT: " + contractTxId);

    contractTxId = await warpWrite(arhdContractId, input, true, undefined, wallet)
    console.log("User Wallet ARHD: " + contractTxId);

    // await mine();

    // console.log(JSON.stringify(await readContract(arweave, blueContractId, undefined, true)));
    console.log(JSON.stringify(await warpRead(blueContractId)));
}

/*** BEGIN SCRIPT FUNCTIONS */
async function getContractSourceId(txId) {
    const arweave = arweaveInit();
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
            return allTags[i].value;
        }
    }
}

async function runQuery(query, errorMsg) {
    try {
        let arweave = arweaveInit();
        let response = await arweave.api.post("graphql", {
            query: query
        });

        if (response.status !== 200) {
            response = null;
        }

        return response;
    } catch(e) {
        console.log(errorMsg + e);
    }
}

async function getLogoId(wallet, name, ticker, type = "aftr") {
    const arweave = arweaveInit();
    
    // Gets logo for name.  If not found, uploads it.
    let tags = [];
    if (type === "aftr") {
        tags = [ { name: "Aftr-Playground", values: [name] },  { name: "Content-Type", values: ["image/jpeg"] } ];
    } else {
        tags = [ { name: "Aftr-Playground", values: [name] },  { name: "Content-Type", values: ["image/png"] } ];
    }

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
    let logoId = "";
    if (response) {
        logoId = response.data.data.transactions.edges[0].node.id;
    } else {
        /*** ON THE WEBSITE, USE THE SAME DEPLOY FILE CODE AS IN CREATE VEHICLE */
        // No logo found, so load logo
        let logoSrc = "";
        if (type === "aftr") {
            logoSrc = "/tests/assets/" + ticker.toLowerCase() + ".jpeg";    
        } else {
            logoSrc = "/tests/assets/" + ticker.toLowerCase() + ".png";
        }
        const data = await fsAsync.readFile(path.join(__dirname, logoSrc));
        const tx = await arweave.createTransaction(
            { data }, 
            wallet
        );
        if (type === "aftr") {
            tx.addTag("Content-Type", "image/jpeg");
        } else {
            tx.addTag("Content-Type", "image/png");
        }
        tx.addTag("Aftr-Playground", name);
        await arweave.transactions.sign(tx, wallet);
        await arweave.transactions.post(tx);
        logoId = tx.id;
        // await mine();
    }
    if (name === "Vint") {
        logoVint = logoId;
    } else if (name === "arHD") {
        logoArhd = logoId;
    }
    return logoId;
}

async function createSampleContract(wallet, aftrId, initState, type = "aftr", name) {
    let swTags = [];
    if (type === "aftr") {
        swTags = [
            { name: 'Aftr-Playground', value:  name }
        ];
    } else {
        swTags = [
            { name: 'Aftr-Playground', value:  name },
            { name: 'Aftr-Playground-Type', value:  'PST' }
        ];
    }
    //let contractTxId = await createContractFromTx(arweave, wallet, aftrId, initState, swTags);
    let txIDs = await warpCreateFromTx(initState, aftrId, swTags, false, wallet);
    let contractTxId = txIDs.contractTxId;

    return contractTxId;
}

async function createSampleAftrVehicle(wallet, aftrSourceId, type = "aftr", name, ticker, initStatePath) {
    let query = "";
    
    if (type === "aftr") {
        query = `query($cursor: String) {
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
    } else {
        query = `query($cursor: String) {
            transactions(
                tags: [ 
                    { name: "Aftr-Playground", values: ["${ ticker }"] },
                    { name: "Aftr-Playground-Type", values: ["PST"] }
            ]
                after: $cursor
            )
            { pageInfo { hasNextPage }
                edges { cursor node { id } }
            }
        }`;
    }

    let response = await runQuery(query, "Failure on looking up " + name);
    let numAftrVehicles = 0;
    if (response) {
        numAftrVehicles = response.data.data.transactions.edges.length;
    }
    
    //if (numAftrVehicles === 0) {
        // Not found, so create vehicle
        let initState = fs.readFileSync(path.join(__dirname, initStatePath), "utf8");
        let contractTxId = await createSampleContract(wallet, aftrSourceId, initState, type, ticker);
        //await mine();

        // Add the logo
        const logoId = await getLogoId(wallet, name, ticker, type);
        console.log("LOGO for " + name + ": " + logoId);

        let input = {
            function: "plygnd-addLogo",
            logo: logoId
        };
        // let res = await interactWrite(arweave, wallet, contractTxId, input);
        let res = await warpWrite(contractTxId, input, true, undefined, wallet)
        // await mine();

        console.log("LOGO ADD for " + name + ": " + res);
        
        await updateTokensLogos(wallet, contractTxId, logoVint, logoArhd);
        // await mine();

        return contractTxId;
    // } else {
    //     return response.data.data.transactions.edges[0].node.id;
    // }
}

async function updateTokensLogos(wallet, contractId, logoVint, logoArhd) {
    let input = {
        function: "plygnd-updateTokens",
        logoVint: logoVint,
        logoArhd: logoArhd
    };
    // let res = await interactWrite(arweave, wallet, contractId, input);
    let res = await warpWrite(contractId, input, true, undefined, wallet)
    // await mine();
}

function warpInit() {
    let warp = {};
    
    try {
        const arweave = arweaveInit();

        // Using Warp
        if (process.env.NODE_ENV === "PROD") {
            warp = WarpFactory.forMainnet();
        } else if (process.env.NODE_ENV === "TEST") {
            warp = WarpFactory.forTestnet(process.env.ARWEAVE_PORT, arweave);
        } else if (process.env.NODE_ENV === "DEV") {
            warp = WarpFactory.forLocal(process.env.ARWEAVE_PORT, arweave);
        } else {
            warp = WarpFactory.forTestnet();
        }
    } catch(e) {
        console.log(e);
    }
    return warp;
};

async function warpRead(contractId, internalWrites = true) {
    const warp = warpInit();

    try {
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

async function warpWrite(contractId, input, internalWrites = true, bundling = true, wallet) {
    const warp = warpInit();
    try {
        const contract = warp.contract(contractId)
        .setEvaluationOptions({ 
            internalWrites: internalWrites,
            disableBundling: !bundling
         })
        .connect(wallet);
        const { originalTxId } = await contract.writeInteraction(input);
        return originalTxId;
    } catch(e) {
        console.log(e);
        return "";
    }
};

async function warpCreateContract(source, initState, currentTags = undefined, aftr = false, wallet) {
    /*** 
     * Returns:
     * { contractTxId: string, srcTxId: string }
     */

    let tags = addTags(currentTags, aftr);
    const warp = warpInit();
    try {
        let txIds = await warp.createContract.deploy({
            wallet: wallet,
            initState: initState,
            src: source,
            tags
        });
        return txIds;
    } catch(e) {
        console.log("ERROR deploying AFTR contract: " + e);
        return {};
    }
};

async function warpCreateFromTx(initState, srcId, currentTags = undefined, aftr = false, wallet) {
    /*** 
     * Returns:
     * { contractTxId: string, srcTxId: string }
     */

    let tags = addTags(currentTags, aftr);

    const warp = warpInit();
    try {
        let txIds = await warp.createContract.deployFromSourceTx({
            wallet: wallet,
            initState: initState,
            srcTxId: srcId,
            tags
        });
        return txIds;
    } catch(e) {
        console.log("ERROR deploying AFTR contract: " + e);
        return {};
    }
};

function arweaveInit() {
    let arweave = {};
    try {
        arweave = Arweave.init({
            host: process.env.ARWEAVE_HOST,
            port: process.env.ARWEAVE_PORT,
            protocol: process.env.ARWEAVE_PROTOCOL,
            timeout: 20000,
            logging: true,
        });
    } catch(e) {
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
        tags.push( { name: "Protocol", value: process.env.SMARTWEAVE_TAG_PROTOCOL } );
        tags.push( { name: "Implements", value: ["ANS-110"] });
        tags.push( { name: "Type", value: ["token", "vehicle"] } );
    }

    return tags;
};
/*** END SCRIPT FUNCTIONS */

playgroundInit();