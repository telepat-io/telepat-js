import API from './api';
import error from './error';
import EventObject from './event';
import log from './logger';

/**
 * You can access an instance of this class using the {@link #Telepatadmin admin} property of the Telepat object.
 * This instance becomes available after successfully logging in as an administrator.
 *
 * @class Admin
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
 *
 *        // Update users
 *        telepat.admin.users[goodUserId].isAwesome = true;
 *        delete telepat.admin.users[badUserId];
 *
 *        // Update collection metadata
 *        telepat.collections[currentCollectionId].topic = 'Cats';
 *      }
 *    })
 *  }
 * });
 */
export default class Admin {
  constructor(user) {
    this._user = user;
    this._monitor = user._monitor;
    this._event = user._event;

    /**
     * This {@link Channel} instance allows registering callbacks for 'update' events on user data.
     * @type {Object}
     * @memberof Admin
     * @instance
     */
    this.userChannel = null;
    /**
     * This object contains data about all of the applications the current administrator can access.
     * Each app data is stored using a key equal to the application unique identifier.
     * You can access this after calling {@link #Admin#getApps getApps}.
     * Modifications to app objects stored within will be automatically synchronized with the Telepat backend.
     * @type {Object}
     * @memberof Admin
     * @instance
     */
    this.apps = null;
    /**
     * This object contains data about the currently connected app.
     * You can access this after calling {@link #Admin#getApps getApps}.
     * Modifications to this object will be automatically synchronized with the Telepat backend.
     * @type {Object}
     * @memberof Admin
     * @instance
     */
    this.app = null;
    /**
     * This object contains data about all of the users of the current app.
     * Each user data is stored using a key equal to the user unique identifier.
     * You can access this after calling {@link #Admin#getAppUsers getAppUsers}.
     * Modifications to user objects stored within will be automatically synchronized with the Telepat backend.
     * @type {Object}
     * @memberof Admin
     * @instance
     */
    this.users = null;
  }

  /**
   * Call this to retrieve all the application objects the current administrator can access.
   * Results will be sent as a callback argument, and persisted on the {@link #Adminapps apps} property.
   * The object belonging to the currently connected app will also be made available, on the {@link #Adminapp app} property.
   *
   * @param {TelepatCallback} callback Callback invoked after operation is finished
   */
  getApps(callback = function () {}) {
    API.call('admin/apps',
      '',
      (err, res) => {
        if (err) {
          callback(error('Retrieving apps failed with error: ' + err), null);
        } else {
          this.apps = {};
          for (var index in res.body.content) {
            var app = res.body.content[index];

            this.apps[app.id] = app;
          }
          this.app = this.apps[API.appId];
          this._monitor.add({channel: {model: 'application'}}, this.apps, null, this.addApp, this.deleteApp, this.updateApp);
          callback(null, res.body.content);
        }
      }, 'get');
  }

  /**
   * Call this to create a new application.
   *
   * @param {Object} properties Data about the new application. Can hold any key-value data.
   * Must contain at least a 'keys' key, with an array of string values that will be used as valid API keys for the app.
   * @param {TelepatCallback} callback Callback invoked after operation is finished
   */
  addApp(properties, callback = function () {}) {
    API.call('admin/app/add',
      properties,
      (err, res) => {
        if (err) {
          callback(error('Adding application failed with error: ' + err), null);
        } else {
          this.apps[res.body.content.id] = res.body.content;
          callback(null, res.body.content);
        }
      });
  }

  /**
   * Updates key-value data within an application object.
   *
   * To call this method, you need to create an  array containing 'patch' objects, representing the
   * modifications that need to be persisted. The structure of a patch object is:
   *
   * `{'op': 'replace', 'path': application + '/' + app_id + '/' + property, 'value': modified_value}`
   *
   * Instead of using this function, you can also update the app directly from {@link #Adminapps Admin.apps}.
   *
   * @param  {string} id The application id
   * @param  {Array<Object>} patches The array of patches representing the modifications that need to be persisted
   * @param  {TelepatCallback} callback Callback invoked after operation is finished
   */
  updateApp(id, patches, callback = () => {}) {
    if (id !== API.appId) {
      return callback(error('Cannot update an app that is not active. Please reconnect to that specific app id to make updates.'));
    }
    API.call('admin/app/update',
      {id: id, patches: patches},
      (err, res) => {
        if (err) {
          return callback(error('Updating application failed with error: ' + err));
        }

        callback();
      });
  }

  /**
   * Call this to delete an application.
   * Instead of using this function, you can also delete the app directly from {@link #Adminapps Admin.apps}.
   *
   * @param {string} id The application id
   * @param {TelepatCallback} callback Callback invoked after operation is finished
   */
  deleteApp(id, callback = function () {}) {
    API.del('admin/app/remove',
      {id: id},
      (err, res) => {
        if (err) {
          callback(error('Removing application failed with error: ' + err), null);
        } else {
          callback();
        }
      });
  }

  /**
   * Call this to create a new collection.
   *
   * @param {Object} collection Data about the new application. Can hold any key-value data. May be empty object.
   * @param {TelepatCallback} callback Callback invoked after operation is finished
   */
  addCollection(collection, callback = () => {}) {
    API.call('admin/context/add',
      collection,
      (err, res) => {
        if (err) {
          return callback(error('Creating collection failed with error: ' + err));
        }

        callback(null, res);
      });
  }

