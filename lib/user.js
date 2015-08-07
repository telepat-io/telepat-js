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
  var api = tapi;
  var error = terror;
  var log = tlog;
  var setAdmin = tsetAdmin;
  var event = tevent;
  var self = this;

  function _login(endpoint, options) {
    api.call(endpoint, options, function (err, res) {
      if (err) {
        event.emit('login_error', error('Login failed with error: ' + err));
      } else {
        for(var k in res.body.content.user) {
          self[k] = res.body.content.user[k];
        }
        if (self.isAdmin) {
          setAdmin(new Admin(api, log, error));
        }
        api.authenticationToken = res.body.content.token;
        event.emit('login');
      }
    });
  }

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
  this.loginWithFacebook = function (facebookToken) {
    return _login('user/login', { access_token: facebookToken });
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
  this.login = function (email, password) {
    return _login('user/login_password', { email: email, password: password });
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
  this.loginAdmin = function (email, password) {
    return _login('admin/login', { email: email, password: password });
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
  this.logout = function () {
    api.call('user/logout', {}, function (err) {
      if (err) {
        event.emit('logout_error', error('Logout failed with error: ' + err));
      } else {
        api.authenticationToken = null;
        setAdmin(null);
        event.emit('logout');
      }
    });
  };
};

module.exports = User;