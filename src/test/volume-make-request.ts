import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as url from 'url';

import * as near from '../near-api/near-rpc.js';
import * as network from '../near-api/network.js';

const testMode = true
network.setCurrent(testMode? "testnet":"mainnet")
const MASTER_ACCOUNT = testMode? "dia-oracles.testnet": "dia-oracles.near"
const GATEWAY_CONTRACT_ID = "contract."+MASTER_ACCOUNT;

const TEST_CONTRACT_ID = "volume-test-client."+MASTER_ACCOUNT


//-----------------
//checks if the test-contract received a response
//-----------------
let last_req_id: number = 0;
async function checkResult() {
    try {
        console.log("near.view", TEST_CONTRACT_ID, "get_callback_response")
        let result = await near.view(TEST_CONTRACT_ID, "get_callback_response", {})
        if (result.err || result.request_id!==last_req_id) {
            console.log("result:", JSON.stringify(result))
            last_req_id = result.request_id;
        }
    }
    catch (ex) {
        console.error("ERR", ex.message)
    }
}

function hoursAgoUnixTs(hours:number): number{
    //https://api.diadata.org/v1/volume/BTC?starttime=1589829000&endtime=1589830000
    return Math.trunc((Date.now()-hours*60*60*1000)/1000000)*1000;
}
//-----------------
//Loops forcint the test contract to make a request to the gateway-contract
//-----------------
async function makeRequest() {
    try {
        let dataItem= "BTC?starttime=" + hoursAgoUnixTs(30*24) + "&endtime=" + hoursAgoUnixTs(29*24)
        if (Math.random()>0.7) { 
            //30% of the time, send bad parameters (inverted from-to)
            dataItem= "BTC?starttime=" + hoursAgoUnixTs(200*24) + "&endtime=" + hoursAgoUnixTs(300*24)
        }
        //const dataItem= "BTC?starttime=1589829000&endtime=1589830000"
        console.log("near.call", TEST_CONTRACT_ID, "make_request",dataItem)
        await near.call(TEST_CONTRACT_ID, "make_request", { data_item: dataItem }, credentials.account_id, credentials.private_key, 100)
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
