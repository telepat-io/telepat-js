// # Telepat Javascript Client
// **Telepat** is an open-source backend stack, designed to deliver information and information updates in real-time to clients, while allowing for flexible deployment and simple scaling.

var API = require('./api');
var PouchDB = require('pouchdb');
var db = new PouchDB('_telepat');
var log = require('./logger');
var EventObject = require('./event');
var Event = new EventObject(log);
var Channel = require('./channel');

// ## Telepat Object
// You use the Telepat object to connect to the backend, login, subscribe and unsubscribe to channels. The object has two properties you can access:
// 
// * `contexts`, an array of all the available contexts represented as JSON objects
// * `subscriptions`, an object that holds references to [Channel](http://docs.telepat.io/javascript-sdk/lib/channel.js.html) objects, on keys named after the respective channel

var Telepat = {
  contexts: null,
  subscriptions: {}
};

var apiEndpoint, socketEndpoint;

var socket;
var ioSessionId;

function error(string) {
  log.error(string);
  return new Error(string);
}

function updateContexts() {
  API.get('context/all', {}, function(err, res) {
      Telepat.contexts = res.body;
      Event.emit('contexts-update');
    })
}

/**
 * ## Telepat.connect
 *
 * This is the first function you should call to connect to the Telepat backend. 
 *
 * @param {object} options Object containing all configuration options for connection
 */
