// # Telepat Admin Class

import API from './api';
import error from './error';

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
  constructor(monitor, user) {
    this.users = null;
    this._monitor = monitor;
    this._user = user;
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
    API.call('admin/users',
    {},
    (err, res) => {
      if (err) {
        callback(error('Retrieving users failed with error: ' + err), null);
      } else {
        this.users = res.body.content;
        this._monitor.add({channel: {model: 'users'}}, this.users, null, this.addUser, this.deleteUser, this.updateUser);
        callback(null, this.users);
      }
    });
  }

  getApps(callback = function () {}) {
    API.call('admin/apps',
      null,
      (err, res) => {
        if (err) {
          callback(error('Retrieving apps failed with error: ' + err), null);
        } else {
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

  addContext(context, callback = () => {}) {
    API.call('admin/context/add',
      context,
      (err, res) => {
        if (err)
          return callback(error('Creating context failed with error: ' + err));

        callback(null, res);
      })
  }

  updateContext(id, patches, callback = () => {}) {
    API.call('admin/context/update',
      {id: id, patches: patches},
      (err, res) => {
        if (err)
          return callback(error('Updating context failed with error: ' + err));

        callback();
      });
  }

  deleteContext(id, callback = () => {}) {
    API.call('admin/context/delete',
      {id: id},
      (err, res) => {
        if (err)
          return callback(error('Deleting context failed with error: ' + err));

        callback();
      })
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
  deleteUser(user, callback = function () {}) {
    API.del('admin/user/delete',
    { username: user },
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
  updateUser(user, patch, callback = function () {}) {
    API.call('admin/user/update', {
      username: this.users[parseInt(user, 10)].username,
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
};
