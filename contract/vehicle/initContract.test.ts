import { JWKInterface } from "arweave/node/lib/wallet";
import { StateInterface } from "./faces";
import { createContract, interactWrite, readContract } from "smartweave";
import fs from "fs";
import path from "path";
import ArLocal from "arlocal";
import Arweave from "arweave";

let arweave: Arweave;
let arlocal: ArLocal;

const port = 1984;
const EXAMPLE_TOKEN_ID = "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A";

describe("Test the collection contract", () => {
  let CONTRACT_ID: string;
  let wallet1: {
    address: string;
    jwk: JWKInterface;
  } = { address: "", jwk: undefined };
  let wallet2: {
    address: string;
    jwk: JWKInterface;
  } = { address: "", jwk: undefined };

  async function state(): Promise<StateInterface> {
    return await readContract(arweave, CONTRACT_ID);
  }

  beforeAll(async () => {
    arlocal = new ArLocal(port, false);

    await arlocal.start();

    arweave = new Arweave({
      host: "localhost",
      port,
      protocol: "http"
    });

    /******* Test wallets */
    wallet1.jwk = await arweave.wallets.generate();
    wallet2.jwk = await arweave.wallets.generate();
    wallet1.address = await arweave.wallets.getAddress(wallet1.jwk);
    wallet2.address = await arweave.wallets.getAddress(wallet2.jwk);

    await arweave.api.get(`/mint/${wallet1.address}/1000000000000`);
    await arweave.api.get(`/mint/${wallet2.address}/1000000000000`);


    const __dirname = path.resolve();
    const mine = () => arweave.api.get("mine");
    const contractSrc = new TextDecoder().decode(
      fs.readFileSync(path.join(__dirname, 'keyfile.json')))

      console.log(contractSrc)
  })
})