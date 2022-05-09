import { handle } from "./contract";

function testPropose() {
    // const action = {
    //     "input": {
    //         "function": "multiInteraction",
    //         "type": "set",
    //         "recipient": "",
    //         "target": "",
    //         "qty": 0,
    //         "key": "multi",
    //         "value": "",
    //         "note": "Multi-Interaction",
    //         "actions": [
    //           {
    //             "input": {
    //               "function": "propose",
    //               "type": "set",
    //               "key": "ownership",
    //               "value": "dao"
    //             }
    //           },
    //           {
    //             "input": {
    //               "function": "propose",
    //               "type": "set",
    //               "key": "votingSystem",
    //               "value": "equal"
    //             }
    //           }
    //         ]
    //       },
    //     caller: 'Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I'
    // };
    const action = {
        "input": {    
            "function": "propose",
            "type": "set",
            "key": "ownership",
            "value": "dao",
            "recipient": "",
            "target": "",
            "qty": 0,
            "note": ""
          },
        caller: 'Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I'
    };
    const state = {
        "name": "Blue Horizon",
        "ticker": "AFTR-BLUE",
        "balances": {
            "abd7DMW1A8-XiGUVn5qxHLseNhkJ5C1Cxjjbj6XC3M8": 12300,
            "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I": 1000,
            "9h1TtwLLt0gZzvtxZAyzWaAsKze9ni71TYqkIfZ4Mgw": 2000,
            "CH_52MZm60ewLdc-HGGM1DEk7hljT37Gf45JT5CoHUQ": 5000,
            "tNGSQylZv2XyXEdxG-MeahZTLESNdw35mT3uy4aTdqg": 10000
        },
        "vault" : {},
        "votes" : [],
        "tokens": [
            {
                "id": "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A",
                "ticker": "VRT",
                "source": "tNGSQylZv2XyXEdxG-MeahZTLESNdw35mT3uy4aTdqg",
                "txId": "tx2fasdfoijeo8547",
                "balance": 1000,
                "depositBlock": 646429,
                "lockLength": 10,
                "logo": "9CYPS85KChE_zQxNLi2y5r2FLG-YE6HiphYYTlgtrtg",
                "name": "Verto",
                "total": 20
            },
            {
                "id": "usjm4PCxUd5mtaon7zc97-dt-3qf67yPyqgzLnLqk5A",
                "ticker": "VRT",
                "source": "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I",
                "txId": "tx3fasdfoijeo8547",
                "balance": 20000,
                "depositBlock": 646429,
                "lockLength": 100,
                "logo": "9CYPS85KChE_zQxNLi2y5r2FLG-YE6HiphYYTlgtrtg",
                "name": "Verto",
                "total": 400
            },
            {
                "id": "-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ",
                "ticker": "ARDRIVE",
                "source": "CH_52MZm60ewLdc-HGGM1DEk7hljT37Gf45JT5CoHUQ",
                "txId": "tx6fasdfoijeo8547",
                "balance": 1000,
                "depositBlock": 646429,
                "lockLength": 10,
                "logo": "tN4vheZxrAIjqCfbs3MDdWTXg8a_57JUNyoqA4uwr1k",
                "name": "ArDrive",
                "total": 333.3333333333333
            }
        ],
        "status": "started",
        "tipsAr": 100,
        "tipsMisc": 1000,
        "creator": "Fof_-BNkZN_nQp0VsD_A9iGb-Y4zOeFKHA8_GK2ZZ-I",
        "ownership": "single",
        "settings": [
            [
                "quorum",
                0.5
            ],
            [
                "voteLength",
                2000
            ],
            [
                "lockMinLength",
                100
            ],
            [
                "lockMaxLength",
                10000
            ],
            [
                "communityLogo",
                "KM66oKFLF60UrrOgSx5mb90gUd2v4i0T9RIcK9mfUiA"
            ]
        ],
        "treasury": 753.3333333333333
    };

    try {
        //@ts-expect-error
        const res = handle(state, action);
        console.log(res);
        console.log(JSON.stringify(res));
    } catch (err) {
        console.log(err);
    }
}

testPropose();