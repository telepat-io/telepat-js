'use strict';

var Event = function (logger) {
  this.log = logger;
  this.eventFunctions = {};
};

Event.prototype.jet = function () {
  console.log(this);
};

Event.prototype.on = function (name, callback) {
  this.eventFunctions[name] = callback;
};

Event.prototype.emit = function (args) {
  this.log.debug('Emitting ' + arguments[0] + ' event');
  var params = Array.prototype.slice.call(arguments);
  params.shift();
  if (typeof this.eventFunctions[arguments[0]] !== 'undefined') {
    this.eventFunctions[arguments[0]].apply(this, params);
  }
};

module.exports = Event;