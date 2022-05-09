const walletAddr = "ewTkY6Mytg6C0AtYU6QlkEg1oH-9J2PPS0CM83RL9rk";

const input1 = { 
    function: "invoke",
    foreignContract: "tgt",
    invocation: "{function: 'transfer', target: " + walletAddr + ", qty: 1}"
};

const input2 = {
    function: "readOutbox",
    contract: "src"
};

function ThrowError(msg) {
    console.log(msg);
}

const stateSrc = {
    id: "src",
    name: "Blue Horizon",
    ticker: "BLUE",
    balances: {
        "abd7DMW1A8-XiGUVn5qxHLseNhkJ5C1Cxjjbj6XC3M8": 12300,
        "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I": 1000,
        "9h1TtwLLt0gZzvtxZAyzWaAsKze9ni71TYqkIfZ4Mgw": 2000,
        "ewTkY6Mytg6C0AtYU6QlkEg1oH-9J2PPS0CM83RL9rk": 5000,
        "tNGSQylZv2XyXEdxG-MeahZTLESNdw35mT3uy4aTdqg": 10000
    },
    invocations: [],
    foreignCalls: []
};

const stateTgt = {
    id: "tgt",
    balances: {
       "src": 1000 
    },
    "invocations": [],
    "foreignCalls": []
};


function invoke(input) {
    if (input.function === "invoke") {
        // Ensure that the interaction has an invocation object
        if (!input.invocation) {
            ThrowError("Missing function invocation.");
        }
    
        if (typeof input.invocation !== 'string') {
            ThrowError("Invalid invocation.");
        }
      
        // Ensure that the interaction has a foreign contract ID
        if (!input.foreignContract) {
            ThrowError("Missing Foreign Contract ID.");
        }
    
        if (typeof input.foreignContract !== 'string') {
            ThrowError("Invalid Foreign Contract ID.");
        }
      
        if (typeof input.foreignContract !== 'string') {
            ThrowError("Invalid input.");
        }
    
        // Prevent contract from calling itself
        if (input.foreignContract === stateSrc.id) {
            ThrowError("A Foreign Call cannot call itself.");
        }
    
        // Push call to foreignCalls
        stateSrc.foreignCalls.push({
            txID: 1000,
            contract: input.foreignContract,
            input: input.invocation
        });
      
    }
}

function readOutbox(input) {
    if (input.function === "readOutbox") {
        // Ensure that a contract ID is passed
        if (!input.contract) {
            ThrowError("Missing contract to invoke.");
        }
      
        // Read the state of the foreign contract
        const foreignState = stateSrc;
      
        // Check if the foreign contract supports the foreign call protocol and compatible with the call
        if (!foreignState.foreignCalls) {
            ThrowError("Contract is missing support for foreign calls");
        }
      
        // Get foreign calls for this contract that have not been executed
        const calls = foreignState.foreignCalls.filter((element) => element.contract === stateTgt.id && !stateTgt.invocations.includes(element.txID));
      
        // Run all invocations
        let res = stateTgt;
      
        for (const entry of calls) {
          // Run invocation
          //res = (await handle(res, { caller: input.contract, input: entry.input })).state;
          console.log({ caller: input.contract, input: entry.input });
          
          // Push invocation to executed invocations
          res.invocations.push(entry.txID);
        }
      
        //stateTgt = res;
    }

}

invoke(input1);

readOutbox(input2);

console.log("SRC: " + JSON.stringify(stateSrc));
console.log("TGT: " + JSON.stringify(stateTgt));