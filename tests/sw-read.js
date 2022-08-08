import Arweave from 'arweave';
import { createContractFromTx, readContract, interactWrite, interactRead, interactWriteDryRun } from 'smartweave';
import { executeContract } from "@three-em/node";
import path from 'path';
import fs from 'fs';
//import { Console } from 'console';
//import { fetchBalancesForAddress } from "verto-cache-interface";
//import Verto from "@verto/js";

/******* MODIFY INPUTS */

const contractId = "JdTit7L06F8qpq8i2EBslgeUkvQ_ur2RpjLHORiaimE";
// const input = { 
//         function: 'balance',
//         target: 'ewTkY6Mytg6C0AtYU6QlkEg1oH-9J2PPS0CM83RL9rk'
//}

//const input = { function: 'transfer', target: 'ewTkY6Mytg6C0AtYU6QlkEg1oH-9J2PPS0CM83RL9r1', qty: 1 };
//const input = { function: 'mint', qty: 10 };
const input = { function: 'deposit', tokenId: 'x6d-DSpzXkGvpd7PhS189pSkLTs8tE7jySZpRxLzjdM', txID: 'CHECKING FCP'};

/******* MODIFY INPUTS */

const arweave = Arweave.init({
    host: process.env.ARWEAVE_HOST,
    protocol: process.env.ARWEAVE_PROTOCOL,
    port: process.env.ARWEAVE_PORT,
    logging: true
});
const gatewayConfig = {
    host: process.env.ARWEAVE_HOST,
    port: process.env.ARWEAVE_PORT,
    protocol: process.env.ARWEAVE_PROTOCOL 
};

const __dirname = path.resolve();

async function test() {
    const arweave = Arweave.init({
        host: "localhost",
        protocol: "http",
        port: "1984",
        logging: true
    });
    const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json')));
    //let vehicle = await readContract(arweave, contractId);
    let vehicle = await readContract(arweave, contractId, undefined, true);  // Show contract interactions

    //let vehicle = await executeContract(contractId, undefined, gatewayConfig);  // 3EM

    //const {vehicle, validity} = await executeContract()
    //const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json')));
    //let vehicle = await interactRead(arweave, wallet, contractId, input);
    //let vehicle = await interactWrite(arweave, wallet, contractId, input);

    //console.log(await readContract(arweave, contractId));


    //let inputDep = {function:"deposit",tokenId:"aZfiYCuz3pOSfLVKe7Z9NTb6BobppWEFBLRabXX5Om8",txID:"PBzPhywHNKlpwOhe_1ILnXp-FEX7RohxUguLLGtX7BQ"};
    //let inputDep = {function:"deposit",tokenId:"1o62KG14JG-Tj5Bk9RfBEWRNdHfqhjyY1MEIdC5gLSc",txID:"CkyK_QvDEIil7Fxwl6snGlWuh2QKFUY7JozNWe9X_U8"};
    //let vehicle = await interactWriteDryRun(arweave, wallet, contractId, input);

    //console.log(JSON.stringify(tx));



    console.log("VEHICLE: " + JSON.stringify(vehicle));

}

async function readTags(coolTag) {
    let tx = await arweave.transactions.get(coolTag);

    tx.get('tags').forEach(tag => {
        let key = tag.get('name', {decode: true, string: true});
        let value = tag.get('value', {decode: true, string: true});
        console.log(`${key} : ${value}`);    
    });
}

async function runQuery(query, errorMsg, cursor = "") {
    try {
        let response = await arweave.api.post("graphql", {
            query: query,
            variables: { "cursor": cursor }
        });

        if (response.status !== 200) {
            response = null;
        }

        if (response) {
            console.log(JSON.stringify(response.data.data.transactions.edges));
        } else {
            console.log("NOTHING");
        }

/********** */
        // const edges = response.data.data.transactions.edges;
        // let i = 1;
        // for (let edge of edges) {
        //     console.log("READING " + i + ": " + edge.node.id);
        //     console.log("CURSOR: " + edge.cursor);
        //     //let vehicle = await readContract(arweave, edge.node.id, undefined, true);
        //     i++;
        // }
        // console.log("# Vehicles: " + i);
/********* */
    } catch(e) {
        console.log(errorMsg + e);
    }
}

