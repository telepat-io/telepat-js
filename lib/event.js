var log = require('./logger');

var Event = {}
var eventFunctions = {};

Event.on = function (name, callback) {
  eventFunctions[name] = callback;
}

Event.emit = function (args) {
  log.debug('Emitting ' + arguments[0] + ' event');
  var params = Array.prototype.slice.call(arguments);
  if (typeof eventFunctions[arguments[0]] !== 'undefined')
    eventFunctions[arguments[0]].apply(this, params);
}

module.exports = Event;