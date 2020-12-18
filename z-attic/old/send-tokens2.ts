//const nearAPI = require('near-api-js');
import {KeyPairEd25519} from "../../near-api/utils/key-pair.js"
import * as TX from "../../near-api/transaction.js"
import * as near from "../../near-api/near-rpc.js"

import * as sha256 from 'js-sha256';

import { getConfig } from './config.js'
import BN from 'bn.js';

import {serialize,base_decode} from "../../near-api/utils/serialize.js"

//import * as KP from "./keypair.js"
//nearAPI.utils.key_pair = undefined;

//this is required if using a local .env file for private key
//require('dotenv').config();
const util = require('util');

/**
 * convert nears expressed as a js-number with MAX 6 decimals into a yoctos-string
 * @param n amount in near MAX 4 DECIMALS
 */
export function ntoy(n:number):BN{
  const asBN=new BN(n*1e4)
  const BN1e20=new BN("1".padEnd(21,"0"))
  asBN.imul(BN1e20) // near * 1e(4+20)
  return asBN
}

/**
 * returns amount truncated to 4 decimal places
 * @param yoctos amount expressed in yoctos
 */
export function yton(yoctos:BN): number{
  const asNBN20 = yoctos.div(new BN("1".padEnd(21, "0")))
  return asNBN20.toNumber()/1e4 // div by 1e(20+4)
}

// configure accounts, network, and amount of NEAR to send
const sender = 'lucio.testnet';
const receiver = 'luciotato2.testnet';
const config = getConfig('testnet');
const amountY = ntoy(0.25);

// sets up NEAR connection based on networkId
//const provider = new nearAPI.providers.JsonRpcProvider(config.nodeUrl);

// creates keyPair used to sign transaction
const privateKey = "5dXosrrX9edUVWCuRZ2gmYqrFhrssqjmE5RWTVszEPceTdaX9pfHJMJNnbSTRFt3E5qd2NX1fmFZAW4N1TZxRoet";
const keyPair = KeyPairEd25519.fromString(privateKey);

async function main() {
  console.log('Processing transaction...');

  // gets sender's public key
  const publicKey = keyPair.getPublicKey();

  // gets sender's public key information from NEAR blockchain 
  const accessKey = await near.access_key(sender,publicKey.toString());

  // // checks to make sure provided key is a full access key
  if(accessKey.permission !== 'FullAccess') {
      return console.log(
        `Account [ ${sender} ] does not have permission to send tokens using key: [ ${publicKey} ]`
        );
    };

  // converts a recent block hash into an array of bytes 
  // this hash was retrieved earlier when creating the accessKey (Line 26)
  // this is required to prove the tx was recently constructed (within 24hrs)
  const recentBlockHash = base_decode(accessKey.block_hash);
 
  // each transaction requires a unique number or nonce
  // this is created by taking the current nonce and incrementing it
  const nonce = accessKey.nonce //++accessKey.nonce;
  
  // constructs actions that will be passed to the createTransaction method below
  const actions = [TX.transfer(amountY)];
  console.log("transferring",yton (amountY),"NEARS")

  // create transaction
  const transaction = TX.createTransaction(
    sender, 
    publicKey, 
    receiver, 
    nonce, 
    actions, 
    recentBlockHash
    );

  // // before we can sign the transaction we must perform three steps...
  // // 1) serialize the transaction in Borsh
  // const serializedTx = serialize(
  //   TX.SCHEMA, 
  //   transaction
  //   );
  // // 2) hash the serialized transaction using sha256
  // const serializedTxHash = new Uint8Array(sha256.sha256.array(serializedTx));
  // // 3) create a signature using the hashed transaction
  // const signature = keyPair.sign(serializedTxHash);
  //------
    // -- all of the above is done in createSignedTransaction(transaction,keyPair)
  //------

  // now we can create the signed transaction :)
  const signedTransaction  = TX.createSignedTransaction(transaction,keyPair)

  // new nearAPI.transactions.SignedTransaction({
  //   transaction,
  //   signature: new nearAPI.transactions.Signature({ 
  //     keyType: transaction.publicKey.keyType, 
  //     data: signature.signature 
  //   })
  // });

  // send the transaction!
  try {
    // sends transaction to NEAR blockchain via JSON RPC call and records the result
    const result = await near.broadcast_tx_commit_signed(signedTransaction)
    // console results :)
    console.log('Transaction Results: ', util.inspect(result.transaction));
    console.log('--------------------------------------------------------------------------------------------')
    console.log('OPEN LINK BELOW to see transaction in NEAR Explorer!');
    console.log(`${config.explorerUrl}/transactions/${result.transaction.hash}`);
    console.log('--------------------------------------------------------------------------------------------');
  } catch (error) {
    console.log(error);
  };
};

// run the function
main();
