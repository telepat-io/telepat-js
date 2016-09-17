import fs from 'fs';
import PouchDB from 'pouchdb';
import API from './api';
import log from './logger';
import error from './error';
import EventObject from './event';
import Monitor from './monitor';
import Channel from './channel';
import User from './user';

/**
 * The `Telepat` object is the first object you want to instantiate while working with the Telepat SDK.
 * It exposes methods and properties that enable you to register, login, subscribe to objects and to users.
 *
 * @class Telepat
 *
 * @example
 * let telepat = new Telepat();
 * telepat.connect({
 *  apiEndpoint: 'TELEPAT-API-ENDPOINT',
 *  socketEndpoint: 'TELEPAT-SOCKET-ENDPOINT',
 *  apiKey: 'APP-API-KEY',
 *  appId: 'APP-ID'
 * }, (err, res) => {
 *  if (err) {
 *    // Treat connection error
 *    console.log(err);
 *    return;
 *  }
 *
 *  // Display all collections
 *  console.log(telepat.collections);
 *
 *  // Login, display and update user data
 *  telepat.on('login', () => {
 *    console.log(telepat.user.data);
 *    telepat.user.data.change = true;
 *  });
 *  telepat.user.login('user', 'pass');
 *
 *  // Subscribe to data
 *  let articleChannel = telepat.subscribe({
 *    channel: {
 *      context: 'collection-identifier',
 *      model: 'article'
 *    }
 *  }, () => {
 *    console.log(articleChannel.objectsArray);
 *    articleChannel.objects['object-identifier'].title = 'new title';
 *
 *    articleChannel.on('update', (operationType, objectId, object, oldObject) => {
 *      // Update interface on data updates
 *    });
 *  });
 * });
 */
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

    /**
     * Indicates whether the current instance is connected to the backend
     * @type {boolean}
     * @memberof Telepat
     * @instance
     */
    this.connected = false;
    /**
     * Indicates whether the current instance is in the process of connecting to the backend.
     * If true, the `connect` event will be fired as soon as connection is established.
     * @type {boolean}
     * @memberof Telepat
     * @instance
     */
    this.connecting = false;
    /**
     * Indicates whether the current instance is properly configured and ready for connection.
     * @type {boolean}
     * @memberof Telepat
     * @instance
     */
    this.configured = false;
    /**
     * If connected, this property reflects the current app id.
     * @type {string}
     * @memberof Telepat
     * @instance
     */
    this.currentAppId = null;
    /**
     * This object contains details about all the collections available for the currently connected application.
     * You can read this after the `connect` event is emitted, or if the `connected` property is true.
     * Each available collection is stored as an Object, using a key whose name is equal to the collection's id.
     * Modifications to collection objects stored within will be automatically synchronized with the Telepat backend.
     * @type {Object}
     * @memberof Telepat
     * @instance
     */
    this.collections = {};
    /**
     * This object contains references to all of the {@link Channel}s that are actively subscribed.
     * Each channel is stored using a key equal to the channel's unique identifier.
     * @type {Object}
     * @memberof Telepat
     * @instance
     */
    this.subscriptions = {};
    /**
     * This property becomes available after successfully logging in as an administrator.
     * It gives you access to a instance of the {@link Admin} class, allowing you access to administrator functionality.
     * @type {Admin}
     * @memberof Telepat
     * @instance
     *
     * @example
     * telepat.user.loginAdmin('admin@email.com', 'password', (err) => {
     *  if (err) {
     *    // Treat login error
     *  } else {
     *    telepat.admin.getAppUsers((err) => {
     *      if (err) {
     *        // Treat error
     *      } else {
     *        // Treat success
     *        console.log(telepat.admin.users);
     *      }
     *    })
     *  }
     * });
     */
    this.admin = null;
    /**
     * An instance of the {@link User} class, this allows you to access user functionality like logging in,
     * accessing and modifying current user data or registering new user accounts.
     * @type {User}
     * @memberof Telepat
     * @instance
     *
     * @example
     * telepat.user.login('email', 'password', (err) => {
     *  if (err) {
     *    // Treat login error
     *  } else {
     *    // Treat successful login
     *    console.log(telepat.user.data);
     *  }
     * });
     */
    this.user = null;
    this.collectionEvent = new EventObject(log);
  }

  getCollections(callback = () => {}) {
    API.get('context/all', '', (err, res) => {
      if (err) {
        let resultingError = error('Error retrieving collections ' + err);

        this.callback(resultingError, null);
        this._event.emit('error', resultingError);
      } else {
        this._monitor.remove({channel: {model: 'context'}});
        this.collections = {};
        for (let index in res.body.content) {
          this.collections[res.body.content[index].id] = res.body.content[index];
        }

        this._monitor.add({channel: {model: 'context'}}, this.collections, this.collectionEvent, this._addCollection.bind(this), this._deleteCollection.bind(this), this._updateCollection.bind(this));
        this.collectionEvent.on('update', (operation, parentId, parentObject, delta) => {
          this._event.emit('collections-update');
        });
        callback(null, this.collections);
        this._event.emit('collections-update');
      }
    });
  }

  _addCollection(collection, callback = () => {}) {
    if (this.admin) {
      this.admin.addCollection(collection, callback);
    } else {
      log.warn('Editing collection data as non-admin user. Changes will not be remotely persisted.');
    }
  }

  _updateCollection(id, patches, callback = () => {}) {
    if (this.admin) {
      this.admin.updateCollection(id, patches, callback);
    } else {
      log.warn('Editing collection data as non-admin user. Changes will not be remotely persisted.');
    }
  }

  _deleteCollection(id, callback = () => {}) {
    if (this.admin) {
      this.admin.deleteCollection(id, callback);
    } else {
      log.warn('Editing collection data as non-admin user. Changes will not be remotely persisted.');
    }
  }

  _updateUser(reauth = false, callback = () => {}) {
    if (!this.user) {
      this.user = new User(this._db, this._event, this._monitor, newAdmin => { this.admin = newAdmin; }, () => {
        if (reauth) {
          this.user.reauth(callback);
        } else {
          callback(null);
        }
      });
    } else {
      callback(null);
    }
  }

  /**
   * Call this to configure Telepat server endpoints without connecting to a specific app.
   *
   * @param {Object} options Object containing all configuration options for connection
   * @param {string} options.apiEndpoint The Telepat API endpoint URL
   * @param {string} options.socketEndpoint The Telepat socket endpoint URL
   * @param {boolean} [options.reauth=false] Should reauth previously logged in user on connection
   * @param {TelepatCallback} callback Callback invoked after configuration is finished
   * @fires Telepat.event:configure
   *
   * @example
   * let telepat = new Telepat();
   * telepat.configure({
   *  apiEndpoint: 'TELEPAT-API-ENDPOINT',
   *  socketEndpoint: 'TELEPAT-SOCKET-ENDPOINT'
   * }, (err, res) => {
   *  // Handle configuration
   * });
   */
  configure(options = {}, callback = () => {}) {
    if (typeof options.apiEndpoint !== 'undefined') {
      API.apiEndpoint = options.apiEndpoint + '/';
    } else {
      callback(error('Configure options must provide an apiEndpoint property'));
    }
    // - `socketEndpoint`: the host and port number for the socket service
    if (typeof options.socketEndpoint !== 'undefined') {
      this._socketEndpoint = options.socketEndpoint;
    } else {
      callback(error('Configure options must provide an socketEndpoint property'));
    }

    this._updateUser(options.reauth, () => {
      this._event.emit('configure');
      this.configured = true;
      callback(null, this);
    });
  }

  /**
   * Call this to connect to a specific Telepat app.
   * This is usually the first thing you need to do after instantiating the Telepat object.
   *
   * @param {Object} options Object containing all configuration options for connection
   * @param {string} options.apiKey Your app API key
   * @param {string} options.appId Your app id
   * @param {string} [options.apiEndpoint] The Telepat API endpoint URL. If this is absent from the connect options, it must have been previously set by calling {@link #Telepat#configure configure}.
   * @param {string} [options.socketEndpoint] The Telepat socket endpoint URL.
   *  If this is absent from the connect options, it must have been previously set by calling {@link #Telepat#configure configure}.
   * @param {boolean} [options.reauth=false] Should reauth previously logged in user on connection
   * @param {Object} [options.persistentConnection=null] Set this to configure receiving updates via persistent channels, like push notifications.
   * @param {Object} [options.ioOptions={}] Configuration options for socket.io
   * @param {boolean} [options.updateUDID=false] Set this to true to force the client to update the saved device identifier.
   * @param {number} [options.timerInterval=150] Frequency of running diff (in miliseconds) to check for object updates.
   * @param {TelepatCallback} callback Callback invoked after configuration is finished
   * @fires Telepat.event:connect
   * @fires Telepat.event:disconnect
   *
   * @example
   * // Simple connection to backend
   *
   * let telepat = new Telepat();
   * telepat.connect({
   *  apiEndpoint: 'TELEPAT-API-ENDPOINT',
   *  socketEndpoint: 'TELEPAT-SOCKET-ENDPOINT',
   *  apiKey: 'APP-API-KEY',
   *  appId: 'APP-ID'
   * }, (err, res) => {
   *  // Handle connection
   * });
   *
   * @example
   * // Using connection event
   *
   * let telepat = new Telepat();
   * telepat.connect({
   *  apiEndpoint: 'TELEPAT-API-ENDPOINT',
   *  socketEndpoint: 'TELEPAT-SOCKET-ENDPOINT',
   *  apiKey: 'APP-API-KEY',
   *  appId: 'APP-ID'
   * });
   * let connectCallbackId = telepat.on('connect', {
   *  telepat.removeCallback(connectCallbackId);
   *  // Handle connection
   * });
   *
   * @example
   * // Activating the push notifications transport.
   * // Do this when running inside a mobile OS, for example.
   * telepat.connect({
   *  apiEndpoint: 'TELEPAT-API-ENDPOINT',
   *  socketEndpoint: 'TELEPAT-SOCKET-ENDPOINT',
   *  apiKey: 'APP-API-KEY',
   *  appId: 'APP-ID',
   *  persistentConnection: {
   *    type: 'ios',
   *    token: 'DEVICE-NOTIFICATION-TOKEN',
   *    active: 1
   *  }
   * });
   */
  connect(options = {}, callback = () => {}) {
    var self = this;

    function completeRegistration(res) {
      if (res.body.content.identifier !== undefined) {
        API.UDID = res.body.content.identifier;
        log.info('Received new UDID: ' + API.UDID);

        self._db.get(':deviceId').then(doc => {
          doc[API.appId] = API.UDID;
          log.warn('Replacing existing UDID');
          self._db.put(doc).catch(err => {
            log.warn('Could not persist UDID. Error: ' + err);
          });
        }).catch(() => {
          let newObject = {
            _id: ':deviceId'
          };

          newObject[API.appId] = API.UDID;
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

      self.getCollections(() => {
        self._updateUser(options.reauth, () => {
          self.currentAppId = API.appId;
          self.connected = true;
          self.connecting = false;
          self._event.emit('connect');
          callback(null, self);
        });
      });
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
              self.currentAppId = null;
              self.connected = false;
              self.connecting = false;
              callback(error('Device registration failed with error: ' + err));
            } else {
              completeRegistration(res);
            }
          });
        } else {
          completeRegistration(res);
        }
      });
    }

    if (typeof options !== 'undefined') {
      if (typeof options.apiKey === 'undefined') {
        return callback(error('Connect options must provide an apiKey property'));
      }
      if (typeof options.appId === 'undefined') {
        return callback(error('Connect options must provide an appId property'));
      }
      if (typeof options.apiEndpoint !== 'undefined') {
        API.apiEndpoint = options.apiEndpoint + '/';
      } else if (!API.apiEndpoint) {
        return callback(error('Connect options must provide an apiEndpoint property, or you must run `configure` first'));
      }
      if (typeof options.socketEndpoint !== 'undefined') {
        this._socketEndpoint = options.socketEndpoint;
      } else if (!this._socketEndpoint) {
        return callback(error('Connect options must provide an socketEndpoint property, or you must run `configure` first'));
      }
      if (typeof options.timerInterval !== 'undefined') {
        this._monitor.timerInterval = options.timerInterval;
      }
    } else {
      return callback(error('Options object not provided to the connect function'));
    }

    this.connecting = true;

    if (this.connected) {
      this.disconnect();
    }

    API.apiKey = options.apiKey;
    API.appId = options.appId;

    if (this.admin && this.admin.apps) {
      this.admin.app = this.admin.apps[API.appId];
    }

    this._persistentConnectionOptions = options.persistentConnection || this._persistentConnectionOptions;

    this._socket = require('socket.io-client')(this._socketEndpoint, options.ioOptions || {});
    log.info('Connecting to socket service ' + this._socketEndpoint);

    if (__0_3__) { // eslint-disable-line no-undef
      this._socket.on('welcome', data => {
        this._sessionId = data.sessionId;

        if (options.updateUDID) {
          registerDevice();
        } else {
          this._db.get(':deviceId').then(doc => {
            if (doc[API.appId]) {
              API.UDID = doc[API.appId];
              log.info('Retrieved saved UDID: ' + API.UDID);
            }
            registerDevice();
          }).catch(function () {
            registerDevice();
          });
        }
      });
    } else {
      if (options.updateUDID) {
        registerDevice();
      } else {
        this._db.get(':deviceId').then(doc => {
          if (doc[API.appId]) {
            API.UDID = doc[API.appId];
            log.info('Retrieved saved UDID: ' + API.UDID);
          }
          registerDevice();
        }).catch(function () {
          registerDevice();
        });
      }
    }

    this._socket.on('message', message => {
      this._monitor.processMessage(message);
    });

    this._socket.on('context-update', () => {
      this.getCollections();
    });

    this._socket.on('disconnect', () => {
    });

    this._socket.on('reconnect', () => {
      self._socket.emit('bind_device', {
        'device_id': API.UDID,
        'application_id': API.appId
      });
    });

    return this;
  }

  /**
   * Call this function to disconnect the client from the Telepat backend.
   * @fires Telepat.event:disconnect
   */
  disconnect() {
    this._socket.close();
    this._socket = null;
    this._sessionId = null;
    this.collections = null;
    this._monitor.remove({channel: {model: 'context'}});

    for (var key in this.subscriptions) {
      this.subscriptions[key].unsubscribe();
    }
    this.subscriptions = {};

    if (!this.user.isAdmin) {
      this.user.logout(() => {
        this.admin.unhook();
        this.admin = null;
        this.user = null;
      });
    }

    API.apiKey = null;
    API.appId = null;
    API.UDID = null;

    this._event.emit('disconnect');
    this.currentAppId = null;
    this.connected = false;
  };

  /**
   * Forwards messages reveived via external channels to the processing unit.
   * Use this if you've configured external transports (like push notifications), and you need to pass received payloads
   * to the processing engine.
   *
   * @param {string} message The delta update notification received from Telepat
   */
  processMessage(message) {
    this._monitor.processMessage(message);
  }

  /**
   * You can tweak the logger verbosity using this function.
   *
   * @param {string} level One of `'debug'`, `'info'`, `'warn'` or `'error'`
   */
  setLogLevel(level) {
    log.setLevel(level);
    return this;
  }

  /**
   * Invoked when client has connected to the backend.
   *
   * @event connect
   */
  /**
   * Invoked when client has disconnected from the backend.
   *
   * @event disconnect
   * @type {Error}
   */
  /**
   * Invoked when client configuration has completed.
   *
   * @event configure
   */
  /**
   * Invoked on any operation error.
   *
   * @event error
   * @type {Error}
   */
  /**
   * Invoked when the available collections have updated.
   *
   * @event collections-update
   */
  /**
   * Invoked when client has successfully logged in.
   *
   * @event login
   */
  /**
   * Invoked when there was an error with logging in.
   *
   * @event login-error
   * @type {Error}
   */
  /**
   * Invoked when client has successfully logged out.
   *
   * @event logout
   */
  /**
   * Invoked when there was an error with logging out.
   *
   * @event logout-error
   * @type {Error}
   */

  /**
   * Call this function to add callbacks to be invoked on event triggers.
   * Available callbacks:
   *
   * | Name                                                         | Description           |
   * | ------------------------------------------------------------ | --------------------- |
   * | {@link #Telepat.event:connect connect}                       | Invoked when client has connected to the backend |
   * | {@link #Telepat.event:disconnect disconnect}                 | Invoked when client has disconnected from the backend |
   * | {@link #Telepat.event:configure configure}                   | Invoked when client configuration has completed |
   * | {@link #Telepat.event:error error}                           | Invoked on any operation error |
   * | {@link #Telepat.event:collections-update collections-update} | Invoked when the available collections have updated |
   * | {@link #Telepat.event:login login}                           | Invoked when client has successfully logged in |
   * | {@link #Telepat.event:login-error login-error}               | Invoked when there was an error with logging in |
   * | {@link #Telepat.event:logout logout}                         | Invoked when client has successfully logged out |
   * | {@link #Telepat.event:logout-error logout-error}             | Invoked when there was an error with logging out |
   *
   * @param {string} name The name of the event to associate the callback with
   * @param {function} callback The callback to be executed
   * @return {number} A callback id. Save this in order to later remove the callback from the event (using {@link #Telepat#removeCallback removeCallback})
   *
   * @example
   * telepat.on('connect', () => {
   *  console.log('connected');
   * });
   */
  on(name, callback) {
    return this._event.on(name, callback);
  };

  /**
   * Call this function to remove callbacks that have been set using {@link #Telepat#on on}.
   *
   * @param {string} name The name of the event the callback was associated with
   * @param {number} callbackId The callback id returned by calling {@link #Telepat#on on}
   *
   * @example
   * let connectCallbackId = telepat.on('connect', () => {
   *  // Remove the callback after the first connection event
   *  telepat.removeCallback(connectCallbackId);
   * });
   */
  removeCallback(name, index) {
    return this._event.removeCallback(name, index);
  };

  /**
   * Use this function to create a new {@link Channel} object and retrieve its objects.
   *
   * @param {Object} options The object describing the required subscription
   * @param {function} onSubscribe Callback invoked when subscription is ready
   * @param {Object} [options.channel] Describes the basic properties of the objects requested
   * @param {string} [options.channel.context] The id of the collection in which you're searching for objects
   * @param {string} [options.channel.model] The model of the objects you're searching for (needs to be defined in the schema first)
   * @param {string} [options.channel.id] If set, specifies the id of the unique object that you're querying for
   * @param {Object} [options.channel.parent] If set, specifies the parent id and parent model of the objects you're querying for.
   * @param {string} [options.channel.parent.model] The model of the parent object
   * @param {string} [options.channel.parent.id] The id of the parent object
   * @param {string} [options.channel.user] If set, specifies the user id of the creator of the objects you're querying for.
   * @param {Object} [options.sort] An object that defines how returned objects should be sorted. Each object key is a property name, and each value can be either `asc` or `desc`.
   * @param {Object} [options.filters] An object describing how returned objects should be filtered.
   * @param {number} [options.offset] The offset that should be applied for the returned objects (for pagination)
   * @param {number} [options.limit] The maximum number of objects to be returned in this batch (for pagination)
   * @return {Channel} The new {@link Channel} object
   *
   * @example
   * // A simple subscription to all objects of type `article`
   * // in a specific collection
   *
   * let articleChannel = telepat.subscribe({
   *  channel: {
   *    context: 'context-unique-identifier',
   *    model: 'article'
   *  }
   * }, () => {
   *  console.log(articleChannel.objectsArray);
   * });
   *
   * @example
   * // A filtered subscription to all objects of type `article`
   * // in a specific collection, that have one of two specific tag values
   *
   * let articleChannel = telepat.subscribe({
   *  channel: {
   *    context: 'context-unique-identifier',
   *    model: 'article'
   *  },
   *  filters: {
   *    or: [
   *      {
   *        is: {
   *          tag: 'specific-tag-value'
   *        }
   *      },
   *      {
   *        is: {
   *          tag: 'another-tag-value'
   *        }
   *      }
   *    ]
   *  }
   * }, () => {
   *  console.log(articleChannel.objectsArray);
   * });
   *
   * @example
   * // A simple subscription to all objects of type `article`
   * // in a specific collection, sorted by created date descending
   *
   * let articleChannel = telepat.subscribe({
   *  channel: {
   *    context: 'context-unique-identifier',
   *    model: 'article'
   *  },
   *  sort: {
   *    created: 'desc'
   *  }
   * }, () => {
   *  console.log(articleChannel.objectsArray);
   * });
   *
   * @example
   * // A simple subscription to all objects of type `comment`
   * // in a specific collection, that belong to a specific article parent
   *
   * let articleChannel = telepat.subscribe({
   *  channel: {
   *    context: 'context-unique-identifier',
   *    model: 'comment',
   *    parent: {
   *      model: 'article',
   *      id: 'article-parent-unique-identifier'
   *    }
   *  }
   * }, () => {
   *  console.log(articleChannel.objectsArray);
   * });
   */
  subscribe(options, onSubscribe) {
    let channel = new Channel(this._monitor, options);
    let key = Monitor.subscriptionKeyForOptions(options);

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

  /**
   * Same as {@link #Telepat#subscribe subscribe} method, but returns the new {@link Channel} object without calling subscribe on it.
   *
   * @param  {Object} options Same as {@link #Telepat#subscribe subscribe} Options
   * @return {Channel} The new {@link Channel} object
   */
  getChannel(options) {
    let key = Monitor.subscriptionKeyForOptions(options);

    if (this.subscriptions[key]) {
      return this.subscriptions[key];
    }
    return new Channel(this._monitor, options);
  }

  sendEmail(from, fromName, to, subject, body, callback) {
    API.call('/email', {
      'recipients': to,
      'from': from,
      'from_name': fromName,
      'subject': subject,
      'body': body
    }, (err, res) => {
      if (err) {
        callback(error('Send email failed with error: ' + err), null);
      } else {
        callback(null, res.body.content);
      }
    });
  };

  get(options, callback) {
    options['no_subscribe'] = true;
    API.call('object/subscribe',
    options,
    (err, res) => {
      if (err) {
        this._event.emit('error', error('Get objects failed with error: ' + err));
        callback(error('Get objects failed with error: ' + err), null);
      } else {
        callback(null, res.body.content);
      }
    });
  }
};

/**
 * This callback is displayed as part of the Requester class.
 * @callback TelepatCallback
 * @param {Error} err If there was an error processing the requested operation, this will reference the error object resulted
 * @param {*} res The operation response
 */
