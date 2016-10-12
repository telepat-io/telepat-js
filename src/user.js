import API from './api';
import log from './logger';
import error from './error';
import Admin from './admin';

/**
 * You can access an instance of this class using the {@link #Telepatuser user} property of the Telepat object.
 *
 * @class User
 *
 * @example
 * telepat.user.login('email', 'password', (err) => {
 *  if (err) {
 *    // Treat login error
 *  } else {
 *    // Treat successful login
 *    console.log(telepat.user.data);
 *
 *    // Update user data
 *    telepat.user.data.points++;
 *  }
 * });
 */
export default class User {
  constructor(db, event, monitor, setAdmin, callback = () => {}) {
    this._event = event;
    this._monitor = monitor;
    this._setAdmin = setAdmin;
    this._db = db;
    this._customProperties = [];
    this._userChannel = null;

    /**
     * Indicates if the currently logged in user is an admin
     * @type {boolean}
     * @memberof User
     * @instance
     */
    this.isAdmin = false;
    /**
     * Indicates if there's a saved authentication token that can be used to re-login
     * @type {boolean}
     * @memberof User
     * @instance
     */
    this.canReauth = null;
    /**
     * Object that holds all key-value data about the currently logged in user
     * @type {Object}
     * @memberof User
     * @instance
     */
    this.data = {};
    API.tokenUpdateCallback = (newToken) => {
      this._saveToken(newToken);
    };

    this._db.get(':userToken').then(doc => {
      this.canReauth = true;
      callback();
    }).catch(() => {
      this.canReauth = false;
      callback();
    });
  }

  _saveToken(token) {
    var newObject = {
      _id: ':userToken',
      value: {
        token: token,
        admin: this.isAdmin
      }
    };

    this._db.get(':userToken').then(doc => {
      newObject._rev = doc._rev;
      log.info('Replacing existing authentication token');
      this._db.put(newObject).then(doc => {
        this.canReauth = true;
      }).catch(err => {
        this.canReauth = false;
        log.warn('Could not persist authentication token. Error: ' + err);
      });
    }).catch(() => {
      this._db.put(newObject).then(doc => {
        this.canReauth = true;
      }).catch(err => {
        this.canReauth = false;
        log.warn('Could not persist authentication token. Error: ' + err);
      });
    });
  }