Telepat.connect = function (options) {
  function registerDevice() {
    var request = {
      'info':{
        'os': 'web',
        'userAgent': ((typeof navigator !== "undefined")?navigator.userAgent:'node')
      },
      'volatile': {
        'type': 'sockets',
        'token': ioSessionId,
        'active': 1
      }
    };
    API.call('device/register', request, function (err, res) {
        if (err) {
          socket.disconnect();
          Event.emit('disconnect', err);
          return error('Device registration failed with error: ' + err);
        } else {
          if (res.body.identifier !== undefined) {
            API.UDID = res.body.identifier;
            log.info('Received new UDID: ' + API.UDID);

            var revision = null;
            var newObject = {
              _id: ':deviceId',
              value: res.body.identifier
            };
            db.get(':deviceId').then(function(doc) {
              newObject._rev = doc._rev;
              log.warn('Replacing existing UDID');
              db.put(newObject).catch(function(err) {
                log.warn('Could not persist UDID. Error: ' + err);
              });
            }).catch(function(err) {
              db.put(newObject).catch(function(err) {
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
          Event.emit('connect');
          updateContexts();
          return true;
        }
      });
  }

  // Required configuration options:
  if (typeof options !== 'undefined') {
    // - `apiKey`: the API key for the application to connect to
    if (typeof options.apiKey !== 'undefined') {
      API.apiKey = options.apiKey;
    } else {
      return error('Connect options must provide an apiKey property');
    }
    // - `appId`: the id of the application to connect to
    if (typeof options.appId !== 'undefined') {
      API.appId = options.appId;
    } else {
      return error('Connect options must provide an appId property');
    }
    // - `apiEndpoint`: the host and port number for the API service
    if (typeof options.apiEndpoint !== 'undefined') {
      apiEndpoint = options.apiEndpoint;
    } else {
      return error('Connect options must provide an apiEndpoint property');
    }
    // - `socketEndpoint`: the host and port number for the socket service
    if (typeof options.socketEndpoint !== 'undefined') {
      socketEndpoint = options.socketEndpoint;
    } else {
      return error('Connect options must provide an socketEndpoint property');
    }

  } else {
    return error('Options object not provided to the connect function');
  }
  
  API.apiEndpoint = apiEndpoint + '/';

  socket = require('socket.io-client')(socketEndpoint, options.ioOptions || {});
  log.info('Connecting to socket service ' + socketEndpoint);

  socket.on('welcome', function(data) {
    ioSessionId = data.sessionId;
    log.info('Got session ID ' + ioSessionId);
    db.get(':deviceId').then(function(doc) {
      API.UDID = doc.value;
      log.info('Retrieved saved UDID: ' + UDID);
      registerDevice();
    }).catch(function(err) {
      registerDevice();
    });
  });

  socket.on('message', function(message) {
    function processOperation(operation) {
      if (Telepat.subscriptions.hasOwnProperty(operation.subscription)) {
        var channel = Telepat.subscriptions[operation.subscription];
        channel.processPatch(operation);
      } else {
        Event.emit('error', error('Received update on non-existent subscription'));
      }
    }

    log.debug('Received update: ' + JSON.stringify(message));
    for (var i=0; i<message.data.new.length; i++) {
      var operation = message.data.new[i];
      processOperation(operation);
    }
    for (var i=0; i<message.data.updated.length; i++) {
      var operation = message.data.updated[i];
      processOperation(operation);
    }
    for (var i=0; i<message.data.deleted.length; i++) {
      var operation = message.data.deleted[i];
      processOperation(operation);
    }
  });

  socket.on('context-update', function(data) {
    updateContexts();
  });

  socket.on('disconnect', function(){
    Event.emit('disconnect');
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
Telepat.setLogLevel = function (level) {
  log.setLevel(level);
  return this;
}

/**
 * ## Telepat.on
 *
 * Call this function to add callbacks to be invoked on event triggers.
 *
 * @param {string} name The name of the event to associate the callback with
 * @param {function} callback The callback to be executed
 */
Telepat.on = function(name, callback) {
  return Event.on(name, callback);
}

/**
 * ## Telepat.login
 *
 * This function associates the current anonymous device to a Telepat user profile.
 * 
 * Two events can be asynchronously triggered by this function:
 *
 * - `login`, on success
 * - `login_error`, on error
 *
 * @param {string} facebookToken The user token obtained from Facebook after login
 */
Telepat.login = function (facebookToken) {
  API.call('user/login', {
    access_token: facebookToken
  }, function (err, res) {
    if (err) {
      Event.emit('login_error', error('Login failed with error: ' + err));
    } else {
      API.authenticationToken = res.body.token;
      Event.emit('login');
    }
  });
  return this;
}

/**
 * ## Telepat.logout
 *
 * Obviously, logs a user out.
 * Two events can be asynchronously triggered by this function:
 *
 * - `logout`, on success
 * - `logout_error`, on error
 */
Telepat.logout = function () {
  API.call('user/logout', {}, function (err, res) {
    if (err) {
      Event.emit('logout_error', error('Logout failed with error: ' + err));
    } else {
      API.authenticationToken = null;
      Event.emit('logout');
    }
  });
  return this;
}

/**
 * ## Telepat.subscribe
 *
 * Use this function to create a new [Channel](http://docs.telepat.io/javascript-sdk/lib/channel.js.html) object and connect it to the backend.
 * 
 * You can pass a callback to be invoked on channel subscription. This is equivalent to calling `.on('subscribe' ...)` directly on the returned Channel.
 *
 * @param {integer} contextId The id of the context to subscribe to
 * @param {string} channelId The id of the channel to subscribe to
 * @param {function, optional} onSubscribe Callback to be executed on a successful subscribe
 *
 * @return {Channel} The new [Channel](http://docs.telepat.io/javascript-sdk/lib/channel.js.html) object
 */
Telepat.subscribe = function (contextId, channelId, onSubscribe) {
  var channel = new Channel(API, log, error, contextId, channelId);
  var key = 'blg:'+contextId+':'+channelId;
  var self = this;
  this.subscriptions[key] = channel;
  channel.subscribe();
  if (onSubscribe !== undefined) {
    channel.on("subscribe", onSubscribe);
  }
  channel.on("_unsubscribe", function () {
    delete self.subscriptions[key];
  });
  return channel;
}

module.exports = Telepat;