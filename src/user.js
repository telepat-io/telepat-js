// # Telepat User Class

import API from './api';
import log from './logger';
import error from './error';
import Admin from './admin';

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
export default class User {
  constructor(db, event, monitor, setAdmin) {
    this._event = event;
    this._monitor = monitor;
    this._setAdmin = setAdmin;
    this._db = db;
    this.isAdmin = false;
  }

  _login(endpoint, options, isAdmin, callback = () => {}) {
    var self = this;

    function success(res) {
      for (var k in res.body.content.user) {
        self[k] = res.body.content.user[k];
      }
      if (isAdmin) {
        self.isAdmin = true;
        self._setAdmin(new Admin(self._monitor, self));
      }

      // userChannel = new Channel(api, log, error, monitor, { channel: { model: 'users', id: self.id } });
      // userChannel.subscribe();
      API.authenticationToken = res.body.content.token;

      var newObject = {
        _id: ':userToken',
        value: {
          token: res.body.content.token,
          admin: isAdmin
        }
      };

      self._db.get(':userToken').then(doc => {
        newObject._rev = doc._rev;
        log.warn('Replacing existing authentication token');
        self._db.put(newObject).catch(err => {
          log.warn('Could not persist authentication token. Error: ' + err);
        });
      }).catch(() => {
        self._db.put(newObject).catch(err => {
          log.warn('Could not persist authentication token. Error: ' + err);
        });
      });

      self._event.emit('login');
      callback(null, self);
    }

    API.call(endpoint, options, (err, res) => {
      if (err) {
        if (err.status === 404 && options.hasOwnProperty('access_token')) {
          log.info('Got 404 on Facebook login, registering user first');
          API.call('user/register_facebook', options, (err, res) => {
            if (err) {
              log.error('Failed to login with Facebook. Could not register or login user.');
              self._event.emit('login_error', error('Login failed with error: ' + err));
            } else {
              API.call(endpoint, options, function (err, res) {
                if (err) {
                  log.error('Failed to login with Facebook. User registration was successful, but login failed.');
                  self._event.emit('login_error', error('Login failed with error: ' + err));
                } else {
                  success(res);
                }
              });
            }
          });
        } else {
          self._event.emit('login_error', error('Login failed with error: ' + err));
          callback(err, null);
        }
      } else {
        success(res);
      }
    });
  }

  reauth() {
    this._db.get(':userToken').then(doc => {
      log.info('Retrieved saved authentication token');
      API.authenticationToken = doc.value.token;
      API.get((doc.value.admin ? 'admin/me' : 'user/me'), '', function (err, res) {
        if (err) {
          API.authenticationToken = null;
          this._setAdmin(null);
          this._db.remove(doc._id, doc._rev);
          this._event.emit('logout');
        } else {
          for (var k in res.body.content) {
            this[k] = res.body.content[k];
          }
          if (doc.value.admin) {
            this.isAdmin = true;
            this._setAdmin(new Admin(this._monitor, this));
          }
          this._event.emit('login');
        }
      }.bind(this));
    }).catch(function () {
    });
  }

  update(callback) {
    var result = {};

    for (var key in self) {
      if (self.hasOwnProperty(key)) {
        result[key] = self[key];
      }
    }
    API.call('user/update_immediate',
    { user: result },
    (err, res) => {
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
   * @param {function} callback The callback function to be invoked when operation is done.
    The function receives 2 parameters, an error object and the user array.
   */
  register(user, callback) {
    API.call('user/register-username', user, callback);
  };

  /**
   * ## User.registerAdmin
   *
   * This function creates a new admin profile.
   *
   * @param {Object} admin The object representing the admin profile
   * @param {function} callback The callback function to be invoked when operation is done.
    The function receives 2 parameters, an error object and the user array.
   */
  registerAdmin(admin, callback) {
    API.call('admin/add', admin, callback);
  };

  /**
   * ## User.loginWithFacebook
   *
   * This function associates the current anonymous device to a Telepat user profile, using a Facebook
    account for authentication.
   *
   * Two events can be asynchronously triggered by this function:
   *
   * - `login`, on success
   * - `login_error`, on error
   *
   * @param {string} facebookToken The user token obtained from Facebook after login
   */
  loginWithFacebook(facebookToken, callback) {
    return this._login('user/login-facebook', { 'access_token': facebookToken }, false, callback);
  };

  /**
   * ## User.login
   *
   * This function associates the current anonymous device to a Telepat user profile,
    using a password for authentication.
   *
   * Two events can be asynchronously triggered by this function:
   *
   * - `login`, on success
   * - `login_error`, on error
   *
   * @param {string} email The user's email address
   * @param {string} password The user's password
   */
  login(email, password, callback) {
    return this._login('user/login_password', { username: email, password: password }, false, callback);
  };

  /**
   * ## User.loginAdmin
   *
   * This function associates the current anonymous device to a Telepat administrator profile,
    using a password for authentication.
   *
   * Two events can be asynchronously triggered by this function:
   *
   * - `login`, on success
   * - `login_error`, on error
   *
   * @param {string} email The admin email address
   * @param {string} password The admin password
   */
  loginAdmin(email, password, callback) {
    return this._login('admin/login', { email: email, password: password }, true, callback);
  };

  /**
   * ## User.get
   *
   * This function retrieves a Telepat user's information, based on id
   *
   * @param {Object} user The user's Telepat ID
   * @param {function} callback The callback function to be invoked when operation is done.
    The function receives 2 parameters, an error object and the user array.
   */
  get(userId, callback) {
    API.get('user/get', 'user_id=' + encodeURIComponent(userId), (err, res) => {
      if (err) {
        callback(console.error('Request failed with error: ' + err), null);
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
   * @param {function} callback The callback function to be invoked when operation is done.
    The function receives 2 parameters, an error object and the user array.
   */
  me(callback) {
    API.get((this.isAdmin ? 'admin/me' : 'user/me'), '', (err, res) => {
      if (err) {
        callback(console.error('Request failed with error: ' + err), null);
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
  logout(callback = () => {}) {
    API.get('user/logout', {}, err => {
      if (err) {
        this._event.emit('logout_error', error('Logout failed with error: ' + err));
        callback(err);
      } else {
        API.authenticationToken = null;
        this._setAdmin(null);
        this._event.emit('logout');
        callback();
      }
    });
  };
};
