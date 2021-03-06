/*****************************************************
* Copyright (c) 2019, GaraheSoft 
* <support@garahesoft.com> All rights reserved.
*
* This is the database setup & connection file. 
* Compatible for MySQL and MariaDB.
******************************************************/
var mysql = require('mysql');
var config = require('./dbconfig.js');

var connObj = { 
    client: null, 
    status: "disconnected",
    connect: function () {
        //Keep trying to connect to database every 3 seconds
        //until the connection becomes successful
        var intervalhandle = setInterval(function() {
            var client = new mysql.createConnection(config);
            client.connect(function(err) {
                if (err) {
                    console.error("Unable to connect to database");
                    client.end();
                    return;
                }
                clearInterval(intervalhandle);
                connObj.client = client;
                connObj.status = "connected";
                console.log ("Connection to MySql database @ " + config.host + ":" + config.port + " is successful.");
            });
        }, 3000);
    }
};

module.exports = connObj;
