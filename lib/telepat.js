'use strict';
// # Telepat Javascript Client
// **Telepat** is an open-source backend stack, designed to deliver information and information updates in real-time to clients, while allowing for flexible deployment and simple scaling.

var API = require('./api');
var PouchDB = require('pouchdb');
var log = require('./logger');
var EventObject = require('./event');
var Channel = require('./channel');
var User = require('./user');

// ## Telepat Class
// You use the Telepat class to connect to the backend, login, subscribe and unsubscribe to channels. The object has properties you can access:
// 
// * `contexts`, an array of all the available contexts represented as JSON objects
// * `subscriptions`, an object that holds references to [Channel](http://docs.telepat.io/telepat-js/lib/channel.js.html) objects, on keys named after the respective channel

var Telepat = function () {
  this.db = new PouchDB('_telepat');
  this.Event = new EventObject(log);
  this.apiEndpoint = this.socketEndpoint = null;
  this.socket = null;
  this.ioSessionId = null;
  this.channelTimerInterval = null;
  var self = this;

  this.error = function(string) {
    log.error(string);
    return new Error(string);
  };

  this.user = new User(API, log, this.error, this.Event, function (newAdmin) { self.admin = newAdmin });

  this.updateContexts = function() {
    API.get('context/all', {}, function(err, res) {
        self.contexts = res.body.content;
        self.Event.emit('contexts-update');
      });
  };
};
Telepat.prototype.contexts = null;
Telepat.prototype.subscriptions = {};
Telepat.prototype.admin = null;
Telepat.prototype.user = null;

/**
 * ## Telepat.connect
 *
 * This is the first function you should call to connect to the Telepat backend. 
 *
 * @param {object} options Object containing all configuration options for connection
 */
Telepat.prototype.connect = function (options) {
  var self = this;

  function completeRegistration(res) {
    if (res.body.content.identifier !== undefined) {
      API.UDID = res.body.content.identifier;
      log.info('Received new UDID: ' + API.UDID);

      var newObject = {
        _id: ':deviceId',
        value: res.body.content.identifier
      };
      self.db.get(':deviceId').then(function(doc) {
        newObject._rev = doc._rev;
        log.warn('Replacing existing UDID');
        self.db.put(newObject).catch(function(err) {
          log.warn('Could not persist UDID. Error: ' + err);
        });
      }).catch(function() {
        self.db.put(newObject).catch(function(err) {
          log.warn('Could not persist UDID. Error: ' + err);
        });
      });
    }
    log.info('Connection established');
    // On a successful connection, the `connect` event is emitted by the Telepat object. To listen for a connection, use:
    //
    //     Telepat.on('connect', function () {
    //       // Connected
    //     });
    self.Event.emit('connect');
    self.updateContexts();
    return true;
  }

  function registerDevice() {
    var request = {
      'info':{
        'os': 'web',
        'userAgent': ((typeof navigator !== 'undefined')?navigator.userAgent:'node')
      },
      'volatile': {
        'type': 'sockets',
        'token': self.ioSessionId,
        'active': 1
      }
    };
    API.call('device/register', request, function (err, res) {
        if (err) {
          API.UDID = null;
          API.call('device/register', request, function (err, res) {
            if (err) {
              self.socket.disconnect();
              self.Event.emit('disconnect', err);
              return self.error('Device registration failed with error: ' + err);
            } else {
              return completeRegistration(res);
            }
          });
        } else {
          return completeRegistration(res);
        }
      });
  }

  // Required configuration options:
  if (typeof options !== 'undefined') {
    // - `apiKey`: the API key for the application to connect to
    if (typeof options.apiKey !== 'undefined') {
      API.apiKey = options.apiKey;
    } else {
      return this.error('Connect options must provide an apiKey property');
    }
    // - `appId`: the id of the application to connect to
    if (typeof options.appId !== 'undefined') {
      API.appId = options.appId;
    } else {
      return this.error('Connect options must provide an appId property');
    }
    // - `apiEndpoint`: the host and port number for the API service
    if (typeof options.apiEndpoint !== 'undefined') {
      this.apiEndpoint = options.apiEndpoint;
    } else {
      return this.error('Connect options must provide an apiEndpoint property');
    }
    // - `socketEndpoint`: the host and port number for the socket service
    if (typeof options.socketEndpoint !== 'undefined') {
      this.socketEndpoint = options.socketEndpoint;
    } else {
      return this.error('Connect options must provide an socketEndpoint property');
    }
    // - `timerInterval`: the time interval in miliseconds between two object-monitoring jobs on channels - defaults to 150
    if (typeof options.timerInterval !== 'undefined') {
      this.channelTimerInterval = options.timerInterval;
    }
  } else {
    return this.error('Options object not provided to the connect function');
  }
  
  API.apiEndpoint = this.apiEndpoint + '/';

  this.socket = require('socket.io-client')(this.socketEndpoint, options.ioOptions || {});
  log.info('Connecting to socket service ' + this.socketEndpoint);

  this.socket.on('welcome', function(data) {
    this.ioSessionId = data.sessionId;
    log.info('Got session ID ' + this.ioSessionId);
    self.db.get(':deviceId').then(function(doc) {
      API.UDID = doc.value;
      log.info('Retrieved saved UDID: ' + API.UDID);
      registerDevice();
    }).catch(function() {
      registerDevice();
    });
  });

  this.socket.on('message', function(message) {
    function processOperation(operation) {
      if (Telepat.subscriptions.hasOwnProperty(operation.subscription)) {
        var channel = Telepat.subscriptions[operation.subscription];
        channel.processPatch(operation);
      } else {
        self.Event.emit('error', self.error('Received update on non-existent subscription'));
      }
    }

    log.debug('Received update: ' + JSON.stringify(message));
    var i, operation;
    for (i=0; i<message.data.new.length; i++) {
      operation = message.data.new[i];
      processOperation(operation);
    }
    for (i=0; i<message.data.updated.length; i++) {
      operation = message.data.updated[i];
      processOperation(operation);
    }
    for (i=0; i<message.data.deleted.length; i++) {
      operation = message.data.deleted[i];
      processOperation(operation);
    }
  });

  this.socket.on('context-update', function() {
    self.updateContexts();
  });

  this.socket.on('disconnect', function(){
    self.Event.emit('disconnect');
  });

  return this;
};

