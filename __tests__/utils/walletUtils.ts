import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from "arweave/node/lib/wallet";
import { PstState, Warp, PstContract, LoggerFactory, WarpFactory, ArWallet } from 'warp-contracts';
import fs from 'fs';
import fsAsync from 'fs/promises';
import path from 'path';
import request from 'supertest';

import * as warp from './warpUtils'

class Wallet {
    id: number;
    jwk: JWKInterface;
    address: string;
    constructor(id: number, jwk: JWKInterface, address: string) {
        this.id = id;
        this.jwk = jwk;
        this.address = address;
    }
}

class WalletGenerator {
    arweave: Arweave;
    static id = 0;

    constructor(arweave: Arweave) {
        this.arweave = arweave;
    }

    /**
     * Generates n wallets on this.arweave
     * @param n number of wallets to generate
     * @returns Wallet[] of generated wallets
     */
    async generate(n = 1) {
        if (n < 1) {
            throw ("generate(n): 'n' must be > 0");
        }
        const many = n != 1;
        let wallets = [];
        for (; n > 0; n--) {
            wallets.push(await this.buildWallet());
        }
        return wallets;
    }

    async buildWallet() {
        let id = WalletGenerator.id++;
        let jwk = await this.arweave.wallets.generate();
        let address = await this.arweave.wallets.getAddress(jwk);

        // Give wallet a balance
        const server = "http://localhost:" + this.arweave.getConfig().api.port;
        const route = '/mint/' + address + '/100000000000000';     // Amount in Winstons
        const mintRes = await request(server).get(route);

        return new Wallet(id, jwk, address);
    }

    /**
     * Build a wallet from a JSON file
     * @param filename Must be inside of /__tests__/utils/
     * @returns as Wallet with given jwk
     */
    async buildWalletFromFile(filename: string) {
        let id = WalletGenerator.id++;
        let jwk = JSON.parse(fs.readFileSync(path.join(__dirname, filename), 'utf-8'));
        let address = await this.arweave.wallets.getAddress(jwk);

        // Give wallet a balance
        const server = "http://localhost:" + this.arweave.getConfig().api.port;
        const route = '/mint/' + address + '/100000000000000';     // Amount in Winstons
        const mintRes = await request(server).get(route);

        return new Wallet(id, jwk, address);
    }
}

export {
    Wallet, WalletGenerator
};

// this.id = WalletGenerator.id++;
// this.address = arweave.wallets.jwkToAddress(this.jwk);