  _login(endpoint, options, isAdmin, callback = () => {}) {
    var self = this;

    function success(res) {
      let userContainer = {};

      for (let k in res.body.content.user) {
        self.data[k] = res.body.content.user[k];
        self._customProperties.push(k);
      }
      if (isAdmin) {
        self.isAdmin = true;
        self._setAdmin(new Admin(self));
      }

      userContainer[self.data.id] = self.data;
      self._monitor.add(
        {channel: {model: (self.isAdmin ? 'admin' : 'user')}},
        userContainer,
        null,
        () => {},
        () => {},
        self.update.bind(self)
      );

      API.authenticationToken = res.body.content.token;
      self._saveToken(API.authenticationToken);
      self._event.emit('login');
      callback(null, self);
    }

    API.call(endpoint, options, (err, res) => {
      if (err) {
        if (err.status === 404 && options.hasOwnProperty('access_token')) {
          log.info('Got 404 on Facebook login, registering user first');
          API.call('user/register-facebook', options, (err, res) => {
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

  /**
   * If there is a saved authentication token from previous connections, try to use it to login again.
   * You can call this method if the {@link #UsercanReauth canReauth} property is true.
   *
   * @param  {TelepatCallback} callback Callback invoked after reauth operation is finished
   */
  reauth(callback = () => {}) {
    this._db.get(':userToken').then(doc => {
      log.info('Retrieved saved authentication token');
      API.authenticationToken = doc.value.token;
      API.get((doc.value.admin ? 'admin/me' : 'user/me'), '', function (err, res) {
        if (err) {
          API.authenticationToken = null;
          this._setAdmin(null);
          this._db.remove(doc._id, doc._rev);
          this.canReauth = false;
          callback(error('Saved authentication token expired'), null);
          this._customProperties = [];
          this.data = {};
          this._event.emit('logout');
        } else {
          let userContainer = {};

          for (let k in res.body.content) {
            this.data[k] = res.body.content[k];
            this._customProperties.push(k);
          }
          if (res.body.content.type === 'admin') {
            this.isAdmin = true;
            this._saveToken(API.authenticationToken);
            this._setAdmin(new Admin(this));
          }

          userContainer[this.data.id] = this.data;
          this._monitor.add(
            {channel: {model: (this.isAdmin ? 'admin' : 'user')}},
            userContainer,
            null,
            () => {},
            () => {},
            this.update.bind(this)
          );
          callback(null, res);
          this._event.emit('login');
        }
      }.bind(this));
    }).catch(function (err) {
      callback(error('Error retrieving authentication token: ' + err), null);
    });
  }

  /**
   * Call this to update your profile.
   *
   * To call this method, you need to create an  array containing 'patch' objects, representing the
   * modifications that need to be persisted. The structure of a patch object is:
   *
   * `{'op': 'replace', 'path': user or admin + '/' + user_id + '/' + property, 'value': modified_value}`
   *
   * Instead of using this function, you can also update the user directly from {@link #Userdata User.data}.
   *
   * @param {string} id The user id of the updated user profile
   * @param  {Array<Object>} patches The array of patches representing the modifications that need to be persisted
   * @param {TelepatCallback} callback Callback invoked after operation is finished
   */
  update(id, patches, callback = () => {}) {
    API.call(this.isAdmin ? 'admin/update' : 'user/update', {patches: patches}, (err, res) => {
      if (err) {
        callback(error('Failed updating user: ' + res.body.message));
      } else {
        callback();
      }
    });
  }

  /**
   * Call this to request a password reset for the logged in user.
   * The process involves a confirmation email, with a link that needs to be clicked on in order to get a unique pass reset token.
   * You then use that token to call the {@link #User#resetPassword resetPassword} method that finishes the process by setting a new password.
   *
   * @param  {string} email The email/username of the user to reset the pass for
   * @param  {string} callbackURL The URL the user will be pointed to after verifying the request by clicking the link in the sent email
   * @param  {TelepatCallback} callback Callback invoked after the operation is finished
   */
  requestPasswordReset(email, type, callback = () => {}) {
    if (!email) {
      if (this.email) {
        email = this.email;
      } else {
        callback(error('You must provide a valid email address for the account that needs the password reset'), null);
        return;
      }
    }

    API.call('user/request_password_reset',
      {
        'type': type,
        'username': email
      },
    (err, res) => {
      if (err) {
        callback(error('Password reset request failed with error: ' + err), null);
      } else {
        callback(null, res.body.content);
      }
    });
  };

  /**
   * @param  {string} userId The id of the user that needs the password reset
   * @param  {string} token The token obtained from the redirect generated by calling {@link #User#requestPasswordReset requestPasswordReset}.
   * @param  {string} newPassword The new password
   * @param  {TelepatCallback} callback Callback invoked after the operation is finished
   */
  resetPassword(id, token, newPassword, callback = () => {}) {
    if (!id || !token || !newPassword) {
      callback(error('You must provide a valid user-id, pass reset token and new password for the account that needs the password reset'), null);
      return;
    }

    API.call('user/request_password_reset',
      {
        'token': token,
        'user_id': id,
        'password': newPassword
      },
    (err, res) => {
      if (err) {
        callback(error('Password reset request failed with error: ' + err), null);
      } else {
        callback(null, res.body.content);
      }
    });
  };

  /**
   * This function creates a new user profile.
   *
   * @param {Object} user The object representing the new user profile
   * @param {TelepatCallback} callback Callback invoked after the operation is finished
   */
  register(user, callback = () => {}) {
    API.call('user/register-username', user, callback);
  };

  /**
   * This function creates a new admin profile.
   *
   * @param {Object} admin The object representing the new admin profile
   * @param {TelepatCallback} callback Callback invoked after the operation is finished
   */
  registerAdmin(admin, callback = () => {}) {
    API.call('admin/add', admin, (err, res) => {
      if (err) {
        callback(error('Register failed with error: ' + (res.body.message) || ''), null);
      } else {
        callback(null, res.body.content);
      }
    });
  };

  /**
   * This function associates the current anonymous device to a Telepat user profile, using a Facebook
    account for authentication.
   *
   * @param {string} facebookToken The user token obtained from Facebook after login
   * @param {TelepatCallback} callback Callback invoked after the operation is finished
   */
  loginWithFacebook(facebookToken, callback = () => {}) {
    return this._login('user/login-facebook', { 'access_token': facebookToken }, false, callback);
  };

  /**
   * This function associates the current anonymous device to a Telepat user profile, using a password for authentication.
   *
   * @param {string} email The user's email address
   * @param {string} password The user's password
   * @param {TelepatCallback} callback Callback invoked after the operation is finished
   * @example
   * telepat.user.login('email', 'password', (err) => {
   *  if (err) {
   *    // Treat login error
   *  } else {
   *    // Treat successful login
   *    console.log(telepat.user.data);
   *  }
   * });
   */
  login(email, password, callback = () => {}) {
    return this._login('user/login_password', { username: email, password: password }, false, callback);
  };

  /**
   * This function associates the current anonymous device to a Telepat administrator profile, using a password for authentication.
   *
   * @param {string} email The admin email address
   * @param {string} password The admin password
   * @param {TelepatCallback} callback Callback invoked after the operation is finished
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
   *      }
   *    })
   *  }
   * });
   */
  loginAdmin(email, password, callback = () => {}) {
    return this._login('admin/login', { email: email, password: password }, true, callback);
  };

  /**
   * Call this to retrieve a specific application user object.
   * Results will be sent as a callback argument.
   *
   * @param {string} userId The id of the requested user
   * @param {TelepatCallback} callback Callback invoked after operation is finished
   */
  get(userId, callback = () => {}) {
    API.get('user/get', 'user_id=' + encodeURIComponent(userId), (err, res) => {
      if (err) {
        callback(error('Retrieving user failed with error: ' + err), null);
      } else {
        callback(null, res.body.content);
      }
    });
  };

  /**
   * This function retrieves the currently logged in user's information.
   *
   * @param {TelepatCallback} callback Callback invoked after the operation is finished
   */
  me(callback = () => {}) {
    API.get((this.isAdmin ? 'admin/me' : 'user/me'), '', (err, res) => {
      if (err) {
        callback(console.error('Request failed with error: ' + err), null);
      } else {
        callback(null, JSON.parse(res.text).content);
      }
    });
  };

  /**
   * Logs the current user out.
   *
   * @param {TelepatCallback} callback Callback invoked after the operation is finished
   */
  logout(callback = () => {}) {
    this._db.get(':userToken').then(doc => {
      this._db.remove(doc._id, doc._rev);
    }).catch(function () {
    });
    this._setAdmin(null);
    this.isAdmin = false;
    this.canReauth = false;
    this._customProperties = [];
    this.data = {};

    API.get('user/logout', '', err => {
      API.authenticationToken = null;
      if (err) {
        this._event.emit('logout_error', error('Logout failed with error: ' + err));
        callback(err);
      } else {
        this._event.emit('logout');
        callback();
      }
    });
  };
};
