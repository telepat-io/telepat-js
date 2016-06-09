'use strict';
// # Telepat Admin Class

var EventObject = require('./event');
var API = require('./api');
var log = require('./logger');
var error = require('./error');

/**
 * ## Admin Constructor
 *
 * This is generally invoked by the main [Telepat](http://docs.telepat.io/javascript-sdk/lib/telepat.js.html) object, when calling the `loginAdmin` function.
 *
 * @param {Object} api The API connection object. This is injected by Telepat.
 * @param {Object} log The logging-handling object. This is injected by Telepat.
 * @param {Object} error The error-handling object. This is injected by Telepat.
 */
var Admin = function (monitor, user) {
  this.users = null;

  var self = this;

/**
 * ## Admin.getAppUsers
 *
 * This returns an array of all the current application user objects.
 *
 *  @param {function} callback The callback function to be invoked when operation is done. The function receives 2 parameters, an error object and the user array.
 */
  this.getAppUsers = function(callback) {
    API.call('admin/users',
    {},
    function (err, res) {
      if (err) {
        callback(error('Retrieving users failed with error: ' + err), null);
      } else {
        self.users = res.body.content;
        monitor.add({channel: {model: 'users'}}, self.users, null, self.addUser, self.deleteUser, self.updateUser);
        callback(null, self.users);
      }
    });
  };

  this.getApps = function(callback) {
    API.call('admin/apps',
      null,
      function (err, res) {
        if (err) {
          callback(error('Retrieving apps failed with error: ' + err), null);
        } else {
          callback(null, res.body.content);
        }
      }, 'get');
  }

  this.appAdd = function(properties, callback) {
    API.call('admin/app/add',
      properties,
      function(err, res) {
        if (err)
          callback(error('Adding application failed with error: ' + err), null);
        else {
          callback(null, res.body.content);
        }
      });
  }

  this.appRemove = function(id, callback) {
    API.del('admin/app/remove',
      {id: id},
      function(err, res) {
        if (err)
          callback(error('Removing application failed with error: ' + err), null);
        else
          callback();
      });
  }

  this.addUser = function(user) {
    user.register(user, function () {});
  }

/**
 * ## Admin.deleteUser
 *
 * Call this to delete a user profile.
 *
 *  @param {string} email The email address of the user profile to delete
 *  @param {function} callback The callback function to be invoked when operation is done. The function receives 2 parameters, an error object and the user array.
 */
  this.deleteUser = function(user) {
    API.del('admin/user/delete',
    { username: user },
    function (err, res) {
      if (err) {
      }
    });
  };

/**
 * ## Admin.updateUser
 *
 * Call this to update a user profile.
 *
 *  @param {Object} user The object representing the user profile to update. Should at least have the `email` property set.
 *  @param {function} callback The callback function to be invoked when operation is done. The function receives 2 parameters, an error object and the user array.
 */
  this.updateUser = function(user, patch) {
    API.call('admin/user/update',
    {
      username: self.users[parseInt(user)].username,
      patches: patch
    },
    function (err, res) {
      if (err) {
      }
    });
  };
};

module.exports = Admin;
