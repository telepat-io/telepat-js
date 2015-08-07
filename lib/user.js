'use strict';
// # Telepat User Class

var Admin = require('./admin');

/**
 * ## Admin Constructor
 *
 * This is generally invoked by the main [Telepat](http://docs.telepat.io/javascript-sdk/lib/telepat.js.html) object.
 *
 * @param {Object} api The API connection object. This is injected by Telepat.
 * @param {Object} log The logging-handling object. This is injected by Telepat.
 * @param {Object} error The error-handling object. This is injected by Telepat.
 */
var User = function (tapi, tlog, terror, tevent, tsetAdmin) {
  this.api = tapi;
  this.error = terror; // Heh
  this.log = tlog;
  this.setAdmin = tsetAdmin;
  this.event = tevent;
  var self = this;

  this._login = function(endpoint, options) {
    self.api.call(endpoint, options, function (err, res) {
      if (err) {
        self.event.emit('login_error', self.error('Login failed with error: ' + err));
      } else {
        for(var k in res.body.content.user) {
          self[k] = res.body.content.user[k];
        }
        if (self.isAdmin) {
          self.setAdmin(new Admin(self.api, self.log, self.error));
        }
        self.api.authenticationToken = res.body.content.token;
        self.event.emit('login');
      }
    });
  };
};

/**
 * ## User.loginWithFacebook
 *
 * This function associates the current anonymous device to a Telepat user profile, using a Facebook account for authentication.
 * 
 * Two events can be asynchronously triggered by this function:
 *
 * - `login`, on success
 * - `login_error`, on error
 *
 * @param {string} facebookToken The user token obtained from Facebook after login
 */
User.prototype.loginWithFacebook = function (facebookToken) {
  return this._login('user/login', { access_token: facebookToken });
};

/**
 * ## User.login
 *
 * This function associates the current anonymous device to a Telepat user profile, using a password for authentication.
 * 
 * Two events can be asynchronously triggered by this function:
 *
 * - `login`, on success
 * - `login_error`, on error
 *
 * @param {string} email The user's email address
 * @param {string} password The user's password
 */
User.prototype.login = function (email, password) {
  return this._login('user/login_password', { email: email, password: password });
};

/**
 * ## User.loginAdmin
 *
 * This function associates the current anonymous device to a Telepat administrator profile, using a password for authentication.
 * 
 * Two events can be asynchronously triggered by this function:
 *
 * - `login`, on success
 * - `login_error`, on error
 *
 * @param {string} email The admin email address
 * @param {string} password The admin password
 */
User.prototype.loginAdmin = function (email, password) {
  return this._login('admin/login', { email: email, password: password });
};

/**
 * ## User.logout
 *
 * Obviously, logs a user out.
 * Two events can be asynchronously triggered by this function:
 *
 * - `logout`, on success
 * - `logout_error`, on error
 */
User.prototype.logout = function () {
  var self = this;
  this.api.call('user/logout', {}, function (err) {
    if (err) {
      self.event.emit('logout_error', self.error('Logout failed with error: ' + err));
    } else {
      self.api.authenticationToken = null;
      self.setAdmin(null);
      self.event.emit('logout');
    }
  });
};

module.exports = User;