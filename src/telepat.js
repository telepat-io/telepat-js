// # Telepat Javascript Client
// **Telepat** is an open-source backend stack, designed to deliver information
// and information updates in real-time to clients, while allowing for flexible deployment and simple scaling.

import fs from 'fs';
import PouchDB from 'pouchdb';
import API from './api';
import log from './logger';
import error from './error';
import EventObject from './event';
import Monitor from './monitor';
import Channel from './channel';
import User from './user';

// ## Telepat Class
// You use the Telepat class to connect to the backend, login, subscribe and unsubscribe to channels.
// The object has properties you can access:
//
// * `contexts`, an array of all the available contexts represented as JSON objects
// * `subscriptions`, an object that holds references to
// [Channel](http://docs.telepat.io/telepat-js/lib/channel.js.html) objects, on keys named after the respective channel

export default class Telepat {
  constructor() {
    function getUserHome() {
      return process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'];
    }

    function getTelepatDir() {
      var dir = getUserHome() + '/.telepat-cli';

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, 744);
      }
      return dir;
    }

    this._db = new PouchDB((typeof window !== 'undefined') ? '/_telepat' : getTelepatDir());
    this._event = new EventObject(log);
    this._monitor = new Monitor();
    this._socketEndpoint = null;
    this._socket = null;
    this._persistentConnectionOptions = null;
    this._sessionId = null;
    this._connected = false;

    this.contexts = null;
    this.subscriptions = {};
    this.admin = null;
    this.user = null;
  }

  _updateContexts() {
    API.get('context/all', '', (err, res) => {
      if (err) {
        this._event.emit('error', error('Error retrieving contexts ' + err));
      } else {
        this.contexts = res.body.content;
        this._event.emit('contexts-update');
      }
    });
  }

  /**
   * ## Telepat.configure
   *
   * Call this to configure Telepat server endpoints without connecting to a specific app.
   *
   * @param {object} options Object containing all configuration options for connection
   */
  configure(options = {}) {
    if (typeof options.apiEndpoint !== 'undefined') {
      API.apiEndpoint = options.apiEndpoint + '/';
    } else {
      return error('Configure options must provide an apiEndpoint property');
    }
    // - `socketEndpoint`: the host and port number for the socket service
    if (typeof options.socketEndpoint !== 'undefined') {
      this._socketEndpoint = options.socketEndpoint;
    } else {
      return error('Configure options must provide an socketEndpoint property');
    }

    if (!this.user) {
      this.user = new User(this._db, this._event, this._monitor, newAdmin => { this.admin = newAdmin; });
    }
  }

  /**
   * ## Telepat.connect
   *
   * This is the first function you should call to connect to the Telepat backend.
   *
   * @param {object} options Object containing all configuration options for connection
   */
  connect(options) {
    var self = this;

    function completeRegistration(res) {
      if (res.body.content.identifier !== undefined) {
        var newObject = {
          _id: ':deviceId',
          value: res.body.content.identifier
        };

        API.UDID = res.body.content.identifier;
        log.info('Received new UDID: ' + API.UDID);

        self._db.get(':deviceId').then(doc => {
          newObject._rev = doc._rev;
          log.warn('Replacing existing UDID');
          self._db.put(newObject).catch(err => {
            log.warn('Could not persist UDID. Error: ' + err);
          });
        }).catch(() => {
          self._db.put(newObject).catch(err => {
            log.warn('Could not persist UDID. Error: ' + err);
          });
        });
      }
      self._socket.emit('bind_device', {
        'device_id': API.UDID,
        'application_id': API.appId
      });

      log.info('Connection established');
      // On a successful connection, the `connect` event is emitted by the Telepat object.
      // To listen for a connection, use:
      //
      //     Telepat.on('connect', function () {
      //       // Connected
      //     });
      self._updateContexts();
      if (!self.user) {
        self.user = new User(this._db, this._event, this._monitor, newAdmin => { this.admin = newAdmin; });
      }
      self._event.emit('connect');
      self._connected = true;
      return true;
    }

    function registerDevice() {
      var request = {
        'info': {
          'os': 'web',
          'userAgent': ((typeof navigator !== 'undefined') ? navigator.userAgent : 'node')
        },
        'volatile': {
          'type': 'sockets',
          'active': 1,
          'token': self._sessionId
        }
      };

      if (self._persistentConnectionOptions) {
        request.persistent = self._persistentConnectionOptions;
        if (request.persistent.active === 1) {
          request.volatile.active = 0;
        }
      }
      API.call('device/register', request, function (err, res) {
        if (err) {
          API.UDID = null;
          API.call('device/register', request, function (err, res) {
            if (err) {
              self._socket.disconnect();
              self._event.emit('disconnect', err);
              return error('Device registration failed with error: ' + err);
            }
            return completeRegistration(res);
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
        API.apiEndpoint = options.apiEndpoint + '/';
      } else if (!API.apiEndpoint) {
        return error('Connect options must provide an apiEndpoint property, or you must run `configure` first');
      }
      // - `socketEndpoint`: the host and port number for the socket service
      if (typeof options.socketEndpoint !== 'undefined') {
        this._socketEndpoint = options.socketEndpoint;
      } else if (!this._socketEndpoint) {
        return error('Connect options must provide an socketEndpoint property, or you must run `configure` first');
      }
      // - `timerInterval`: the time interval in miliseconds between two object-monitoring jobs
      // on channels - defaults to 150
      if (typeof options.timerInterval !== 'undefined') {
        this._monitor.timerInterval = options.timerInterval;
      }
    } else {
      return error('Options object not provided to the connect function');
    }

    if (this._connected) {
      this.disconnect();
    }

    this._persistentConnectionOptions = options.persistentConnection || this._persistentConnectionOptions;

    this._socket = require('socket.io-client')(this._socketEndpoint, options.ioOptions || {});
    log.info('Connecting to socket service ' + this._socketEndpoint);

    this._socket.on('welcome', data => {
      this._sessionId = data.sessionId;
      this._db.get(':deviceId').then(doc => {
        API.UDID = doc.value;
        log.info('Retrieved saved UDID: ' + API.UDID);
        registerDevice();
      }).catch(function () {
        registerDevice();
      });
    });

    this._socket.on('message', message => {
      this._monitor.processMessage(message);
    });

    this._socket.on('context-update', () => {
      this._updateContexts();
    });

    this._socket.on('disconnect', () => {
    });

    return this;
  }

  /**
   * ## Telepat.disconnect
   *
   * You can use this function to disconnect the socket.io transport from the Telepat endpoint.
   *
   */
  disconnect() {
    this._socket.close();
    this._socket = null;
    this._sessionId = null;
    this.contexts = null;

    for (var key in this.subscriptions) {
      this.subscriptions[key].unsubscribe();
    }
    this.subscriptions = {};

    if (!this.user.isAdmin) {
      this.user.logout(() => {
        this.admin = null;
        this.user = null;
      });
    }

    API.apiKey = null;
    API.appId = null;

    this._event.emit('disconnect');
    self._connected = false;
  };

  /**
   * ## Telepat.processMessage
   *
   * Forwards messages reveived via external channels to the processing unit.
   *
   * @param {string} message The delta update notification received from Telepat
   */
  processMessage(message) {
    this._monitor.processMessage(message);
  }

  /**
   * ## Telepat.setLogLevel
   *
   * You can tweak the logger verbosity using this function.
   *
   * @param {string} level One of `'debug'`, `'info'`, `'warn'` or `'error'`
   */
  setLogLevel(level) {
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
  on(name, callback) {
    return this._event.on(name, callback);
  };

  /**
   * ## Telepat.subscribe
   *
   * Use this function to create a new [Channel](http://docs.telepat.io/telepat-js/lib/channel.js.html)
     object and connect it to the backend.
   *
   * You can pass a callback to be invoked on channel subscription. This is equivalent to calling
    `.on('subscribe' ...)` directly on the returned Channel.
   *
   * @param {Object} options The object describing the required subscription (context, channel, filters)
   * @param {function, optional} onSubscribe Callback to be executed on a successful subscribe
   *
   * @return {Channel} The new [Channel](http://docs.telepat.io/telepat-js/lib/channel.js.html) object
   */
  subscribe(options, onSubscribe) {
    var channel = new Channel(this._monitor, options);
    var key = Monitor.subscriptionKeyForOptions(options);

    this.subscriptions[key] = channel;
    channel.subscribe();
    if (onSubscribe !== undefined) {
      channel.on('subscribe', onSubscribe);
    }
    channel.on('_unsubscribe', () => {
      delete this.subscriptions[key];
    });
    return channel;
  };
};
