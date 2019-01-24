/*******************************************************
* Copyright (c) 2018, Gerald Selvino 
* <gerald.selvino@protonmail.com> All rights reserved.
*
* This is the database configuration file. 
* Compatible for MySQL and MariaDB.
********************************************************/
var config = {
    user: "exintell-user", 
    database: "exintell-db", 
    password: "exintell-pass", 
    host: 'localhost', //db is linked in docker-compose.yml so it is what to use here instead of localhost
                //so that the dockerized BitcoindTxValidator service can connect to the dockerized mariadb
    port: 3306, 
    connectionLimit: 100
};

module.exports = config;
