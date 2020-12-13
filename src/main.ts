var path = require('path');
var fs = require('fs');
import * as http from 'http';
import * as  url from 'url';

//import BareWebServer
import { BareWebServer, respond_error } from './bare-web-server.js';
import * as near from './near-api/near-rpc.js';
import * as network from './near-api/network.js';
import { randomBytes } from './near-api/tweetnacl/core/random.js';


const CONTRACT_ID ="diversifying.pool.testnet"
network.setCurrent("testnet")

const StarDateTime = new Date()
let TotalPollingCalls=0
let TotalRequests = 0 //total requests discovered
let TotalRequestsResolved = 0 //total requests resolved
let TotalRequestsResolvedWithErr = 0 //total requests resolved but with err instead of data

//--------------------
//Main Request Handler
//--------------------
function appHandler(server: BareWebServer, urlParts: url.UrlWithParsedQuery, req: http.IncomingMessage, resp: http.ServerResponse) {

  //urlParts: the result of nodejs [url.parse] (http://nodejs.org/docs/latest/api/url.html)
  //urlParts.query: the result of nodejs [querystring.parse] (http://nodejs.org/api/querystring.html)

  if (urlParts.pathname === '/') {
    //GET / (root) web server returns:
    server.writeFileContents('index.html', resp);
    resp.end();
    return true;
  }

  else if (urlParts.pathname === '/stats') {
    resp.end(`
    <table>
    <tr><td>Start</td><td>${StarDateTime.toString()}</td></tr>    
    <tr><td>Total Polling Calls</td><td>${TotalPollingCalls}</td></tr>    
    <tr><td>Total Requests Discovered</td><td>${TotalRequests}</td></tr>    
    <tr><td>Total Requests Resolved</td><td>${TotalRequestsResolved}</td></tr>    
    <tr><td> * with data</td><td>${TotalRequestsResolved-TotalRequestsResolvedWithErr}</td></tr>    
    <tr><td> * with err</td><td>${TotalRequestsResolvedWithErr}</td></tr>    
    </table>
    `);

  }
  else if (urlParts.pathname === '/ping') {
    resp.end("pong");
  }
  else if (urlParts.pathname === '/shutdown') {
    process.exit(1);
  }
  else {
    respond_error(500, 'invalid path ' + urlParts.pathname, resp);
  };

  return true;
};

//struct returned from get_account_info
export type GetAccountInfoResult = {
  account_id: string;
  /// The available balance that can be withdrawn
  available: string; //U128,
  /// The amount of SKASH owned (computed from the shares owned)
  skash: string; //U128,
  /// The amount of rewards (rewards = total_staked - skash_amount) and (total_owned = skash + rewards)
  unstaked: string; //U128,
  /// The epoch height when the unstaked was requested
  /// The fund will be locked for NUM_EPOCHS_TO_UNLOCK epochs
  /// unlock epoch = unstaked_requested_epoch_height + NUM_EPOCHS_TO_UNLOCK 
  unstaked_requested_epoch_height: string; //U64,
  ///if env::epoch_height()>=account.unstaked_requested_epoch_height+NUM_EPOCHS_TO_UNLOCK
  can_withdraw: boolean,
  /// total amount the user holds in this contract: account.availabe + account.staked + current_rewards + account.unstaked
  total: string; //U128,

  //-- STATISTICAL DATA --
  // User's statistical data
  // These fields works as a car's "trip meter". The user can reset them to zero.
  /// trip_start: (timpestamp in nanoseconds) this field is set at account creation, so it will start metering rewards
  trip_start: string, //U64,
  /// How many skashs the user had at "trip_start". 
  trip_start_skash: string, //U128,
  /// how much the user staked since trip start. always incremented
  trip_accum_stakes: string, //U128,
  /// how much the user unstaked since trip start. always incremented
  trip_accum_unstakes: string, //U128,
  /// to compute trip_rewards we start from current_skash, undo unstakes, undo stakes and finally subtract trip_start_skash
  /// trip_rewards = current_skash + trip_accum_unstakes - trip_accum_stakes - trip_start_skash;
  /// trip_rewards = current_skash + trip_accum_unstakes - trip_accum_stakes - trip_start_skash;
  trip_rewards: string, //U128,
}

