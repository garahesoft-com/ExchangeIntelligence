var querystring = require('querystring');
var https = require('https');
var crypto = require('crypto');

var callRESt = function(message, method, data, success) {
    var dataString = "";
    if (data && data.constructor.name != 'String') {
        dataString = JSON.stringify(data);
    } else if (data) {
        dataString = data;
    }

    var headers = {};
    if (message.headers)
        headers = message.headers;

    var endpoint = message.endpoint;

    if (method == 'GET') {
        if (data)
            endpoint += '?' + querystring.stringify(data);
    } else {
        //headers['Keep-Alive'] = 'timeout=15, max=5';
        if (!headers['Content-Type'])
            headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = dataString.length;
    }

    var options = {
        host: message.host,
        port: message.port,
        path: endpoint,
        method: method,
        headers: headers
    };

    console.log(options);
    
    var req = https.request(options, function(res) {
        res.setEncoding('utf-8');

        var responseString = '';

        res.on('data', function(data) {
            responseString += data;
        });

        res.on('end', function() {
            var responseObject = {};
            try {
                if (options.headers['Content-Type'] == 'text/html') {
                    responseObject = {html: responseString};
                } else {
                    responseObject = JSON.parse(responseString);
                }
            } catch(exception) {
                console.error(exception.message);
            } finally {
                success(responseObject);
            }
        });
    });
    req.on('error', (err) => {
        console.error("err" + err.message);
    });

    req.write(dataString);
    req.end();
}

var callYobitTapi = function(config, method, methodparams, callback) {
    if (!methodparams)
        methodparams = {};
    methodparams['method'] = method;
    methodparams['nonce'] = config.nonce;
    config.nonce < 2147483646 ? ++config.nonce: config.nonce = 1;
    
    var data = "";
    for (var paramelem in methodparams) {
        data += paramelem + "=" + methodparams[paramelem] + "&";
    }
    data = data.substr(0,data.length-1);
    //data = encodeURIComponent(data);
    console.log(data);
    var hash = crypto.createHmac('sha512', config.secret);
    hash.update(data);
    var signature = hash.digest('hex');
    
    var tapiHeaders = {
        'Sign': signature,
        'Key': config.key,
        'User-Agent': "Mozilla/5.0",
        'Content-Type': "application/x-www-form-urlencoded"
    }
    
    var tapiReqParams = {
        host: "yobit.io",
        endpoint: "/tapi/",
        port: 443,
        headers: tapiHeaders
    }
    
    callRESt(tapiReqParams, 'POST', data, callback);
}

function testOutboundYobit() {
    var pair = 'eth_btc';
    var messageparam = {
        host: "yobit.io",
        endpoint: "/api/3/ticker/" + pair,
        protocol: "https"
    }

    var callbackRESt = function(response) {
        var firstObj;
        for(var key in response) {
            if(response.hasOwnProperty(key)) {
                firstObj = response[key];
                break;
            }
        }
        var usdrate;
        if (firstObj && firstObj.buy)
            usdrate = firstObj.buy;

        console.log(usdrate);
    }

    callRESt(messageparam, "POST", null, callbackRESt);
}

function testTxStatus() {
    var messageparam = {
        host: "etherscan.io",
        endpoint: "/tx/0x8a11d08d232a927176044a2943c47a61d0e541283e5070b03e73443fddbf71ca",
        port: 443,
        headers: {'Content-Type': 'text/html'}
    }

    var intervalhandle = setInterval(function() {
        callRESt(messageparam, "POST", null, function(response) {
            if (response) {
                if (response.html) {
                    if (response.html.indexOf('Success') > -1) {
                        clearInterval(intervalhandle);
                        console.log ("Transaction found");
                    } else {
                        console.log ("Transaction not found");
                    }
                } else {
                    console.log(response);
                }
            }
        });
    }, 5000);
}

