import { JWKInterface } from "arweave/node/lib/wallet";
import { StateInterface } from "./faces";
import { createContract, interactWrite, readContract } from "smartweave";
import ArLocal from "arlocal";
import Arweave from "arweave";
const fs = require('fs');
const path = require('path');

jest.setTimeout(1200000);

let arweave: Arweave;
let arlocal: ArLocal;

const port = 1984;
const EXAMPLE_TOKEN_ID = "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A";

const mine = () => arweave.api.get("mine");

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
    //arlocal = new ArLocal(port);

    //await arlocal.start();

    arweave = Arweave.init({
      host: "localhost",
      port,
      protocol: "http"
    });

    wallet1.jwk = await arweave.wallets.generate();
    wallet2.jwk = await arweave.wallets.generate();
    wallet1.address = await arweave.wallets.getAddress(wallet1.jwk);
    wallet2.address = await arweave.wallets.getAddress(wallet2.jwk);

    await arweave.api.get(`/mint/${wallet1.address}/1000000000000`);
    await arweave.api.get(`/mint/${wallet2.address}/1000000000000`);

    const __dirname = path.resolve();

    let contractSource = fs.readFileSync(path.join(__dirname, '/build/vehicle/contract.js'), "utf8");
    let initState = fs.readFileSync(path.join(__dirname, '/tests/contracts/aftrInitState.json'), "utf8");

    CONTRACT_ID = await createContract(arweave, wallet1.jwk, contractSource, initState);

    await mine();

  })

  it("should update settings", async () => {
    let data = await interactWrite(arweave, wallet1.jwk, CONTRACT_ID, {
      function: 'propose',
      type: 'set',
      key: 'settings.quorum',
      value: .01
    });
    await mine();

    console.log(data, CONTRACT_ID)
    expect(data).toEqual(data);
  });

  afterAll(async () => {
    //await arlocal.stop();
  });

})