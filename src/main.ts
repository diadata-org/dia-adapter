var path = require('path');
var fs = require('fs');
import * as http from 'http';
import * as  url from 'url';

//import BareWebServer
import { BareWebServer, respond_error } from './bare-web-server.js';
import * as near from './near-api/near-rpc.js';
import * as network from './near-api/network.js';
import { randomBytes } from './near-api/tweetnacl/core/random.js';


const CONTRACT_ID ="dia-sc.testnet"
network.setCurrent("testnet")

const StarDateTime = new Date()
let TotalPollingCalls=0
let TotalRequests = 0 //total requests discovered
let TotalRequestsResolved = 0 //total requests resolved
let TotalRequestsResolvedWithErr = 0 //total requests resolved but with err instead of data

//------------------------------------------
//Main HTTP-Request Handler - stats server
//------------------------------------------
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
    public err:string = "";
    public data:any = null;
}

//------------------------------
//--  fetch api.diadata.org
//------------------------------
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
async function resolveDiaRequest(r: PendingRequest) {
  console.log(r.contract_account_id, r.request_id, r.data_key, r.data_item)
  let result = new ErrData()
  TotalRequests++;
  switch (r.data_key) {
    case "symbols":
      result = await fetchDiaJson("symbols")
      break;
    
    case "quote":
      result = await fetchDiaJson("quotation/" + r.data_item)
      break;

    default:
      result.err = "invalid data_key " + r.data_key
  }
  //always send result (err,data) to calling contract
  console.log("near.call",r.contract_account_id, r.callback, result, 200)
  //await near.call(r.originatingContract, r.callbackMethod, { err: err, data: data }, 100)
  TotalRequestsResolved++
  if (result.err) TotalRequestsResolvedWithErr++;
}

//-------------------------------------------------
//check for pending requests in the SC and resolve them
//-------------------------------------------------
let seqId = 0;
async function checkPending() {
  const pendingReqCount = await near.view(CONTRACT_ID, "get_pending_requests_count", {})
  TotalPollingCalls++
  
  if (pendingReqCount > 0) {
  
    const pendingRequests: PendingRequest[] = await near.view(CONTRACT_ID, "get_pending_requests", {})
    
    for(let r of pendingRequests){
      await resolveDiaRequest(r)
      //if resolved, remove pending from pending list in CONTRACT_ID
      //await near.call(CONTRACT_ID,"remove_request",{originating_contract:diaRequest.originatingContract, requestId:diaRequest.requestId},50)
    }
  }


}

//-----------------
//Loops checking for pending requests in the SC and resolving them every 10 seconds
//-----------------
async function pollingLoop(){
  //loop checking preiodically if there are pending requests
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
const server = new BareWebServer('public_html', appHandler, 7000)
server.start();

//check for pending requests in the SC and resolve them
pollingLoop();
