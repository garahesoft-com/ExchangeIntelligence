var querystring = require('querystring');
var https = require('https');
var http = require('http');
var request = require('request');
var crypto = require('crypto');
var Fs = require('fs')
var db = require ("./db.js");

//Consts
const DBANGKOFEE = 0.002; //DBangko fee is 0.2% right now
const RETRYLIMIT = 10; //The number of times to retry on failed operations

//Env variables
//process.env.UV_THREADPOOL_SIZE = 128;

var tapiConfig = {
    //put extra configurations for tapi calls here
}

require('seneca')({
    timeout: 60000
})

.add(
    {cmd: "exWallAddr"},
    function(message, done) {
        var ret = {to: null}
        
        var depositAddrParams = {
            coinName: message.crypto,
            need_new: 0
        }
        
        callYobitTapi(tapiConfig, 'GetDepositAddress', depositAddrParams, function(depositaddrresp) {
            if (depositaddrresp
                && depositaddrresp.success
                && depositaddrresp.success == 1
                && depositaddrresp.return.address) {
                ret.to = depositaddrresp.return.address;
            }
                    
            done(null, ret);
        });
    }
    )

.add(
    {cmd: "exRate"},
    function(message, done) {
        var ret = {};
        if (message && message.pair) {
            var pair = encodeURIComponent(message.pair.toLowerCase());
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

                if (firstObj && firstObj.buy)
                    ret.usdrate = firstObj.buy;

                done(null, ret);
            }

            callRESt(messageparam, "POST", null, callbackRESt);
        } else {
             console.error("Invalid contents for message");
             done(null, ret);
        }
    }
    )

.add(
    {cmd: "exFee"},
    function(message, done) {
        var ret = {dbangkofee: DBANGKOFEE};
        if (message && message.pair) {
            var messageparam = {
                host: "yobit.io",
                endpoint: "/api/2/" + encodeURIComponent(message.pair.toLowerCase()) + "/fee",
                protocol: "https"
            }

            var callbackRESt = function(response) {
                if (response && response.fee_seller) {
                    ret.percentagefee = response.fee_seller / 100;
                    //ret.dbangkofee = DBANGKOFEE; 
                }

                done(null, ret);
            }

            callRESt(messageparam, "POST", null, callbackRESt);
        } else {
            console.error("Invalid contents for message");
            done(null, ret);
        }
    }
    )

.add(
    {cmd: "paymentServiceFee"},
    function(message, done) {
        var ret = {
            PAYEER: {
                descfee: "5%", 
                numfee: 0.05, 
                numaddendum: 0
            },
            advcash: {
                descfee: "2%", 
                numfee: 0.02, 
                numaddendum: 0
            },
            visamaster: {
                descfee: "5% + 6 USD [2300 USD max charge]", 
                numfee: 0.05, 
                numaddendum: 6
            },
            BTC: {
                descfee: "0.0012 BTC", 
                numfee: 0.00120000, 
                numaddendum: 0
            },
            ETH: {
                descfee: "0.005 ETH", 
                numfee: 0.00500000, 
                numaddendum: 0
            },
            DOGE: {
                descfee: "100 DOGE", 
                numfee: 100.00000000, 
                numaddendum: 0
            },
            WAVES: {
                descfee: "0.002 WAVES", 
                numfee: 0.00200000, 
                numaddendum: 0
            }
        };
        
        done (null, ret);
    }
    )
    
.add(
    {cmd: "isTokenSupported"},
    function(message, done) {
        var ret = {supported: false};
        if (message 
            && message.token
            && message.destcrypto) {
            var messageparam = {
                host: "yobit.io",
                endpoint: "/api/3/info",
                protocol: "https"
            }

            var callbackRESt = function(response) {
                var pair = message.token.toLowerCase() + "_" + message.destcrypto.toLowerCase();
                if (response && response.pairs)
                    ret.supported = pair in response.pairs;
                    
                done(null, ret);
            }

            callRESt(messageparam, "POST", null, callbackRESt);
        } else {
            console.error("Invalid contents for message");
            done(null, ret);
        }
    }
    )
    
