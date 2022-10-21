// import { WarpFactory } from "warp-contracts";
import Arweave from "arweave";

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
    } catch (e) {
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

async function warpWrite(wallet, contractId, input, internalWrites = true, bundling = true) {
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
    } catch (e) {
        console.log(e);
        return "";
    }
};

async function warpCreateContract(wallet, source, initState, currentTags = undefined, aftr = false) {
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
    } catch (e) {
        console.log("ERROR deploying AFTR contract: " + e);
        return {};
    }
};

async function warpCreateFromTx(wallet, initState, srcId, currentTags = undefined, aftr = false) {
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
    } catch (e) {
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
    } catch (e) {
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
        tags.push({ name: "Protocol", value: process.env.SMARTWEAVE_TAG_PROTOCOL });
        tags.push({ name: "Implements", value: ["ANS-110"] });
        tags.push({ name: "Type", value: ["token", "vehicle"] });
    }

    return tags;
};

export {
    warpInit,
    warpRead,
    warpWrite,
    warpCreateContract,
    warpCreateFromTx,
    arweaveInit,
    addTags
};