function testYobitgetInfo() {
    var tapiConfig = {
        nonce: 12,
        key: '334B1FD25EC98B0A366FAE0CA436621F',
        secret: '23aa6528f585def024ef5f539d6d8c76'
    }

    callYobitTapi(tapiConfig, 'getInfo', null, function(inforesp) {
        //console.log(inforesp);
        if (inforesp
            && inforesp.success
            && inforesp.success == 1
            && inforesp.return.funds
            && inforesp.return.funds['eth']
            && inforesp.return.funds['eth'] >= 0
           ) {
            console.log(inforesp.return.funds.eth);
        } else {
            console.error("unable to find fund");
        } 
    });
}

function testYobitOrderInfo() {
    var tapiConfig = {
        nonce: 13,
        key: '334B1FD25EC98B0A366FAE0CA436621F',
        secret: '23aa6528f585def024ef5f539d6d8c76'
    }
    var orderInfoParams = {
        order_id: 100025362
    }
    
    callYobitTapi(tapiConfig, 'OrderInfo', orderInfoParams, function(orderinforesp) {
        console.log(orderinforesp);
        if (orderinforesp
            && orderinforesp.success
            && orderinforesp.success == 1
            && orderinforesp.return[orderInfoParams.order_id]
            && orderinforesp.return[orderInfoParams.order_id].status
            && orderinforesp.return[orderInfoParams.order_id].status == 1
           ) {
            console.log(orderinforesp);
        } else {
            console.error("unable to find order info");
        } 
    });
}

function testYobitTrade() {
    var tapiConfig = {
        nonce: 23,
        key: '334B1FD25EC98B0A366FAE0CA436621F',
        secret: '23aa6528f585def024ef5f539d6d8c76'
    }
    var pair = encodeURIComponent('eth_usd');
    var exrateparam = {
        host: "yobit.io",
        endpoint: "/api/3/ticker/" + pair,
        port: 443
    }
    callRESt(exrateparam, "POST", null, function(exrateresp) {
        var firstObj;
        for(var key in exrateresp) {
            if(exrateresp.hasOwnProperty(key)) {
                firstObj = exrateresp[key];
                break;
            }
        }

        if (firstObj && firstObj.buy) {
        console.log("New rate for " + pair + ": " + firstObj.buy);
            var tradeParams = {
                pair: pair,
                type: 'sell',
                rate: firstObj.buy,
                amount: 0.00000001
            }
            
            callYobitTapi(tapiConfig, 'Trade', tradeParams, function(traderesp) {
                console.log(traderesp);
                if (traderesp
                    && traderesp.success
                    && traderesp.success == 1) {
                    console.log(traderesp);
                } else {
                    console.error("unable to perform trade");
                } 
            });
        }
    });
}

function testYobitWithdraw() {
    var tapiConfig = {
        nonce: 299,
        key: '334B1FD25EC98B0A366FAE0CA436621F',
        secret: '23aa6528f585def024ef5f539d6d8c76'
    }
    var usdamount = 20;
    var exchangefee = usdamount * 0.002;
    var dbangkofee = usdamount * 0.01; // take the 1% dbangko fee
    var withdrawamount = usdamount - exchangefee - dbangkofee;
    
    var withdrawParams = {
        coinName: 'btc',
        amount: 0.03,
        address: 'P84272144'
    }
    console.log(withdrawParams);
    callYobitTapi(tapiConfig, 'WithdrawCoinsToAddress', withdrawParams, function(withdrawresp) {
        console.log(withdrawresp);
        if (withdrawresp
            && withdrawresp.success
            && withdrawresp.success == 1) {
            console.log(withdrawresp);
        } else {
            console.error("Unable to withdraw coins");
        }
    });
}

var intervalhndle;

function intervaltest1() {
    if (intervalhndle)
        clearInterval(intervalhndle);        
}

function intervaltest2() {
    intervalhndle = setInterval(function() {
    console.log("hi")}, 1000);
}
testOutboundYobit();
//testYobitgetInfo();
//testYobitTrade();
//testYobitOrderInfo();
//testYobitWithdraw();
//intervaltest2();
//setTimeout(intervaltest1, 5000);