  /**
   * Updates key-value data within a collection object.
   *
   * To call this method, you need to create an  array containing 'patch' objects, representing the
   * modifications that need to be persisted. The structure of a patch object is:
   *
   * `{'op': 'replace', 'path': context + '/' + collection_id + '/' + property, 'value': modified_value}`
   *
   * Instead of using this function, you can also update the collection directly from {@link #Telepatcollections Telepat.collections}.
   *
   * @param  {string} id The collection id
   * @param  {Array<Object>} patches The array of patches representing the modifications that need to be persisted
   * @param  {TelepatCallback} callback Callback invoked after operation is finished
   */
  updateCollection(id, patches, callback = () => {}) {
    API.call('admin/context/update',
      {id: id, patches: patches},
      (err, res) => {
        if (err) {
          return callback(error('Updating collection failed with error: ' + err));
        }

        callback();
      });
  }

  /**
   * Call this to delete a collection.
   * Instead of using this function, you can also delete the collection directly from {@link #Telepatcollections Telepat.collections}.
   *
   * @param {string} id The collection id
   * @param {TelepatCallback} callback Callback invoked after operation is finished
   */
  deleteCollection(id, callback = () => {}) {
    API.del('admin/context/remove',
      {id: id},
      (err, res) => {
        if (err) {
          return callback(error('Deleting collection failed with error: ' + err));
        }

        callback();
      });
  }

  /**
   * Call this to remove a model from the schema, together with all objects of that specific type.
   *
   * @param {string} type The model name
   * @param {TelepatCallback} callback Callback invoked after operation is finished
   */
  deleteModel(type, callback) {
    API.del('admin/schema/remove_model', {
      'model_name': type
    }, (err, res) => {
      if (err) {
        return callback(error('Deleting model failed with error: ' + err));
      }

      callback();
    });
  }

  /**
   * Call this to retrieve all the current application user objects.
   * Results will be sent as a callback argument, and persisted on the {@link #Adminusers users} property.
   *
   * @param {TelepatCallback} callback Callback invoked after operation is finished
   */
  getAppUsers(callback = function () {}) {
    API.call('admin/users',
    {},
    (err, res) => {
      if (err) {
        callback(error('Retrieving users failed with error: ' + err), null);
      } else {
        this.users = {};
        for (let index in res.body.content) {
          this.users[res.body.content[index].id] = res.body.content[index];
        }
        this.userChannel = new EventObject(log);
        this._monitor.add({channel: {model: 'user'}}, this.users, this.userChannel, this.addUser.bind(this), this.deleteUser, this.updateUser);
        callback(null, this.users);
      }
    });
  }

  /**
   * This is an alias for {@link #User#register}.
   *
   *  @param {Object} user The object representing the new user profile
   *  @param {TelepatCallback} callback Callback invoked after operation is finished
   */
  addUser(user, callback = function () {}) {
    this._user.register(user, callback);
  };

  /**
   * Call this to delete a user profile.
   * Instead of using this function, you can also delete the user directly from {@link #Adminusers Admin.users}.
   *
   *  @param {string} username The email address of the user profile to delete
   *  @param {TelepatCallback} callback Callback invoked after operation is finished
   */
  deleteUser(username, callback = function () {}) {
    API.del('admin/user/delete',
    { username: username },
    (err, res) => {
      if (err) {
        callback(error('Removing user failed with error: ' + err), null);
      } else {
        callback();
      }
    });
  };

  /**
   * Call this to update a user profile.
   *
   * To call this method, you need to create an  array containing 'patch' objects, representing the
   * modifications that need to be persisted. The structure of a patch object is:
   *
   * `{'op': 'replace', 'path': user + '/' + user_id + '/' + property, 'value': modified_value}`
   *
   * Instead of using this function, you can also update the user directly from {@link #Adminusers Admin.users}.
   *
   * @param {string} id The id of the user to be updated
   * @param  {Array<Object>} patches The array of patches representing the modifications that need to be persisted
   * @param {TelepatCallback} callback Callback invoked after operation is finished
   */
  updateUser(id, patches, callback = function () {}) {
    API.call('admin/user/update', {
      patches: patches
    },
    (err, res) => {
      if (err) {
        callback(error('Removing user failed with error: ' + err), null);
      } else {
        callback();
      }
    });
  };

  /**
   * Call this to authorize access to the current app for another administrator account
   * within the same Telepat instance.
   *
   * @param {string} user The email associated with the account of the new administrator
   * @param {TelepatCallback} callback Callback invoked after operation is finished
   */
  authorize(user, callback) {
    API.call('/admin/app/authorize', {
      email: user
    }, (err, res) => {
      if (err) {
        return callback(error('Authorizing admin failed with error: ' + err), null);
      }

      callback();
    });
  };

  /**
   * Call this to deauthorize access to the current app for another administrator account
   * within the same Telepat instance.
   *
   * @param {string} user The email associated with the account of the administrator to be removed
   * @param {TelepatCallback} callback Callback invoked after operation is finished
   */
  deauthorize(user, callback) {
    API.call('/admin/app/deauthorize', {
      email: user
    }, (err, res) => {
      if (err) {
        return callback(error('Deauthorizing admin failed with error: ' + err), null);
      }

      callback();
    });
  };

  unhook() {
    this._monitor.remove({channel: {model: 'application'}});
    this._monitor.remove({channel: {model: 'user'}});
  };
};
