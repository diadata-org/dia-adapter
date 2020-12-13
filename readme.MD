# DIA-NEAR-adapter

The dia-near adapter is a server process dedicated to fulfill requests posted on the smart contract `dia.oracles.near` in the NEAR blockchain

Requests sent to `dia.oracles.near` within the NEAR blockchain, are periodically polled, the data retrieved from [DIA endpoints](diadata.org), and then sent back to the contract requesting the data by a call to the specified callback function. e.g.
`near call [requestring-contract-account-id] [callback-method] { "err":"", "data":[dia-api-call-result] }

## Example

TODO - example code for a request quote-BTC request and example callback-response

## Technical details

This nodejs server is written in typescript. 

It polls requests by periodically calling `dia.oracles.near.get_pending_requests_count()` and `dia.oracles.near.get_pending_requests()`

The requests to process have the followind information:

* originating contract account id (String)
* request id (U128)
* requested data-key (String)
* data-item (String)
* callback method (String)

### Request cycle

The `dia-adapter server` is periodically polling the `dia.oracles.near` smart contract by using `get_pending_requests` and will react to pending requests by:
* Query the corresponding DIA API endpoint for the data
* Prepare and execute a NEAR transaction with a function call to the originating contract’s callback method, including the the contract-specific request ID, the data-key, data-item and the data information retrieved from the DIA API endpoint
* The transaction will be signed by `dia.oracles.near` so the originating contract can verify the data source by controlling `env::signer_account_id` in the callback
* `dia-adapter` records the request contract+ID as serviced and calls `dia.oracles.near.remove()` to remove the request from the pending list

### Stats report

Bedisdes servicig `dia.oracles.near` within the NEAR blockchain, this server exposes an HTTP endpoint in port 8000 to:
* query current stats (requests retireve, serviced, with data, with error)
* shutdown the process
* keep-alive response for the process watchdog

TODO stats image extample

## Deploy Instructions
TODO

## Developers
TODO

## Test
TODO

## Watchdog process
TODO
