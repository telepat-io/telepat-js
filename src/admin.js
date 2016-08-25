// # Telepat Admin Class

import API from './api';
import error from './error';
import Channel from './channel';

/**
 * ## Admin Constructor
 *
 * This is generally invoked by the main [Telepat](http://docs.telepat.io/javascript-sdk/lib/telepat.js.html)
  object, when calling the `loginAdmin` function.
 *
 * @param {Object} api The API connection object. This is injected by Telepat.
 * @param {Object} log The logging-handling object. This is injected by Telepat.
 * @param {Object} error The error-handling object. This is injected by Telepat.
 */

export default class Admin {
  constructor(user) {
    this.users = null;
    this._user = user;
    this._monitor = user._monitor;
    this._event = user._event;
    this.apps = null;
    this.app = null;
    this._userSubscription = null;
  }

/**
 * ## Admin.getAppUsers
 *
 * This returns an array of all the current application user objects.
 *
 *  @param {function} callback The callback function to be invoked when operation is done.
  The function receives 2 parameters, an error object and the user array.
 */
  getAppUsers(callback = function () {}) {
    this._userSubscription = new Channel(this._monitor, {channel: {model: 'user'}});
    this._userSubscription.on('subscribe', () => {
      this.users = this._userSubscription.objects;
      this._monitor.add({channel: {model: 'user'}}, this.users, null, this.addUser, this.deleteUser, this.updateUser);
      callback(null, this._userSubscription.objects);
    });
    this._userSubscription.subscribe();

    // API.call('admin/users',
    // {},
    // (err, res) => {
    //   if (err) {
    //     callback(error('Retrieving users failed with error: ' + err), null);
    //   } else {
    //     this.users = res.body.content;
    //     this._monitor.add({channel: {model: 'user'}}, this.users, null, this.addUser, this.deleteUser, this.updateUser);
    //     callback(null, this.users);
    //   }
    // });
  }

  getAppUser(id, callback = function () {}) {
    API.call('user/get',
    'user_id=' + id,
    (err, res) => {
      if (err) {
        callback(error('Retrieving user failed with error: ' + err), null);
      } else {
        callback(null, res.body.content);
      }
    }, 'get');
  }

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

  addApp(properties, callback = function () {}) {
    API.call('admin/app/add',
      properties,
      (err, res) => {
        if (err) {
          callback(error('Adding application failed with error: ' + err), null);
        } else {
          callback(null, res.body.content);
        }
      });
  }

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

  updateAdmin(patches, callback) {
    API.call('admin/update', {patches: patches}, (err, res) => {
      if (err) {
        return callback(error('Failed updating admin: ' + res.body.message));
      }

      callback();
    });
  }

  addUser(user, callback = function () {}) {
    this._user.register(user, callback);
  };

/**
 * ## Admin.deleteUser
 *
 * Call this to delete a user profile.
 *
 *  @param {string} email The email address of the user profile to delete
 *  @param {function} callback The callback function to be invoked when operation is done.
  The function receives 2 parameters, an error object and the user array.
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
 * ## Admin.updateUser
 *
 * Call this to update a user profile.
 *
 *  @param {Object} user The object representing the user profile to update.
  Should at least have the `email` property set.
 *  @param {function} callback The callback function to be invoked when operation is done.
  The function receives 2 parameters, an error object and the user array.
 */
  updateUser(patch, callback = function () {}) {
    API.call('admin/user/update', {
      patches: patch
    },
    (err, res) => {
      if (err) {
        callback(error('Removing user failed with error: ' + err), null);
      } else {
        callback();
      }
    });
  };

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
    if (this._userSubscription) {
      this._userSubscription.unsubscribe();
    }
    this._monitor.remove({channel: {model: 'user'}});
    this._monitor.remove({channel: {model: 'application'}});
  };
};
