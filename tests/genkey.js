import Arweave from 'arweave';
import path from "path";
import { join } from "path";
import { writeFileSync } from "fs";

const arweave = Arweave.init({
    host: process.env.ARWEAVE_HOST,
    protocol: process.env.ARWEAVE_PROTOCOL,
    port: process.env.ARWEAVE_PORT,
    logging: true
});

const __dirname = path.resolve();

async function generateWallet() {
    arweave.wallets.generate().then((key) => {
      console.log("Generated key:\n", key);
      writeFileSync(join(__dirname, "keyfile-test.json"), JSON.stringify(key));
      console.log('Written file into "keyfile-test.json"');
    });
}

generateWallet();