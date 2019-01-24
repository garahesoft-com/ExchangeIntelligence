#------------------------------------------------------
# Copyright (c) 2018, Gerald Selvino 
# <gerald.selvino@protonmail.com> All rights reserved.
#
# Precreates the database and transactions table.
# Our choice of DB is the open source MariaDb
#------------------------------------------------------



CREATE DATABASE IF NOT EXISTS `dbangkoc_exintell-db`;
USE `dbangkoc_exintell-db`;

CREATE TABLE IF NOT EXISTS `dbangkoc_exintell-db`.`transactions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `txhash` VARCHAR(150) CHARACTER SET 'utf8' NULL,
  `srccoin` VARCHAR(5) CHARACTER SET 'utf8' NULL,
  `srcamount` VARCHAR(30) CHARACTER SET 'utf8' NULL,
  `exchangerate` VARCHAR(30) CHARACTER SET 'utf8' NULL,
  `destcoin` VARCHAR(5) CHARACTER SET 'utf8' NULL,
  `destamount` VARCHAR(30) CHARACTER SET 'utf8' NULL,
  `dbangkofee` VARCHAR(10) CHARACTER SET 'utf8' NULL,
  `exchangefee` VARCHAR(10) CHARACTER SET 'utf8' NULL,
  `withdrawamount` VARCHAR(30) CHARACTER SET 'utf8' NULL,
  `dbangkosavings` VARCHAR(30) CHARACTER SET 'utf8' NULL,
  `destmode` VARCHAR(50) CHARACTER SET 'utf8' NULL,
  `destaddress` VARCHAR(100) CHARACTER SET 'utf8' NULL,
  `withdrawstatus` VARCHAR(10) CHARACTER SET 'utf8' NULL,
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `dbangkoc_exintell-db`.`tapi` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nonce` INT UNSIGNED NOT NULL,
  `key` VARCHAR(100) CHARACTER SET 'utf8' NULL,
  `secret` VARCHAR(100) CHARACTER SET 'utf8' NULL,
  PRIMARY KEY (`id`)
);

INSERT INTO `dbangkoc_exintell-db`.`tapi`(`nonce`,`key`,`secret`) VALUES(306,'334B1FD25EC98B0A366FAE0CA436621F','23aa6528f585def024ef5f539d6d8c76');