.add(
    {cmd: "executeEx"},
    function(message, done) {
        //message format
        //crypto: eth/tokenname,
        //destcrypto: coinname,
        //amount: <amount>,
        //txhash: hash,
        //exrate: rate,
        //dbangkofee: fee,
        //exchangefee: fee,
        //withdrawdestination: destination,
        //withdrawmode: mode
        
        var ret = {status: "fail"};
        if (message 
            && message.txhash 
            && message.crypto
            && message.amount
            && message.destcrypto
            && message.exrate
            && message.dbangkofee
            && message.exchangefee
            && message.withdrawmode
            && message.withdrawdestination
            && db.status == "connected") {
            
            db.client.query("INSERT INTO transactions(txhash,srccoin,srcamount,exchangerate,destcoin,destamount,dbangkofee,exchangefee,withdrawamount,dbangkosavings,destmode,destaddress,withdrawstatus) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", 
            [message.txhash,message.crypto,message.amount,message.exrate,message.destcrypto,0,message.dbangkofee,message.exchangefee,0,0,message.withdrawmode,message.withdrawdestination,'none'], 
            function(err, result) {
                if (err) {
                    db.client.end();
                    console.error(err);
                    done(null, ret);
                }
            });
            
            message['getinforetrylimit'] = 0;
            tradeWithdraw(message);
            ret.status = 'pending';
            done(null, ret);

        } else {
            console.error("Invalid contents for message or is not connected to database");
            done(null, ret);
        }
    }
    )
    
.add(
    {cmd: "getTWStatus"},
    function(message, done) {
        var ret = {withdrawstatus: "none"};

        if (message && message.txhash) {
            db.client.query("SELECT withdrawstatus FROM transactions WHERE txhash='" + message.txhash + "'",
            function(err, result, fields) {
                if (err) {
                    console.error(err);
                    db.client.end();
                    done(null, ret);
                }
                
                done (null, result[0]);
            });
        } else {
            console.error("Invalid contents for message");
            done(null, ret);
        }
    }
    )
    
.add(
    {cmd: "getTransferStatus"},
    function(message, done) {
        var ret = {status: 'none'};
        
        if (message && message.txhash) {
            var messageparam = {
                host: "etherscan.io",
                endpoint: "/tx/" + message.txhash,
                protocol: "https",
                headers: {'Content-Type': "text/html"}
            }
            
            callRESt(messageparam, "POST", null, function(response) {
                if (response && response.data) {
                    if (response.data.indexOf('Success') > -1)
                        ret.status = 'success'
                }
                
                done (null, ret);
            });
        } else {
            console.error("Invalid contents for message");
            done(null, ret);
        }
    }
    )
    
.listen({
    type: 'http',
    port: '10101',
    host: '139.162.25.42',
    protocol: 'https',
    serverOptions : {
      key : Fs.readFileSync('ssl/dbangko.com.key', 'utf8'),
      cert : Fs.readFileSync('ssl/dbangko.com.crt', 'utf8')
    }
})

var tradeWithdraw = function(message) {
callYobitTapi(tapiConfig, 'getInfo', null, function(inforesp) {
    if (inforesp 
        && inforesp.success
        && inforesp.success == 1
        && inforesp.return.funds
        && inforesp.return.funds[message.crypto.toLowerCase()]
        && inforesp.return.funds[message.crypto.toLowerCase()] >= message.amount) {
        
        db.client.query("UPDATE transactions SET withdrawstatus=? WHERE txhash=?", 
        ['pending',message.txhash], 
        function(err, result) {
            if (err) {
                db.client.end();
                console.error(err);
                return;
            }
        });

        //Get the updated exchange rate before executing the trade
        var pair = encodeURIComponent(message.crypto.toLowerCase() + '_' + message.destcrypto.toLowerCase());
        var exrateparam = {
            host: "yobit.io",
            endpoint: "/api/3/ticker/" + pair,
            protocol: "https"
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
                message['pair'] = pair;
                message['newrate'] = firstObj.buy;
                message['exwdraw'] = true;
                message['orderinforetrylimit'] = 0;
                
                tradeSell(message);
            }
        });
    } else {
        console.error("The deposited amount hasn't arrived yet, requerying...");
        if (message.getinforetrylimit < RETRYLIMIT) { //limit the retries
            setTimeout(function() {
                tradeWithdraw(message);
            }, 4000);
            ++message.getinforetrylimit;
        } else {
            console.error("The deposited amount hasn't arrived yet, requery retry limit is reached");
            message.getinforetrylimit = 0;
            
            db.client.query("UPDATE transactions SET withdrawstatus=? WHERE txhash=?", 
            ['rpending',message.txhash], 
            function(err, result) {
                if (err) {
                    db.client.end();
                    console.error(err);
                    return;
                }
            });
        }
    }
});
}

