import { DeployPlugin, ArweaveSigner } from 'warp-contracts-plugin-deploy';
import { WarpFactory } from 'warp-contracts';
import path from 'path';
import fs from 'fs';
import Arweave from 'arweave';
import request from 'supertest';

const __dirname = path.resolve();
const mine = () => arweave.api.get("mine");

const arweave = Arweave.init({
    host: "localhost",
    protocol: "http",
    port: 1984
});

async function test(env = "LOCAL") {
    const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, 'keyfile-test.json')));

    if (env === "LOCAL") {
        // For ArLocal, a wallet needs AR to call createSource
        const addr = await arweave.wallets.jwkToAddress(wallet);    
        const server = "localhost:1984";
        const route = '/mint/' + addr + '/100000000000000';     // Amount in Winstons
        let balance = await arweave.wallets.getBalance(addr);
        if (balance < 10000000000000) {
            const mintRes = await request(server).get(route);
            balance = await arweave.wallets.getBalance(addr);
        }
        console.log("WALLET ADDR: " + addr + ", BALANCE: " + balance);
    }

    const contractSrc = fs.readFileSync(path.join(__dirname, '/tests/contracts/latestAftrSource.js'), 'utf8');
    let warp = {};
    let newSource = {};

    if (env === "LOCAL") {
        warp = WarpFactory.forLocal().use(new DeployPlugin());
        newSource = await warp.createSource({ src: contractSrc}, wallet);
    } else if (env === "TEST") {
        warp = WarpFactory.forTestnet().use(new DeployPlugin());
        newSource = await warp.createSource({ src: contractSrc}, new ArweaveSigner(wallet));
    } else if (env === "PROD") {
        warp = WarpFactory.forMainnet().use(new DeployPlugin());
        newSource = await warp.createSource({ src: contractSrc}, new ArweaveSigner(wallet));
    }
    
    const newSrcId = await warp.saveSource(newSource);
    console.log("NEW SOURCE ID: " + newSrcId);
}

const ENV = "LOCAL";
test(ENV);