/**
 * ## Telepat.setLogLevel
 *
 * You can tweak the logger verbosity using this function.
 *
 * @param {string} level One of `'debug'`, `'info'`, `'warn'` or `'error'`
 */
Telepat.prototype.setLogLevel = function (level) {
  log.setLevel(level);
  return this;
};

/**
 * ## Telepat.on
 *
 * Call this function to add callbacks to be invoked on event triggers.
 *
 * @param {string} name The name of the event to associate the callback with
 * @param {function} callback The callback to be executed
 */
Telepat.prototype.on = function(name, callback) {
  return this.Event.on(name, callback);
};

/**
 * ## Telepat.subscribe
 *
 * Use this function to create a new [Channel](http://docs.telepat.io/telepat-js/lib/channel.js.html) object and connect it to the backend.
 * 
 * You can pass a callback to be invoked on channel subscription. This is equivalent to calling `.on('subscribe' ...)` directly on the returned Channel.
 *
 * @param {Object} options The object describing the required subscription (context, channel, filters)
 * @param {function, optional} onSubscribe Callback to be executed on a successful subscribe
 *
 * @return {Channel} The new [Channel](http://docs.telepat.io/telepat-js/lib/channel.js.html) object
 */
Telepat.prototype.subscribe = function (options, onSubscribe) {
  var channel = new Channel(API, log, this.error, options, this.channelTimerInterval);
  var key = 'blg:'+options.channel.context;
  if (options.channel.user) {
    key += ':users:'+options.channel.user;
  }
  key += ':'+options.channel.model;
  var self = this;
  this.subscriptions[key] = channel;
  channel.subscribe();
  if (onSubscribe !== undefined) {
    channel.on('subscribe', onSubscribe);
  }
  channel.on('_unsubscribe', function () {
    delete self.subscriptions[key];
  });
  return channel;
};

module.exports = Telepat;