var tradeSell = function(message) {

    var tradeParams = {
        pair: message.pair,
        type: 'sell',
        rate: message.newrate,
        amount: message.amount
    }
    
    callYobitTapi(tapiConfig, 'Trade', tradeParams, function(traderesp) {
        if (traderesp 
            && traderesp.success
            && traderesp.success == 1) {
            db.client.query("UPDATE transactions SET withdrawstatus=? WHERE txhash=?", 
            ['tsuccess',message.txhash], 
            function(err, result) {
                if (err) {
                    db.client.end();
                    console.error(err);
                    return;
                }
            });
            
            var orderInfoParams = {order_id: traderesp.return.order_id}
            
            if (message.exwdraw)
                withdraw(message, orderInfoParams);

        } else {
            console.error("Sell trade of " + message.amount + " " + message.pair + " failed");
            console.error(traderesp.error);
            db.client.query("UPDATE transactions SET withdrawstatus=? WHERE txhash=?", 
            ['tfail',message.txhash], 
            function(err, result) {
                if (err) {
                    db.client.end();
                    console.error(err);
                    return;
                }
            });
        }
    });
}

var withdraw = function(message, orderInfoParams) {
callYobitTapi(tapiConfig, 'OrderInfo', orderInfoParams, function(orderinforesp) {
    if (orderinforesp 
        && orderinforesp.success
        && orderinforesp.success == 1
        && orderinforesp.return
        && orderinforesp.return[orderInfoParams.order_id]
        && orderinforesp.return[orderInfoParams.order_id].status
        && orderinforesp.return[orderInfoParams.order_id].status == 1) {

        var examount = message.amount * message.newrate;
        examount = formatDecimal(examount, message.destcrypto, false);
        //var exchangefee = examount * message.exchangefee;
        //exchangefee = formatDecimal(exchangefee, message.destcrypto);
        var dbangkofee = examount * message.dbangkofee; // take the dbangko fee
        //dbangkofee = formatDecimal(dbangkofee, message.destcrypto);
        var withdrawamount = examount - (/*exchangefee +*/ dbangkofee);
        withdrawamount = formatDecimal(withdrawamount, message.destcrypto, false);
        var dbangkosavings = (examount - withdrawamount) /*+ exchangefee*/;
        dbangkosavings = formatDecimal(dbangkosavings, message.destcrypto, true);
        
        var withdrawParams = {
            coinName: message.destcrypto,
            amount: withdrawamount,
            address: message.withdrawdestination
        }
        
        callYobitTapi(tapiConfig, 'WithdrawCoinsToAddress', withdrawParams, function(withdrawresp) {
            if (withdrawresp
                && withdrawresp.success
                && withdrawresp.success == 1) {
                
                db.client.query("UPDATE transactions SET destamount=?,withdrawamount=?,dbangkosavings=?,withdrawstatus=? WHERE txhash=?", 
                [examount,withdrawamount,dbangkosavings,'wsuccess',message.txhash], 
                function(err, result) {
                    if (err) {
                        db.client.end();
                        console.error(err);
                        return;
                    }
                });
            } else {
                console.error("Failed to withdraw " + withdrawamount + " " + message.destcrypto + " to " + message.withdrawdestination);
                db.client.query("UPDATE transactions SET withdrawstatus=? WHERE txhash=?", 
                ['wfail',message.txhash], 
                function(err, result) {
                    if (err) {
                        db.client.end();
                        console.error(err);
                        return;
                    }
                });
            }
        });
    } else {
        console.error("Sell order is not yet closed, requerying...");
        if (message.orderinforetrylimit < RETRYLIMIT) { //limit the retries
            setTimeout(function() {
                withdraw(message, orderInfoParams);
            }, 4000);
            ++message.orderinforetrylimit;
        } else {
            console.error("Sell order is not yet closed, requery retry limit is reached");
            message.orderinforetrylimit = 0;
            db.client.query("UPDATE transactions SET withdrawstatus=? WHERE txhash=?", 
            ['wfail',message.txhash], 
            function(err, result) {
                if (err) {
                    db.client.end();
                    console.error(err);
                    return;
                }
            });
        }
    }
});
}

