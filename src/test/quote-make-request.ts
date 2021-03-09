import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as url from 'url';

import * as near from '../near-api/near-rpc.js';
import * as network from '../near-api/network.js';

const testMode = true
network.setCurrent(testMode? "testnet":"mainnet")
const MASTER_ACCOUNT = testMode? "dia-test.testnet": "dia-oracles.near"
const GATEWAY_CONTRACT_ID = "contract."+MASTER_ACCOUNT;

const TEST_CONTRACT_ID = "quote-test-client."+MASTER_ACCOUNT


//-----------------
//checks if the test-contract received a response
//-----------------
let last_req_id: number = 0;
async function checkResult() {
    try {
        console.log("near.view", TEST_CONTRACT_ID, "get_callback_response")
        let result = await near.view(TEST_CONTRACT_ID, "get_callback_response", {})
        if (result.request_id!==last_req_id) {
            console.log("result:", JSON.stringify(result))
            last_req_id = result.request_id;
        }
    }
    catch (ex) {
        console.error("ERR", ex.message)
    }
}

//-----------------
//Loops forcint the test contract to make a request to the gateway-contract
//-----------------
async function makeRequest() {
    try {
        console.log("near.call", TEST_CONTRACT_ID, "make_request")
        await near.call(TEST_CONTRACT_ID, "make_request", { data_key: "quote", data_item: "DIA" }, credentials.account_id, credentials.private_key, 100)
    }
    catch (ex) {
        console.error("ERR", ex.message)
    }

    //check result in every 5 seconds, 3 times
    for (let secs=10;secs<=20;secs+=5) setTimeout(checkResult, secs*1000)

    //do the test again 1 minute  later
    setTimeout(makeRequest, 60000)
}

//----------------------
// Get signing credentials
//-----------------------
const homedir = require('os').homedir()
const CREDENTIALS_FILE = path.join(homedir,".near-credentials/default/"+MASTER_ACCOUNT+".json")
let credentialsString = fs.readFileSync(CREDENTIALS_FILE).toString();
let credentials = JSON.parse(credentialsString)

//enter a test loop, where the test contract makes a request and receives response
makeRequest();
