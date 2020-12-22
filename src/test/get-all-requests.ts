import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as url from 'url';

import * as near from '../near-api/near-rpc.js';
import * as network from '../near-api/network.js';

const CREDENTIALS_FILE = "../../.near-credentials/default/dia-oracles.testnet.json"
const GATEWAY_CONTRACT_ID = "contract.dia-oracles.testnet"
network.setCurrent("testnet")


//struct returned from get_account_info
export type PendingRequest = {
  //the requesting contract
  contract_account_id: string;
  /// A request-id internal to requesting contract
  request_id: string; //U128,
  /// DIA API Key
  data_key: string;
  ///DIA API Item
  data_item: string;
  /// cablack method to invoke with the data
  callback: string;
}

class ErrData {
  public err: string = "";
  public data: any = null;
}

//-------------------------------------------------
//delete all pending requests in the SC 
//-------------------------------------------------
async function showPending() {
  const pendingReqCount = await near.view(GATEWAY_CONTRACT_ID, "get_pending_requests_count", {})
  if (pendingReqCount > 0) {
    console.log(GATEWAY_CONTRACT_ID, "get_pending_requests_count", pendingReqCount)
    const pendingRequests: PendingRequest[] = await near.view(GATEWAY_CONTRACT_ID, "get_pending_requests", {})
    for (let r of pendingRequests) {
      console.log(r)
      if (process.argv[2] == "remove") {
        console.log(GATEWAY_CONTRACT_ID, "remove",r.request_id)
        await near.call(GATEWAY_CONTRACT_ID, "remove", { contract_id: r.contract_account_id, request_id: r.request_id }, credentials.account_id, credentials.private_key, 50)
      }
    }
  }
}


//----------------------
// Get signing credentials
//-----------------------
let credentialsString = fs.readFileSync(CREDENTIALS_FILE).toString();
let credentials = JSON.parse(credentialsString)

//check for pending requests in the SC and resolve them
console.log(process.argv)
showPending();
