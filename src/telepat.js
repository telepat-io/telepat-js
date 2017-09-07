import fs from 'fs';
import PouchDB from 'pouchdb';
import API from './api';
import log from './logger';
import error from './error';
import EventObject from './event';
import Monitor from './monitor';
import Channel from './channel';
import User from './user';

let UDID_DB_KEY = ':deviceId';

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
  constructor(options = null) {
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
    this.name = (options && options.name) ? options.name : '';
    UDID_DB_KEY += this.name;
    this._db = new PouchDB((typeof window !== 'undefined') ? ('/_telepat') : (getTelepatDir()));
    console.log(UDID_DB_KEY);
    this._event = new EventObject(log);
    this._monitor = new Monitor();
    this._socketEndpoint = null;
    this._socket = null;
    this._persistentConnectionOptions = null;
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

    if (options) {
      this.connect(options);
    }
  }

  onReady(callback) {
    return this.on('ready', callback);
  }

  getCollections(callback = () => {}) {
    API.get('context/all', '', (err, res) => {
      if (err) {
        let resultingError = error('Error retrieving collections ' + err);

        this.callback(resultingError, null);
      } else {
        this._monitor.remove({channel: {model: 'context'}});
        this.collections = {};
        for (let index in res.body.content) {
          this.collections[res.body.content[index].id] = res.body.content[index];
        }

        this._monitor.add({channel: {model: 'context'}}, this.collections, this.collectionEvent, this._addCollection.bind(this), this._deleteCollection.bind(this), this._updateCollection.bind(this));
        this.collectionEvent.on('update', (operation, parentId, parentObject, delta) => {
          this._event.emit('collections_update');
        });
        callback(null, this.collections);
        this._event.emit('collections_update');
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

  _getSavedUDID(callback) {
    this._db.get(UDID_DB_KEY).then(doc => {
      if (doc[API.appId]) {
        callback(null, doc[API.appId]);
      } else {
        log.warn('Could not retrieve saved UDID');
        callback(new Error('Could not retrieve saved UDID'));
      }
    }).catch((err) => {
      log.warn('Could not retrieve saved UDID', err);
      callback(err);
    });
  }

  _saveUDID(udid, callback) {
    this._db.get(UDID_DB_KEY).then(doc => {
      doc[API.appId] = udid;
      this._db.put(doc).then(() => {
        log.info('Replaced existing UDID');
        callback(null);
      }).catch(err => {
        log.warn('Could not persist UDID. Error: ' + err);
        callback(err);
      });
    }).catch(() => {
      let newObject = {
        _id: UDID_DB_KEY
      };

      newObject[API.appId] = API.UDID;
      this._db.put(newObject).then(() => {
        log.info('Saved new UDID');
        callback(null);
      }).catch(err => {
        log.warn('Could not persist UDID. Error: ' + err);
        callback(err);
      });
    });
  }

  _rebindVolatileTransport(callback) {
    if (this._socket) {
      let watchdog = setTimeout(() => {
        callback(error('Socket transport connection timeout'));
      }, 5000);

      this._socket.emit('bind_device', {
        'device_id': API.UDID,
        'application_id': API.appId
      });
      this._socket.on('ready', () => {
        this._socket.removeAllListeners('ready');
        clearTimeout(watchdog);
        watchdog = null;

        // Update all subscription data on transport reconnect
        for (let key in this.subscriptions) {
          this.subscriptions[key].subscribe();
        }

        callback(null);
      });
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
   *
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
   * Call this to register a device with the Telepat backend. This will be automatically invoked
   * during the initial connection.
   *
   * @param {TelepatCallback} callback Callback invoked after device is registered
   */
  registerDevice(callback = () => {}) {
    let finalizeRequest = (err, res) => {
      if (err) {
        callback(err);
      } else {
        if (res.body.content.identifier) {
          API.UDID = res.body.content.identifier + this.name;
          log.info('Received new UDID: ' + API.UDID);
          this._saveUDID(API.UDID, () => {});
        }
        callback(null, res);
      }
    };

    let request = {
      'info': {
        'os': 'web',
        'userAgent': ((typeof navigator !== 'undefined') ? navigator.userAgent : 'node')
      },
      'volatile': {
        'type': 'sockets',
        'active': 1
      }
    };

    if (this._persistentConnectionOptions) {
      request.persistent = this._persistentConnectionOptions;
      if (request.persistent.active === 1) {
        request.volatile.active = 0;
      }
    }

    API.call('device/register', request, (err, res) => {
      if (err && API.UDID) {
        // Maybe our UDID got out of sync with the server. Let's try to get a new one
        API.UDID = null;
        API.call('device/register', request, (err, res2) => {
          finalizeRequest(err, res2);
        });
      } else {
        finalizeRequest(null, res);
      }
    });
  }

  /**
   * Call this to register the device with the Telepat volatile transport service. This will be automatically invoked
   * during the initial connection.
   *
   * @param {Object} options Socket.io connection options. See http://socket.io/docs/client-api/#manager(url:string,-opts:object).
   * @param {TelepatCallback} callback Callback invoked after transport is registered
   */
  connectVolatileTransport(ioOptions = {}, callback = () => {}) {
    this.disconnectVolatileTransport();

    this._socket = require('socket.io-client')(this._socketEndpoint, ioOptions);
    log.info('Connecting to socket service ' + this._socketEndpoint);

    this._socket.on('error', (err) => {
      callback(err);
    });

    this._socket.on('connect', () => {
      this._rebindVolatileTransport(err => {
        callback(err);
      });
    });

    this._socket.on('message', message => {
      this.processMessage(message);
    });

    this._socket.on('context-update', () => {
      this.getCollections();
    });

    this._socket.on('disconnect', () => {
      log.warn('Sockets disconnected');
      this._event.emit('volatile_disconnect');
    });

    this._socket.on('reconnect', () => {
      this._rebindVolatileTransport(err => {
        if (err) {
          this._event.emit('reconnect_failed');
        } else {
          this._event.emit('reconnect');
        }
      });
    });

    this._socket.on('reconnect_failed', () => {
      log.warn('Sockets reconnect failed');
      this._event.emit('reconnect_failed');
    });
  }

  /**
   * Call this to unregister the device with the Telepat volatile transport service. This will be automatically invoked
   * during disconnection.
   *
   * @fires Telepat.event:volatile_disconnect
   */
  disconnectVolatileTransport() {
    if (this._socket) {
      this._socket.removeAllListeners();
      this._socket.close();
      this._socket = null;
    }
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
   *
   * @fires Telepat.event:connect
   * @fires Telepat.event:ready
   * @fires Telepat.event:connect_error
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

    let signalConnectFailed = (err) => {
      this.connected = false;
      this.connecting = false;
      this.currentAppId = null;
      callback(error('Device registration failed with error: ' + err));
      this._event.emit('connect_error', err);
    };

    let signalConnectSucceded = () => {
      this.connected = true;
      this.connecting = false;
      this.currentAppId = API.appId;
      callback(null);
      this._event.emit('connect');
      this._event.emit('ready');
    };

    let populateData = () => {
      this.getCollections((err) => {
        if (err) {
          signalConnectFailed(err);
        } else {
          this._updateUser(options.reauth, () => {
            signalConnectSucceded();
          });
        }
      });
    };

    let postRegister = (err, res) => {
      if (err) {
        signalConnectFailed(err);
      } else {
        if (!this._persistentConnectionOptions || this._persistentConnectionOptions.active !== 1) {
          this.connectVolatileTransport({}, (err) => {
            if (err) {
              signalConnectFailed(err);
            } else {
              populateData();
            }
          });
        } else {
          populateData();
        }
      }
    };

    // START CONNECTION PROCESS

    if (this.connected) {
      this.connected = false;
      this.disconnect();
    }
    this.connecting = true;

    API.apiKey = options.apiKey;
    API.appId = options.appId;

    if (this.admin && this.admin.apps) {
      this.admin.app = this.admin.apps[API.appId];
    }

    this._persistentConnectionOptions = options.persistentConnection || this._persistentConnectionOptions;

    if (options.updateUDID) {
      this.registerDevice(postRegister);
    } else {
      this._getSavedUDID((err, udid) => {
        if (!err) {
          API.UDID = udid;
        }
        this.registerDevice(postRegister);
      });
    }

    return this;
  }

  /**
   * Call this function to disconnect the client from the Telepat backend.
   * @fires Telepat.event:disconnect
   * @fires Telepat.event:volatile_disconnect
   */
  disconnect() {
    this.disconnectVolatileTransport();
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
   * Invoked when client has connected to the backend. Alias for the `connect` event.
   *
   * @event ready
   */
  /**
   * Invoked when client has disconnected from the backend.
   *
   * @event disconnect
   * @type {Error}
   */
  /**
   * Invoked when volatile transport has been (temporarily) disconnected.
   *
   * @event volatile_disconnect
   * @type {Error}
   */
  /**
   * Invoked when volatile transport has reconnected.
   *
   * @event reconnect
   * @type {Error}
   */
  /**
   * Invoked when volatile transport has failed to reconnect.
   *
   * @event reconnect_failed
   * @type {Error}
   */
  /**
   * Invoked when client configuration has completed.
   *
   * @event configure
   */
  /**
   * Invoked on connection error.
   *
   * @event connect_error
   * @type {Error}
   */
  /**
   * Invoked when the available collections have updated.
   *
   * @event collections_update
   */
  /**
   * Invoked when client has successfully logged in.
   *
   * @event login
   */
  /**
   * Invoked when there was an error with logging in.
   *
   * @event login_error
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
   * @event logout_error
   * @type {Error}
   */

  /**
   * Call this function to add callbacks to be invoked on event triggers.
   * Available callbacks:
   *
   * | Name                                                          | Description           |
   * | ------------------------------------------------------------- | --------------------- |
   * | {@link #Telepat.event:connect connect}                        | Invoked when client has connected to the backend |
   * | {@link #Telepat.event:ready ready}                            | Alias for the connect event |
   * | {@link #Telepat.event:disconnect disconnect}                  | Invoked when client has disconnected from the backend |
   * | {@link #Telepat.event:reconnect reconnect}                    | Invoked when volatile transport has reconnected |
   * | {@link #Telepat.event:reconnect_failed reconnect_failed}      | Invoked when volatile transport reconnection failed |
   * | {@link #Telepat.event:volatile_disconnect volatile_disconnect}| Invoked when volatile transport has been disconnected |
   * | {@link #Telepat.event:configure configure}                    | Invoked when client configuration has completed |
   * | {@link #Telepat.event:connect_error connect_error}            | Invoked on connection errors |
   * | {@link #Telepat.event:collections_update collections_update}  | Invoked when the available collections have updated |
   * | {@link #Telepat.event:login login}                            | Invoked when client has successfully logged in |
   * | {@link #Telepat.event:login_error login_error}                | Invoked when there was an error with logging in |
   * | {@link #Telepat.event:logout logout}                          | Invoked when client has successfully logged out |
   * | {@link #Telepat.event:logout_error logout_error}              | Invoked when there was an error with logging out |
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
    if ((name === 'connect' || name === 'ready') && this.connected) {
      setTimeout(callback, 0);
    }
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
