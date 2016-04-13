'use strict';
// # Telepat Javascript Client
// **Telepat** is an open-source backend stack, designed to deliver information and information updates in real-time to clients, while allowing for flexible deployment and simple scaling.

var fs = require('fs');
var PouchDB = require('pouchdb');

var API = require('./api');
var log = require('./logger');
var error = require('./error');
var EventObject = require('./event');

var Monitor = require('./monitor');
var Channel = require('./channel');
var User = require('./user');


// ## Telepat Class
// You use the Telepat class to connect to the backend, login, subscribe and unsubscribe to channels. The object has properties you can access:
// 
// * `contexts`, an array of all the available contexts represented as JSON objects
// * `subscriptions`, an object that holds references to [Channel](http://docs.telepat.io/telepat-js/lib/channel.js.html) objects, on keys named after the respective channel

var Telepat = function () {
  var db = new PouchDB((typeof window!=="undefined")?'/_telepat':getTelepatDir());
  
  var event = new EventObject(log);
  var monitor = new Monitor();

  var apiEndpoint = null;
  var socketEndpoint = null;
  var socket = null;
  var ioSessionId = null;
  var ioServerName = null;
  var persistentConnectionOptions = null;
  var self = this;

  this.contexts = null;
  this.subscriptions = {};
  this.admin = null;
  this.user = new User(event, monitor, function (newAdmin) { self.admin = newAdmin; });

  function getUserHome() {
   return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
  }

  function getTelepatDir() {
   var dir = getUserHome() + '/.telepat-cli';
   if (!fs.existsSync(dir)) {
     fs.mkdirSync(dir,744);
   }
   return dir;
  }

  function updateContexts() {
    API.get('context/all', {}, function(err, res) {
        self.contexts = res.body.content;
        event.emit('contexts-update');
      });
  }

  /**
   * ## Telepat.connect
   *
   * This is the first function you should call to connect to the Telepat backend. 
   *
   * @param {object} options Object containing all configuration options for connection
   */
  this.connect = function (options) {
    function completeRegistration(res) {
      if (res.body.content.identifier !== undefined) {
        API.UDID = res.body.content.identifier;
        log.info('Received new UDID: ' + API.UDID);

        var newObject = {
          _id: ':deviceId',
          value: res.body.content.identifier
        };
        db.get(':deviceId').then(function(doc) {
          newObject._rev = doc._rev;
          log.warn('Replacing existing UDID');
          db.put(newObject).catch(function(err) {
            log.warn('Could not persist UDID. Error: ' + err);
          });
        }).catch(function() {
          db.put(newObject).catch(function(err) {
            log.warn('Could not persist UDID. Error: ' + err);
          });
        });
      }
      socket.emit('bind_device', {
        'device_id': API.UDID,
        'application_id': API.appId
      });

      log.info('Connection established');
      // On a successful connection, the `connect` event is emitted by the Telepat object. To listen for a connection, use:
      //
      //     Telepat.on('connect', function () {
      //       // Connected
      //     });
      event.emit('connect');
      updateContexts();
      return true;
    }

  /**
   * ## Telepat.disconnect
   *
   * You can use this function to disconnect the socket.io transport from the Telepat endpoint. 
   *
   */
  this.disconnect = function () {
    socket.close();
  }

    function registerDevice() {
      var request = {
        'info':{
          'os': 'web',
          'userAgent': ((typeof navigator !== 'undefined')?navigator.userAgent:'node')
        },
        'volatile': {
          'type': 'sockets',
          'server_name': ioServerName,
          'token': ioSessionId,
          'active': 1
        }
      };
      if (persistentConnectionOptions) {
        request.persistent = persistentConnectionOptions;
        if (request.persistent.active == 1) {
          request.volatile.active = 0;
        }
      }
      API.call('device/register', request, function (err, res) {
          if (err) {
            API.UDID = null;
            API.call('device/register', request, function (err, res) {
              if (err) {
                socket.disconnect();
                event.emit('disconnect', err);
                return error('Device registration failed with error: ' + err);
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
      // - `timerInterval`: the time interval in miliseconds between two object-monitoring jobs on channels - defaults to 150
      if (typeof options.timerInterval !== 'undefined') {
        monitor.timerInterval = options.timerInterval;
      }
    } else {
      return error('Options object not provided to the connect function');
    }
    
    API.apiEndpoint = apiEndpoint + '/';
    persistentConnectionOptions = options.persistentConnection || null;

    socket = require('socket.io-client')(socketEndpoint, options.ioOptions || {});
    log.info('Connecting to socket service ' + socketEndpoint);

    socket.on('welcome', function(data) {
      ioSessionId = data.sessionId;
      ioServerName = data.server_name;
      log.info('Got session ID ' + this.ioSessionId);
      db.get(':deviceId').then(function(doc) {
        API.UDID = doc.value;
        log.info('Retrieved saved UDID: ' + API.UDID);
        registerDevice();
      }).catch(function() {
        registerDevice();
      });
    });

    socket.on('message', function(message) {
      monitor.processMessage(message);
    });

    socket.on('context-update', function() {
      updateContexts();
    });

    socket.on('disconnect', function(){
      event.emit('disconnect');
    });

    return this;
  };

  /**
   * ## Telepat.processMessage
   *
   * Forwards messages reveived via external channels to the processing unit.
   *
   * @param {string} message The delta update notification received from Telepat
   */
  this.processMessage = function(message) {
    monitor.processMessage(message);
  }

  /**
   * ## Telepat.setLogLevel
   *
   * You can tweak the logger verbosity using this function.
   *
   * @param {string} level One of `'debug'`, `'info'`, `'warn'` or `'error'`
   */
  this.setLogLevel = function (level) {
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
  this.on = function(name, callback) {
    return event.on(name, callback);
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
  this.subscribe = function (options, onSubscribe) {
    var channel = new Channel(monitor, options);
    var self = this;
    var key = monitor.subscriptionKeyForOptions(options);
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
};

module.exports = Telepat;
