'use strict';
// # Telepat Admin Class

/**
 * ## Admin Constructor
 *
 * This is generally invoked by the main [Telepat](http://docs.telepat.io/javascript-sdk/lib/telepat.js.html) object, when calling the `loginAdmin` function.
 *
 * @param {Object} api The API connection object. This is injected by Telepat.
 * @param {Object} log The logging-handling object. This is injected by Telepat.
 * @param {Object} error The error-handling object. This is injected by Telepat.
 */
var Admin = function (tapi, tlog, terror) {
  var api = tapi;
  var error = terror;
  var log = tlog;
  var self = this;

/**
 * ## Admin.getAppUsers
 *
 * This returns an array of all the current application user objects. 
 *
 *  @param {function} callback The callback function to be invoked when operation is done. The function receives 2 parameters, an error object and the user array.
 */
  this.getAppUsers = function(callback) {
    api.call('admin/users',
    {},
    function (err, res) {
      if (err) {
        callback(error('Retrieving users failed with error: ' + err), null);
      } else {
        callback(null, res.body.content);
      }
    });
  };

/**
 * ## Admin.deleteUser
 *
 * Call this to delete a user profile.
 *
 *  @param {string} email The email address of the user profile to delete
 *  @param {function} callback The callback function to be invoked when operation is done. The function receives 2 parameters, an error object and the user array.
 */
  this.deleteUser = function(email, callback) {
    api.call('admin/user/delete',
    { email: email },
    function (err, res) {
      if (err) {
        callback(error('Deleting user failed with error: ' + err), null);
      } else {
        callback(null, res.body.content);
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
  this.updateUser = function(user, callback) {
    api.call('admin/user/update',
    user,
    function (err, res) {
      if (err) {
        callback(error('Updating user failed with error: ' + err), null);
      } else {
        callback(null, res.body.content);
      }
    });
  };
};

module.exports = Admin;