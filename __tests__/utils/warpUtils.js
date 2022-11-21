import { WarpFactory } from "warp-contracts";
import Arweave from "arweave";

const PORT = 1999

function warpInit() {
    let warp = {};

    try {
        const arweave = arweaveInit();
        //@ts-expect-error
        warp = WarpFactory.forLocal(PORT, arweave);
    } catch (e) {
        console.log(e);
    }
    return warp;
};

async function warpRead(contractId, internalWrites = true) {
    const warp = warpInit();

    try {
        //@ts-expect-error
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
        //@ts-expect-error
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
        console.log(input)
        return "";
    }
};
async function warpDryWrite(wallet, contractId, input, internalWrites = true, bundling = true) {
    const warp = warpInit();
    try {
        //@ts-expect-error
        const contract = warp.contract(contractId)
            .setEvaluationOptions({
                internalWrites: internalWrites,
                disableBundling: !bundling
            })
            .connect(wallet);
        const state = await contract.dryWrite(input);
        return state;
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

    // TODO: Handle tag logic in this function ?
    let tags = addTags(currentTags, aftr);

    const warp = warpInit();
    try {
        //@ts-expect-error
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
        //@ts-expect-error
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
            host: "localhost",
            port: PORT,
            protocol: "http",
            timeout: 20000,
            logging: false,
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
        tags.push({ name: "Protocol", value: "AFTR" });
        tags.push({ name: "Implements", value: ["ANS-110"] });
        tags.push({ name: "Type", value: ["token", "vehicle"] });
    }

    return tags;
};

export {
    warpInit,
    warpRead,
    warpWrite,
    warpDryWrite,
    warpCreateContract,
    warpCreateFromTx,
    arweaveInit,
    addTags,
    PORT
};