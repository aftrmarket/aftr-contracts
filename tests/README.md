# Testing
 
test.js has been written to test the AFTR base contract. To test, make sure that you have configured your .env file to point to a running Arweave instance. The example below will show a local instance running (Arlocal).

The test file uses a local wallet (save your keyfile.json file to the root directory of the project). Then, adds several source contracts and initial states to your local Arweave instance. Then lastly, it adds the latest AFTR contract. Make sure you build the contract before running this script.  Here's an example:

```
// Start Arlocal using the persist option so that it saves the contracts
npx arlocal --persist
```

So far, package.json is configured to build the contract and run tests.

```
// When you update the contract, make sure you build it so that it's ready for the test script
npm run build-contract
```

Now you're ready to run the test script.

```
// Load the data to your local Arlocal instance
npm run init
```

Note that if you stop the Arlocal instance and start it again without the persist option, all the loaded test data will be erased. If you do that by mistake, simply run the test script again.