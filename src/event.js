import log from './logger';

export default class Event {
  constructor() {
    this.eventFunctions = {};
  }

  on(name, callback) {
    if (Array.isArray(this.eventFunctions[name])) {
      this.eventFunctions[name].push(callback);
    } else {
      this.eventFunctions[name] = [callback];
    }
  }

  emit(args) {
    log.debug('Emitting ' + arguments[0] + ' event');
    var params = Array.prototype.slice.call(arguments);

    params.shift();
    if (typeof this.eventFunctions[arguments[0]] !== 'undefined') {
      var callbackArray = this.eventFunctions[arguments[0]];

      for (var i = 0; i < callbackArray.length; i++) {
        callbackArray[i].apply(this, params);
      }
    }
  };
}
