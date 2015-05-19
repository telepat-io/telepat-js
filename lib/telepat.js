var API = require('./api');
var PouchDB = require('pouchdb');
var db = new PouchDB('_telepat');
var log = require('./logger');
var Event = require('./event');
var Channel = require('./channel');

var Telepat = {
  contexts: null
};

var rootEndpoint = 'http://blg-node-front.cloudapp.net';
var apiPort = 3100;

var socket;
var ioSessionId;


function error(string) {
  log.error(string);
  return new Error(string);
}

function updateContexts() {
  API.call('context/all', {}, function(err, res) {
      Telepat.contexts = res.body;
      Event.emit('contexts-update');
    })
}

function registerDevice() {
  API.call('device/register', {
      'os': 'web',
      'volatile': {
        'type': 'sockets',
        'token': ioSessionId
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
          db.put({
            _id: ':deviceId',
            value: res.body.identifier
          }).catch(function(err) {
            log.warn('Could not persist UDID. Error: ' + err);
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

Telepat.on = Event.on;

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

module.exports = Telepat;