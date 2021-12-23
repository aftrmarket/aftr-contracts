export function handle(state, action) {
    const balances = state.balances;
    const input = action.input;
    const caller = action.caller;
    
    if(input.function === 'increment') {
        // If the caller already is a key of balances, increment, if not, set it to 1.
        if(caller in balances) {
          balances[caller]++;
        } else {
          balances[caller] = 1;
        }
    }

    return { state };
  }