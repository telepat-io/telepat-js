'use strict';

import EventObject from './event';
import API from './api';
import log from './logger';
import error from './error';

// # Telepat Channel Class
// Use Channels to create, update and remove Telepat objects. You can create new Channels using the `subscribe`
//  function of the main [Telepat](http://docs.telepat.io/javascript-sdk/lib/telepat.js.html) object.

/**
 * ## Channel Constructor
 *
 * This is generally invoked by the main [Telepat](http://docs.telepat.io/javascript-sdk/lib/telepat.js.html) object,
  when calling the `subscribe` function.
 *
 * @param {Object} api The API connection object. This is injected by Telepat.
 * @param {Object} log The logging-handling object. This is injected by Telepat.
 * @param {Object} error The error-handling object. This is injected by Telepat.
 * @param {Object} options The object describing the required subscription (context, channel, filters)
 * @param {integer} interval The time interval in miliseconds between two object-monitoring jobs. Defaults to 150.
 */

export default class Channel {
  constructor(monitor, options) {
    this._event = new EventObject(log);
    this._monitor = monitor;
    this._options = options;

    // ## Channel.objects
    // You can access a hash of all the objects on the current channel using this property. Each object is stored
    //  on a key named after the object id.
    this.objects = {};
    this.objectsArray = [];
    this.objectsCount = null;
  }

  _sortObjectArray() {
    if (this._options.sort) {
      this.objectsArray.sort((a, b) => {
        let result = null;

        Object.keys(this._options.sort).map(key => {
          let order = this._options.sort[key];
          let factor = (order === 'asc') ? 1 : -1;

          if (a[key] && !b[key]) {
            result = factor;
          }
          if (!a[key] && b[key]) {
            result = -factor;
          }
          if (a[key] && b[key]) {
            if (a[key] < b[key]) {
              result = -factor;
            }
            if (a[key] > b[key]) {
              result = factor;
            }
          }
        });

        if (!result) {
          return 0;
        }
        return result;
      });
    }
  }

/**
 * ## Channel.subscribe
 *
 * Call this function to actually subscribe to the configured channel. This is usually invoked by the
  `subscribe` method on the main Telepat object.
 *
 * There are two possible events emitted by the Channel as a result:
 *
 * - `subscribe`, after a successful channel subscribe
 * - `error`
 *
 */
  subscribe() {
    API.call('object/subscribe',
    this._options,
    (err, res) => {
      if (err) {
        this._event.emit('error', error('Subscribe failed with error: ' + err));
      } else {
        var i;

        for (i = 0; i < res.body.content.length; i++) {
          this.objects[res.body.content[i].id] = res.body.content[i];
        }
        this.objectsArray = res.body.content;
        this._sortObjectArray();
        var objectKeys = Object.keys(this.objects);

        for (i = 0; i < objectKeys.length; i++) {
          this.objects[objectKeys[i]].$$event = new EventObject(log);
        }
        this._monitor.add(this._options, this.objects, this._event, this.add.bind(this), this.remove.bind(this), this.update.bind(this));
        this._event.on('update', (operation, parentId, parentObject, delta) => {
          if (operation === 'add') {
            this.objectsArray.push(parentObject);
            this._sortObjectArray();
            if (this.objectsCount) {
              this.objectsCount++;
            }
          } else if (operation === 'delete') {
            this.objectsArray = this.objectsArray.filter(object => {
              return object.id !== parentId;
            });
            this._sortObjectArray();
            if (this.objectsCount) {
              this.objectsCount--;
            }
          }
        });
        this._event.emit('subscribe');
      }
    });
  }

/**
 * ## Channel.unsubscribe
 *
 * Call this function to unsubscribe from the configured channel.
 *
 * There are two possible events emitted by the Channel as a result:
 *
 * - `unsubscribe`, after a successful channel unsubscribe
 * - `error`
 *
 */
  unsubscribe(callback = () => {}) {
    API.call('object/unsubscribe',
      this._options,
      err => {
        if (err) {
          this._event.emit('error', error('Unsubscribe failed with error: ' + err));
          callback(err);
        } else {
          this.objects = {};
          this.objectsArray = [];
          this.objectsCount = null;
          this._monitor.remove(this._options);
          this._event.emit('unsubscribe');
          this._event.emit('_unsubscribe');
          callback();
        }
      });
  }

  getCount(callback = () => {}) {
    API.call('object/count',
      this._options,
      (err, res) => {
        if (err) {
          this._event.emit('error', error('Get object count failed with error: ' + err));
          callback(err, null);
        } else {
          this.objectsCount = res.body.content.count;
          callback(null, this.objectsCount);
        }
      });
  }

/**
 * ## Channel.add
 *
 * Add a new Telepat object to the current channel. The channel might emit an `error` if the operation fails.
 *
 * @param {Object} object The new object to add
 *
 */
  add(object) {
    API.call('object/create',
      {
        model: this._options.channel.model,
        context: this._options.channel.context || object.context_id,
        content: object
      },
      err => {
        if (err) {
          this._event.emit('error', error('Adding object failed with error: ' + err));
        } else {
        }
      });
  }

/**
 * ## Channel.remove
 *
 * Remove a Telepat object from the current channel. The channel might emit an `error` if the operation fails.
 *
 * Instead of using this function, you can also delete the object from `Channel.objects`.
 *
 * @param {integer} id The id of the object to delete
 *
 */
  remove(id) {
    API.del('object/delete',
      {
        model: this._options.channel.model,
        context: this._options.channel.context || this.objects[id].context_id,
        id: id
      },
      err => {
        if (err) {
          this._event.emit('error', error('Removing object failed with error: ' + err));
        } else {
        }
      });
  }

/**
 * ## Channel.update
 *
 * Updates a Telepat object from the current channel. The channel might emit an `error` if the operation fails.
 *
 * To call this function, you need to create an  array containing 'patch' objects, representing the
  modifications that need to be persisted. The structure of a patch object is:
 *
 * `{'op': 'replace', 'path': channel + '/' + object_id + '/' + object_property, 'value': modified_value}`
 *
 * Instead of using this function, you can also update the object directly from `Channel.objects`.
 *
 * @param {integer} id The id of the object to update
 * @param {Array} patch The array of patches representing the modifications that need to be persisted.
 *
 */
  update(id, patch) {
    API.call('object/update',
      {
        model: this._options.channel.model,
        context: this._options.channel.context || this.objects[id].context_id,
        id: id,
        patches: patch
      },
      err => {
        if (err) {
          this._event.emit('error', error('Updating object failed with error: ' + err));
        } else {
        }
      });
  }

/**
 * ## Channel.on
 *
 * Call this function to add callbacks to be invoked on event triggers.
 *
 * @param {string} name The name of the event to associate the callback with
 * @param {function} callback The callback to be executed
 */
  on(name, callback) {
    return this._event.on(name, callback);
  }

  removeCallback(name, index) {
    return this._event.removeCallback(name, index);
  };
};
