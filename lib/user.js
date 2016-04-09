'use strict';
// # Telepat User Class

var EventObject = require('./event');
var API = require('./api');
var log = require('./logger');
var error = require('./error');

var Admin = require('./admin');
var Channel = require('./channel');

/**
 * ## User Constructor
 *
 * This is generally invoked by the main [Telepat](http://docs.telepat.io/javascript-sdk/lib/telepat.js.html) object.
 *
 * @param {Object} api The API connection object. This is injected by Telepat.
 * @param {Object} log The logging-handling object. This is injected by Telepat.
 * @param {Object} error The error-handling object. This is injected by Telepat.
 * @param {Object} monitor The monitoring object. This is injected by Telepat.
 * @param {function} setAdmin Method to allow this class to set administrators. This is injected by Telepat.
 */
var User = function (event, monitor, setAdmin) {
  var userChannel = null;
  var self = this;

  function _login(endpoint, options, isAdmin) {
    function success(res) {
      for(var k in res.body.content.user) {
        self[k] = res.body.content.user[k];
      }
      if (isAdmin) {
        self.isAdmin = true;
        setAdmin(new Admin(monitor, self));
      }
      //userChannel = new Channel(api, log, error, monitor, { channel: { model: 'users', id: self.id } });
      //userChannel.subscribe();
      API.authenticationToken = res.body.content.token;
      event.emit('login');
    }
    API.call(endpoint, options, function (err, res) {
      if (err) {
        if (err.status == 404 && options.hasOwnProperty('access_token')) {
          log.info('Got 404 on Facebook login, registering user first');
          API.call('user/register_facebook', options, function (err, res) {
            if (err) {
              log.error('Failed to login with Facebook. Could not register or login user.');
              event.emit('login_error', error('Login failed with error: ' + err));
            } else {
              API.call(endpoint, options, function (err, res) {
                if (err) {
                  log.error('Failed to login with Facebook. User registration was successful, but login failed.');
                  event.emit('login_error', error('Login failed with error: ' + err));
                } else {
                  success(res);
                }
              });
            }
          });
        }
        else {
          event.emit('login_error', error('Login failed with error: ' + err));
        }
      } else {
        success(res);
      }
    });
  }

  this.update = function(callback) {
    var result = {};
    for (var key in self) {
      if (self.hasOwnProperty(key)) {
        result[key] = self[key];
      }
    }
    API.call('user/update_immediate',
    { user: result },
    function (err, res) {
      if (err) {
        callback(error('Updating user failed with error: ' + err), null);
      } else {
        callback(null, res.body.content);
      }
    });
  };

  /**
   * ## User.register
   *
   * This function creates a new user profile.
   *
   * @param {Object} user The object representing the user profile
   * @param {function} callback The callback function to be invoked when operation is done. The function receives 2 parameters, an error object and the user array.
   */
  this.register = function (user, callback) {
    API.call('user/register-username', user, callback);
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
  this.loginWithFacebook = function (facebookToken) {
    return _login('user/login-facebook', { 'access_token': facebookToken });
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
    return _login('user/login_password', { username: email, password: password });
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
    return _login('admin/login', { email: email, password: password }, true);
  };

  /**
   * ## User.get
   *
   * This function retrieves a Telepat user's information, based on id
   *
   * @param {Object} user The user's Telepat ID
   * @param {function} callback The callback function to be invoked when operation is done. The function receives 2 parameters, an error object and the user array.
   */
  this.get = function (userId, callback) {
    API.get('user/get', "user_id="+encodeURIComponent(userId), function(err, res) {
      if(err) {
        callback(console.error('Request failed with error: '+ err), null);
      } else {
        callback(null, JSON.parse(res.text).content);
      }
    });
  };

  /**
   * ## User.me
   *
   * This function retrieves the currently logged in user's information
   *
   * @param {function} callback The callback function to be invoked when operation is done. The function receives 2 parameters, an error object and the user array.
   */
  this.get = function (callback) {
    API.get('user/me', "", function(err, res) {
      if(err) {
        callback(console.error('Request failed with error: '+ err), null);
      } else {
        callback(null, JSON.parse(res.text).content);
      }
    });
  };

  /**
   * ## User.logout
   *
   * Logs a user out.
   * Two events can be asynchronously triggered by this function:
   *
   * - `logout`, on success
   * - `logout_error`, on error
   */
  this.logout = function () {
    API.call('user/logout', {}, function (err) {
      if (err) {
        event.emit('logout_error', error('Logout failed with error: ' + err));
      } else {
        API.authenticationToken = null;
        setAdmin(null);
        event.emit('logout');
      }
    });
  };
};

module.exports = User;