async function runQueryCursor(query, cursor = "") {
    console.log("Cursor: " + cursor);
    try {
        let response = await arweave.api.post("graphql", { query: query, variables: {cursor: cursor} });

        if (response.status !== 200) {
            response = null;
        }

        if (response) {
            console.log(JSON.stringify(response.data.data.transactions.edges));
        } else {
            console.log("NOTHING");
        }

        console.log("*** PAGES ***");
        const edges = response.data.data.transactions.edges;
        const hasNextPage = response.data.data.transactions.pageInfo.hasNextPage;
        let nextPage = {};
        nextPage.lastCursor = "";
        nextPage.hasNextPage = hasNextPage;
        let i = 1;
        for (let edge of edges) {
            console.log("READING " + i + ": " + edge.node.id);
            console.log("CURSOR: " + edge.cursor);
            //let vehicle = await readContract(arweave, edge.node.id, undefined, true);
            nextPage.lastCursor = edge.cursor;
            i++;
        }
        return nextPage;

    } catch(e) {
        console.log("ERROR: " + e);
    }
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
            return allTags[i].value;
        }
    }
}

async function getBalances() {
    const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json')));
    const client = new Verto(
        wallet,
        new Arweave({
          host: "www.arweave.run",
          port: "443",
          protocol: "https",
        }),
        true,
        {
          COMMUNITY_CONTRACT: "ppk1GzzOU2hwjEUMqVkqyAvsj-BPakNzuEKEzhJtyJE",
          CLOB_CONTRACT: "ySwuiyQGm-jDDa2OD1ub6QLWTCklOxkPesnaJnmoFUc",
          CACHE_CONFIG: {
            CONTRACT_CDN: "https://storage.googleapis.com/verto-exchange-contracts-stage",
            CACHE_API: "https://verto-qa.wn.r.appspot.com",
          },
          EXCHANGE_CONTRACT: "krW6M5Y1zqcWorlWjSURE-C7s0UsLO5whuOBLDecNlg",
        }
      );
      const balances = await client.user.getBalances("ewTkY6Mytg6C0AtYU6QlkEg1oH-9J2PPS0CM83RL9rk");
    //const result = await fetchBalancesForAddress(wallet);
    console.log(JSON.stringify(balances));
}

async function getTokens() {
    const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json')));
    const client = new Verto(
        wallet,
        new Arweave({
          host: "www.arweave.run",
          port: "443",
          protocol: "https",
        }),
        true,
        {
          COMMUNITY_CONTRACT: "ppk1GzzOU2hwjEUMqVkqyAvsj-BPakNzuEKEzhJtyJE",
          CLOB_CONTRACT: "ySwuiyQGm-jDDa2OD1ub6QLWTCklOxkPesnaJnmoFUc",
          CACHE_CONFIG: {
            CONTRACT_CDN: "https://storage.googleapis.com/verto-exchange-contracts-stage",
            CACHE_API: "https://verto-qa.wn.r.appspot.com",
          },
          EXCHANGE_CONTRACT: "krW6M5Y1zqcWorlWjSURE-C7s0UsLO5whuOBLDecNlg",
        }
      );
    const tokens = await client.token.getTokens();
    console.log(tokens);
}
async function listToken(tokenId) {
    const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json')));
    const client = new Verto(
        wallet,
        new Arweave({
          host: "www.arweave.run",
          port: "443",
          protocol: "https",
        }),
        true,
        {
          COMMUNITY_CONTRACT: "ppk1GzzOU2hwjEUMqVkqyAvsj-BPakNzuEKEzhJtyJE",
          CLOB_CONTRACT: "ySwuiyQGm-jDDa2OD1ub6QLWTCklOxkPesnaJnmoFUc",
          CACHE_CONFIG: {
            CONTRACT_CDN: "https://storage.googleapis.com/verto-exchange-contracts-stage",
            CACHE_API: "https://verto-qa.wn.r.appspot.com",
          },
          EXCHANGE_CONTRACT: "krW6M5Y1zqcWorlWjSURE-C7s0UsLO5whuOBLDecNlg",
        }
    );

    try {
        const interactionID = await client.token.list(tokenId, "community");
        console.log("Token listed: " + interactionID);
    } catch(e) {
        console.log("ERROR trying to list token on Verto: " + e);
    }
}

