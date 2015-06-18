var API = require('./api');
var PouchDB = require('pouchdb');
var db = new PouchDB('_telepat');
var log = require('./logger');
var EventObject = require('./event');
var Event = new EventObject(log);
var Channel = require('./channel');

var Telepat = {
  contexts: null
};

var rootEndpoint = 'http://blg-octopus-api.cloudapp.net';
var apiPort = 3100;

var socket;
var ioSessionId;
var subscriptions = {};

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

function registerDevice() {
  API.call('device/register', {
      'os': 'web',
      'volatile': {
        'type': 'sockets',
        'token': ioSessionId,
        'active': 1
      }
    }, function (err, res) {
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
        Event.emit('connect');
        updateContexts();
        return true;
      }
    });
}

Telepat.setLogLevel = function (level) {
  log.setLevel(level);
  return this;
}

Telepat.on = function(name, callback) {
  return Event.on(name, callback);
}

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

Telepat.connect = function (options) {
  if (typeof options !== 'undefined') {
    if (typeof options.apiKey !== 'undefined')
      API.apiKey = options.apiKey;
    else {
      return error('Connect options must provide an apiKey property');
    }
    if (typeof options.appId !== 'undefined')
      API.appId = options.appId;
    else {
      return error('Connect options must provide an appId property');
    }

    if (typeof options.endpoint !== 'undefined')
      rootEndpoint = options.endpoint;
  } else {
    return error('Options object not provided to the connect function');
  }
  
  API.apiEndpoint = rootEndpoint + ':' + apiPort + '/';

  socket = require('socket.io-client')(rootEndpoint, options.ioOptions || {});
  log.info('Connecting to socket service ' + rootEndpoint);

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

  socket.on('context-update', function(data) {
    updateContexts();
  });

  socket.on('disconnect', function(){
    Event.emit('disconnect');
  });

  return this;
};

Telepat.subscribe = function (context, channelId, onSubscribe) {
  var channel = new Channel(API, log, error, context, channelId);
  var key = 'blg:'+context+':'+channelId;
  subscriptions[key] = channel;
  if (onSubscribe !== undefined) {
    channel.on("subscribe", onSubscribe);
  }
  channel.on("_unsubscribe", function () {
    delete subscriptions[key];
  });
  return channel;
}

module.exports = Telepat;