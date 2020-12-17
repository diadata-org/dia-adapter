/*
   
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


*/