var formatDecimal = function(decimaldata, coin, isfee) {
    var ret = decimaldata.toString();
    var retidx = ret.indexOf(".");
    if (retidx == -1)
        ret = "0";
    var deciCount = 0;
    switch (coin) {
        case "usd":
            isfee ? deciCount = 8 : deciCount = 2;
            if (retidx > -1)
                ret = ret.slice(retidx, deciCount + 2);
            break;
        case "btc":
        case "doge":
        case "waves":
            isfee ? deciCount = 8 : deciCount = 8;
            if (retidx > -1)
                ret = ret.slice(retidx, deciCount + 2);
            break;
        case "eth":
            isfee ? deciCount = 18 : deciCount = 8;
            if (retidx > -1)
                ret = ret.slice(retidx, deciCount + 2);
            break;
        default:
            console.error("Invalid coin");
            break;
    }
    return (Math.floor(decimaldata) + (ret * 1));
}
    
var callRESt = function(message, method, data, success) {
    if (!message) {
        console.error("message parameter is not defined");
        return;
    }
    var dataString = "";
    if (data) {
        if (data.constructor.name != 'String')
            dataString = JSON.stringify(data);
        else
            dataString = data;
    }
    var headers = {};
    if (message.headers)
        headers = message.headers;
    
    var endpoint = message.endpoint;

    if (method == 'GET') {
        if (data) {
            if (data.constructor.name != 'String')
                endpoint += '?' + querystring.stringify(data);
            else
                endpoint += '?' + data;
        }
    } else if (method == 'POST') {
        headers['Keep-Alive'] = 'timeout=15, max=5';
        if (!headers['Content-Type'])
            headers['Content-Type'] = 'application/json'; //Set default Content-Type if no property found
        headers['Content-Length'] = dataString.length;
    } else {
        console.error("Invalid Http method, valid values are GET/POST");
        return;
    }

    var options = {
        host: message.host,
        path: endpoint,
        method: method,
        headers: headers
    };
    var connobj = message.protocol == 'https' ? https : http;
    var req = https.request(options, function(res) {
        res.setEncoding('utf-8');
        var responseString = '';

        res.on('data', function(data) {
            responseString += data;
        });

        res.on('end', function() {
            var responseObject = {};
            try {
                if (options.headers['Content-Type'] === 'text/html')
                    responseObject = {data: responseString};
                else
                    responseObject = JSON.parse(responseString);
            } catch(exception) {
                console.error(exception.message);
            } finally {
                success(responseObject);
            }
        });
    });
    req.on('error', (err) => {
        console.error(err.message);
    });

    req.write(dataString);
    req.end();
}

var callYobitTapi = function(config, method, methodparams, callback) {
    if (!methodparams)
        methodparams = {};
        
    db.client.query("SELECT * FROM tapi WHERE nonce < 2147483646 ORDER BY id",
    function(err, result, fields) {
        if (err) {
            console.error(err);
            db.client.end();
            return;
        }
        
        if (!config['nonce']){
            config = result[0];
        }
        
        methodparams['method'] = method;
        methodparams['nonce'] = config.nonce;

        if (config.nonce < 2147483646) {
            db.client.query("UPDATE tapi SET nonce=? WHERE id=?", 
            [++config.nonce,config.id], 
            function(err, res) {
                if (err) {
                    db.client.end();
                    console.error(err);
                }
            });
        } else {
            console.error("nonce exceeds the allowable limit of 2147483646");
            return;
        }
        
        var data = "";
        for (var paramelem in methodparams) {
            data += paramelem + "=" + methodparams[paramelem] + "&";
        }
        data = data.substr(0, data.length-1);
        
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
            protocol: "https",
            headers: tapiHeaders
        }
        
        callRESt(tapiReqParams, 'POST', data, callback);
    });
}
