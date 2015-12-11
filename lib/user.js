'use strict';
// # Telepat User Class

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
var User = function (tapi, tlog, terror, tevent, tmonitor, tsetAdmin) {
  var api = tapi;
  var error = terror;
  var log = tlog;
  var setAdmin = tsetAdmin;
  var event = tevent;
  var monitor = tmonitor;
  var userChannel = null;
  var self = this;

  var lastEmail = null;
  var lastPassword = null;
  var lastFacebookToken = null;

  function _login(endpoint, options, isAdmin, callback) {
    function success(res) {
      for(var k in res.body.content.user) {
        self[k] = res.body.content.user[k];
      }
      if (isAdmin) {
        self.isAdmin = true;
        setAdmin(new Admin(api, log, error));
      }
      //userChannel = new Channel(api, log, error, monitor, { channel: { model: 'users', id: self.id } });
      //userChannel.subscribe();
      api.authenticationToken = res.body.content.token;
      if (callback) {
        callback(null, self);
      }
      event.emit('login');
    }
    api.call(endpoint, options, function (err, res) {
      if (err) {
        if (err.status == 404 && options.hasOwnProperty('access_token')) {
          log.info('Got 404 on Facebook login, registering user first');
          api.call('user/register', options, function (err, res) {
            if (err) {
              if (callback) {
                callback(log.error('Failed to login with Facebook. Could not register or login user.'), null);
              }
              event.emit('login_error', error('Login failed with error: ' + err));
            } else {
              api.call(endpoint, options, function (err, res) {
                if (err) {
                  if (callback) {
                    callback(log.error('Failed to login with Facebook. User registration was successful, but login failed.'), null);
                  }
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
          if (callback) {
            callback(err, null);
          }
        }
      } else {
        //userChannel = new Channel(api, log, error, monitor, { channel: { model: 'users', id: self.id } });
        //userChannel.subscribe();
        api.authenticationToken = res.body.content.token;
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
    api.call('user/update_immediate',
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
    api.call('user/register', user, callback);
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
  this.loginWithFacebook = function (facebookToken, callback) {
    if (facebookToken) {
      lastFacebookToken = facebookToken;
      return _login('user/login', { 'access_token': facebookToken }, false, callback);
    } else {
      event.emit('login_error', error('Invalid token for FB login.'));
    }
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
  this.login = function (email, password, callback) {
    if (email && password) {
      lastEmail = email;
      lastPassword = password;
      return _login('user/login_password', { email: email, password: password }, false, callback);
    } else {
      event.emit('login_error', error('Invalid email or password parameters.'));
    }
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
  this.loginAdmin = function (email, password, callback) {
    if (email && password) {
      lastEmail = email;
      lastPassword = password;
      return _login('admin/login', { email: email, password: password }, true, callback);
    } else {
      event.emit('login_error', error('Invalid email or password parameters.'));
    }
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
    api.call('user/logout', {}, function (err) {
      if (err) {
        event.emit('logout_error', error('Logout failed with error: ' + err));
      } else {
        lastEmail = null;
        lastPassword = null;
        lastFacebookToken = null;
        api.authenticationToken = null;
        setAdmin(null);
        event.emit('logout');
      }
    });
  };

  this.reauthenticate = function (callback) {
    if (lastEmail) {
      if (self.isAdmin) {
        self.loginAdmin(lastEmail, lastPassword, callback);
      } else {
        self.login(lastEmail, lastPassword, callback);
      }
    } else if (lastFacebookToken) {
      self.loginWithFacebook(lastFacebookToken, callback);
    } else {
      callback(error('No previous credentials found.'), null);
    }
  }
};

module.exports = User;