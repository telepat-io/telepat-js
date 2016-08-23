import log from './logger';

export default class Event {
  constructor() {
    this.eventFunctions = {};
  }

  on(name, callback) {
    if (typeof this.eventFunctions[name] !== 'object') {
      this.eventFunctions[name] = {};
    }

    let index = Date.now() + Object.keys(this.eventFunctions[name]).length;

    this.eventFunctions[name][index] = callback;
    return index;
  }

  removeCallback(name, index) {
    delete this.eventFunctions[name][index];
  }

  emit(args) {
    log.debug('Emitting ' + arguments[0] + ' event');
    let params = Array.prototype.slice.call(arguments);

    params.shift();
    if (typeof this.eventFunctions[arguments[0]] !== 'undefined') {
      let callbacks = this.eventFunctions[arguments[0]];

      for (let index in callbacks) {
        callbacks[index].apply(this, params);
      }
    }
  };
}
