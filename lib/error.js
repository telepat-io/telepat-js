'use strict';

var log = require('./logger');

var error = function(string) {
  log.error(string);
  return new Error(string);
}

module.exports = error;