import { WarpFactory } from "warp-contracts";

const contractId = "v8pmt9kvVJjxtgbafjtFRhKyRlCAVAuZKkRw-CSuwco";
async function warpTest() {
    const warp = WarpFactory.forLocal();
    const contract = warp.contract(contractId).setEvaluationOptions( { internalWrites: true });

    const result = await contract.readState();
    console.log(JSON.stringify(result.cachedValue));
}

await warpTest();