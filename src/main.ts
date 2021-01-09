import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as http from 'http';
import * as url from 'url';

import { BareWebServer, respond_error } from './bare-web-server.js';
import { tail } from "./util/tail.js"
import * as near from './near-api/near-rpc.js';
import * as network from './near-api/network.js';

const MONITORING_PORT=7001

const hostname = os.hostname()
const prodMode = false
network.setCurrent(prodMode? "mainnet":"testnet")
const MASTER_ACCOUNT = prodMode? "dia.oracles.near":"dia.oracles.testnet"
const GATEWAY_CONTRACT_ID = "contract."+MASTER_ACCOUNT;

const StarDateTime = new Date()
let TotalPollingCalls = 0
let TotalRequests = 0 //total requests discovered
let TotalRequestsResolved = 0 //total requests resolved
let TotalRequestsResolvedWithErr = 0 //total requests resolved but with err instead of data


//------------------------------------------
function showWho(resp:http.ServerResponse){
  resp.write(`<p>Network:<b>${network.current}</b> - contract: <b>${GATEWAY_CONTRACT_ID}</b></p>`)
}

//------------------------------------------
//Main HTTP-Request Handler - stats server
//------------------------------------------
function appHandler(server: BareWebServer, urlParts: url.UrlWithParsedQuery, req: http.IncomingMessage, resp: http.ServerResponse) {

  resp.on("error", (err) => { console.error(err) })

  //urlParts: the result of nodejs [url.parse] (http://nodejs.org/docs/latest/api/url.html)
  //urlParts.query: the result of nodejs [querystring.parse] (http://nodejs.org/api/querystring.html)

  try {
    if (urlParts.pathname === '/favicon.ico') {
      respond_error(404, "", resp)
    }
    else if (urlParts.pathname === '/ping') {
      resp.end("pong");
    }
    else if (urlParts.pathname === '/shutdown') {
      resp.end("shutdown");
      process.exit(1);
    }
    else
      //GET some page, return HTML
      //base header
      server.writeFileContents('index1-head.html', resp, {hostname:hostname});
      //config info
      showWho(resp)
      //base center
      server.writeFileContents('index2-center.html', resp);
      //GET / (root) adds stats
      if (urlParts.pathname === '/') { //stats
        resp.write(`
          <table>
          <tr><td>Start</td><td>${StarDateTime.toString()}</td></tr>    
          <tr><td>Total Polling Calls</td><td>${TotalPollingCalls}</td></tr>    
          <tr><td>Total Requests Discovered</td><td>${TotalRequests}</td></tr>    
          <tr><td>Total Requests Resolved</td><td>${TotalRequestsResolved}</td></tr>    
          <tr><td> * with data</td><td>${TotalRequestsResolved - TotalRequestsResolvedWithErr}</td></tr>    
          <tr><td> * with err</td><td>${TotalRequestsResolvedWithErr}</td></tr>    
          </table>
          `);
      }
      //GET /log adds process log
      else if (urlParts.pathname === '/log') {
        resp.write("<pre>");
        resp.write(tail("main.log"));
        resp.write("</pre>");
        server.writeFileContents('index3-footer.html', resp);
      }
      else {
        resp.write(`<p>invalid path ${urlParts.pathname}</p>`);
      }
      //close </html> page
      server.writeFileContents('index3-footer.html', resp);
      resp.end();
    }
  catch (ex) {
    try {
      respond_error(505, ex.message, resp)
    }
    catch { }
    console.log(ex)
  }
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

class RequestResponseErrData {
  public request_id: string = "";
  public err: string = "";
  public data: any = null;
}

//------------------------------
//--  fetch api.diadata.org
//------------------------------
async function fetchDiaJson(keyPlusParam: string): Promise<RequestResponseErrData> {

  let response = new RequestResponseErrData();

  try {

    const fullEndpoint = "https://api.diadata.org/v1/" + keyPlusParam

    const fetchResult = await fetch(fullEndpoint)
    const jsonData = await fetchResult.json()

    if (!fetchResult.ok) throw Error(fullEndpoint + " " + fetchResult.status + " " + fetchResult.statusText)
    if (!jsonData) throw Error(fullEndpoint + " ERR:EMPTY RESPONSE")
    if (jsonData.errorcode) { //some error reported by the diadata server. e.g. unexistent coin
      throw Error(fullEndpoint + " " + JSON.stringify(jsonData))
    }
    response.data = jsonData;
  }
  catch(ex){
    response.err = ex.message
  }

  return response
}

//-------------------------------------------------
// resolve a request by calling Dia api endpoint 
// and then calling the originating contract with the data
//-------------------------------------------------
async function resolveDiaRequest(r: PendingRequest) {

  console.log(r.contract_account_id, r.request_id, r.data_key, r.data_item)

  TotalRequests++;

  let keyAndParams = r.data_key;
  if (r.data_item) keyAndParams = keyAndParams + "/" + r.data_item;

  //try to gey DIADATA API response (err,data)
  let response: RequestResponseErrData = await fetchDiaJson(keyAndParams)

  //always send response (request_id,err,data) to calling contract
  response.request_id = r.request_id;
  console.log("RESPONDING: near.call", r.contract_account_id, r.callback, response, 200)

  //send response to originating contract by calling the callback
  try {
  await near.call(r.contract_account_id, r.callback, response, credentials.account_id, credentials.private_key, 100)
  }
  catch(ex){
    if (ex.message.indexOf("Panicked")) {
      console.error(ex.message); //log and continue
    }
    else throw ex; //escalate
  }
  
  TotalRequestsResolved++
  if (response.err) TotalRequestsResolvedWithErr++;
}

//------------------------------------------------------
//check for pending requests in the SC and resolve them
//------------------------------------------------------
async function checkPending() {

  if (!credentials.private_key) throw Error("INVALID CREDENTIALS FILE")

  const pendingReqCount = await near.view(GATEWAY_CONTRACT_ID, "get_pending_requests_count", {})

  TotalPollingCalls++

  if (pendingReqCount > 0) {

    const pendingRequests: PendingRequest[] = await near.view(GATEWAY_CONTRACT_ID, "get_pending_requests", {})

    for (let r of pendingRequests) {
      try {
        //try to resolve this request
        await resolveDiaRequest(r)
        //once resolved, remove request from pending list in GATEWAY_CONTRACT_ID
        console.log("REMOVE REQUEST",r.contract_account_id,r.request_id)
        await near.call(GATEWAY_CONTRACT_ID, "remove", { contract_id: r.contract_account_id, request_id: r.request_id }, credentials.account_id, credentials.private_key, 50)
      }
      catch(ex){
        //just log the error and try the next one
        console.error("ERR", ex.message)
      }
    }
  }
}

//----------------------
// Get signing credentials
//-----------------------
console.log(process.cwd())
const homedir = os.homedir()
const CREDENTIALS_FILE = path.join(homedir,".near-credentials/default/"+MASTER_ACCOUNT+".json")
let credentials = {account_id:"", private_key:""};
try {
  let credentialsString = fs.readFileSync(CREDENTIALS_FILE).toString();
  credentials = JSON.parse(credentialsString)
} catch(ex){
  console.error(ex.message);
}

// -----------
//Start Server
//------------
//We start a barebones minimal web server to monitor dia-adapter stats
//When a request arrives, it will call appHandler(urlParts, request, response)
//we assuming cwd() == "/dist", so public_html is at ../public_html
const server = new BareWebServer('../public_html', appHandler, MONITORING_PORT)
server.start()

//check for pending requests in the SC and resolve them
pollingLoop();

//-----------------
//Loops checking for pending requests in the SC every 10 seconds and resolving them 
//-----------------
let loopsExecuted=0;
async function pollingLoop() {


  //check if there are pending requests and resolve them
  try {
    await checkPending();
  }
  catch (ex) {
    console.error("ERR", ex.message)
  }

  loopsExecuted++;
  if (loopsExecuted>=2000) {
    //2000 loops cycle finished- gracefully end process, pm2 will restart it
    server.close()
    return;
  }
  else {
    //check again in 10 seconds
    setTimeout(pollingLoop, 10000)
  }

}