type DiaRequest = {
  originatingContract: string;
  requestId: string;
  dataKey: string;
  dataItem: string;
  callbackMethod: string;
}

class ErrData {
    public err:string = "";
    public data:any = null;
}

async function fetchDiaJson(endpointPlusParam:string) : Promise<ErrData> {

  let response:ErrData;

  const fullEndpoint = "https://api.diadata.org/v1/"+endpointPlusParam
  const fetchResult = await fetch(fullEndpoint)
  let errGetJson:string="";
  let jsonData;
  try{
    jsonData = await fetchResult.json()
  }
  catch(ex){
    errGetJson= ex.message;
    jsonData = undefined;
  }

  if (!fetchResult.ok) throw Error(fullEndpoint + " " + fetchResult.status + " " + fetchResult.statusText)
  if (!jsonData) throw Error(fullEndpoint + " ERR:EMPTY RESPONSE "+errGetJson)
  if (jsonData.errorcode) { //some error reported by the diadata server. e.g. unexistent coin
    throw Error(fullEndpoint + JSON.stringify(jsonData))
  }

  response = new ErrData()
  response.data = jsonData;
  return response
}

//-------------------------------------------------
// resolve a request by calling Dia api endpoint 
// and then calling the originating contract with the data
//-------------------------------------------------
async function resolveDiaRequest(r: DiaRequest) {
  let result = new ErrData()
  TotalRequests++;
  switch (r.dataKey) {
    case "symbols":
      result = await fetchDiaJson("symbols")
      break;
    
    case "quote":
      result = await fetchDiaJson("quotation/" + r.dataItem)
      break;

    default:
      result.err = "invalid data_key " + r.dataKey
  }
  //always send result (err,data) to calling contract
  console.log("near.call",r.originatingContract, r.callbackMethod, result, 100)
  //await near.call(r.originatingContract, r.callbackMethod, { err: err, data: data }, 100)
  TotalRequestsResolved++
  if (result.err) TotalRequestsResolvedWithErr++;
}

//-------------------------------------------------
//check for pending requests in the SC and resolve them
//-------------------------------------------------
let seqId = 0;
async function checkPending() {
  const pendingReqCount = await near.view(CONTRACT_ID, "get_number_of_accounts", {})
  TotalPollingCalls++
  
  if (pendingReqCount > 0) {
  
    const info: GetAccountInfoResult = await near.view(CONTRACT_ID, "get_account_info", { account_id: "asimov.testnet" })
    
    console.log(info.account_id, info.available)
    
    let diaRequest:DiaRequest = {
      originatingContract:"client.contract.testnet",
      callbackMethod:"on_dia_result",
      requestId : (seqId++).toString(),
      dataKey: "quote",
      dataItem: "BTC"
    }
    if (TotalPollingCalls%2==0){ //test-mode, half the time call API "symbols"
      diaRequest.dataKey = "symbols"
      diaRequest.dataItem = "";
    }

    await resolveDiaRequest(diaRequest)
    //if resolved, remove pending from pending list in CONTRACT_ID
    //await near.call(CONTRACT_ID,"remove_request",{originating_contract:diaRequest.originatingContract, requestId:diaRequest.requestId},50)
  }


}

//-----------------
//Loops checking for pending requests in the SC and resolving them every 10 seconds
//-----------------
async function pollingLoop(){
  //loop checking every 10secs if there are pending requests
  try {
    await checkPending();
  }
  catch (ex) {
    console.error("ERR",ex.message)
  }
  //check again in 10 seconds
  setTimeout(pollingLoop, 10000)
}


// -----------
//Start Server
//------------
//We start a barebones minimal web server 
//When a request arrives, it will call appHandler(urlParts, request, response)
const server = new BareWebServer('public_html', appHandler, 8000)
server.start();

//check for pending requests in the SC and resolve them
pollingLoop();