test();
//await listToken("OHkn6sN7xuA16R_is2Ddh-ByrFjayDxSNuUw-LiZP0I");
//await getBalances();


//await getTokens();


//readTags(contractId);
//readTags("Vjt13JlvOzaOs4St_Iy2jmanxa7dc-Z3pDk3ktwEQNA");

// let query = `query($cursor: String) {
//     transactions(
//         tags: [ 
//             { name: "Protocol", values: ["${ process.env.SMARTWEAVE_TAG_PROTOCOL }"] },
//             { name: "Contract-Src", values: ["xPHfo-cc_7mZ7pjB2rXOyAfspfcRKM8_kbLO06JNtWI"] }
//         ]
//         first: 100
//         after: $cursor
//     )
//     { pageInfo { hasNextPage }
//         edges { cursor node { id } }
//     }
// }`;

let query = `query($cursor: String) {
    transactions(
        tags: [ 
            { name: "Protocol", values: ["AFTR-TEST-v5"] }, 
            { name: "Contract-Src", values: ["yl0H7WbNAOiJF1VbzJTILdLVH06Pqo2lka6ay5p7jI8"] }
    ]
        after: $cursor
    ) {
  	pageInfo { hasNextPage }
    edges {
    	cursor
		node { id, owner {address}, block {height}, tags{name, value} } 
    }
  }
}`;
// let query = `query($cursor: String) {
//     transactions(
//         tags: [
//             { name: "App-Name", values: ["SmartWeaveContract"] },
//             { name: "Protocol", values: ["AFTR-TEST-v2"] }
//         ]
//         after: $cursor
//     ) {
//         pageInfo {
//             hasNextPage
//         }
//         edges {
//             cursor
//             node { id } 
//         }
//     }
// }`;
// let query = `query($cursor: String) {
//     transactions(
//         tags: [ { name: "Protocol", values: ["AFTR-TEST-v3"] } ]
//         after: $cursor
//     )
//     { pageInfo { hasNextPage }
//         edges { cursor node { id } }
//     }
// }`;


// let query = `query($cursor: String) {
//     transactions(
//         tags: [
//             { name: "Protocol", values: ["AFTR-PLAY"] },
//             { name: "Aftr-Playground", values: ["BLUE"] },
//             { name: "Aftr-Playground-Version", values: ["AFTR-PLAY"] }                                
//         ]
//         after: $cursor
//     )
//     { pageInfo { hasNextPage }
//         edges { cursor node { id } }
//     }
// }`;
//runQuery(query, "Error running query: ");

// let i = 0;
// let nextPageInfo = { lastCursor: "", hasNextPage: true};
// nextPageInfo = await runQueryCursor(query);
// //console.log("RES: " + JSON.stringify(nextPageInfo));
// i++;
// console.log("Page " + i);

// while (nextPageInfo.hasNextPage) {
//     nextPageInfo = await runQueryCursor(query, nextPageInfo.lastCursor);
//     i++;
//     console.log("Page " + i);
// }

//let aftrContractSrcId = await getContractSourceId("XMqXf1D4NHcSVNfku3vnXPl7mF3iqw-U4OUHRKtjmvo");
//console.log(aftrContractSrcId);

//let vehicle = await readContract(arweave, "tC4k2NpJoXNDbnBMhQw02o7lmKLqHfsOQcQ9u8wF3a4", undefined, true);

//three_em run --host localhost --port 1984 --protocol http --contract-id NDA1VhYqkt_Z9kAlES_fe1OXxNdOwvP30J8vGvBc0gk
//three_em run --host www.arweave.run --protocol https --contract-id DlsykD_fJ3m7yAzCvFgRdb0W1jgGWe4LcAHJzrRx99A  --show-validity true --show-errors true

//three_em run --contract-id du1NxgooOxqDRg7N2eXiP5ozI5bbZu0VT4QBtDEjuwE --show-validity true --show-errors true