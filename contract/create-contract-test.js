import Arweave from 'arweave';
const arweave = Arweave.init({
    host: 'arweave.run',
    protocol: 'https',
    port: 8080
});
async function createContract() {

    
    // Let's first create the contract transaction.
    const contractTx = await arweave.createTransaction({ data: contractSource }, wallet);
    contractTx.addTag('App-Name', 'SmartWeaveContractSource');
    contractTx.addTag('App-Version', '0.3.0');
    contractTx.addTag('Content-Type', 'application/javascript');
    contractTx.addTag('Protocol', 'AFTR-Test');
    
    // Sign
    await arweave.transactions.sign(contractTx, wallet);
    // Let's keep the ID, it will be used in the state transaction.
    const contractSourceTxId = contractTx.id;
    
    // Deploy the contract source
    await arweave.transactions.post(contractTx);
    
    // Now, let's create the Initial State transaction
    const initialStateTx = await arweave.createTransaction({ data: initialState }, wallet);
    initialState.addTag('App-Name', 'SmartWeaveContract');
    initialState.addTag('App-Version', '0.3.0');
    initialState.addTag('Contract-Src', contractSourceTxId);
    initialState.addTag('Content-Type', 'application/json');
    
    // Sign
    await arweave.transactions.sign(initialState, wallet);
    const initialStateTxId = initialState.id;
    // Deploy
    await arweave.transactions.post(initialState);
}
createContract();