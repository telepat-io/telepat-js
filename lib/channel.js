'use strict';

var EventObject = require('./event');
var API = require('./api');
var log = require('./logger');
var error = require('./error');

// # Telepat Channel Class
// Use Channels to create, update and remove Telepat objects. You can create new Channels using the `subscribe` function of the main [Telepat](http://docs.telepat.io/javascript-sdk/lib/telepat.js.html) object.

/**
 * ## Channel Constructor
 *
 * This is generally invoked by the main [Telepat](http://docs.telepat.io/javascript-sdk/lib/telepat.js.html) object, when calling the `subscribe` function.
 *
 * @param {Object} api The API connection object. This is injected by Telepat.
 * @param {Object} log The logging-handling object. This is injected by Telepat.
 * @param {Object} error The error-handling object. This is injected by Telepat.
 * @param {Object} options The object describing the required subscription (context, channel, filters)
 * @param {integer} interval The time interval in miliseconds between two object-monitoring jobs. Defaults to 150.
 */
var Channel = function (monitor, options) {
  var self = this;
  var event = new EventObject(log);

  // ## Channel.objects
  // You can access a hash of all the objects on the current channel using this property. Each object is stored on a key named after the object id.
  this.objects = {};
  this.objectsArray = [];

/**
 * ## Channel.subscribe
 *
 * Call this function to actually subscribe to the configured channel. This is usually invoked by the `subscribe` method on the main Telepat object.
 *
 * There are two possible events emitted by the Channel as a result:
 *
 * - `subscribe`, after a successful channel subscribe
 * - `error`
 *
 */
  this.subscribe = function() {
    API.call('object/subscribe',
    options,
    function (err, res) {
      if (err) {
        event.emit('error', error('Subscribe failed with error: ' + err));
      } else {
        var i;
        for (i=0; i<res.body.content.length; i++) {
          self.objects[res.body.content[i].id] = res.body.content[i];
        }
        self.objectsArray = res.body.content;
        var objectKeys = Object.keys(self.objects);
        for (i=0; i<objectKeys.length; i++) {
          self.objects[objectKeys[i]].$$event = new EventObject(log);
        }
        monitor.add(options, self.objects, event, self.add, self.remove, self.update);
        event.emit('subscribe');
      }
    });
  };

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
  this.unsubscribe = function() {
    API.call('object/unsubscribe',
      options,
      function (err) {
        if (err) {
          event.emit('error', error('Unsubscribe failed with error: ' + err));
        } else {
          self.objects = {};
          self.objectsArray = [];
          monitor.remove(options);
          event.emit('unsubscribe');
          event.emit('_unsubscribe');
        }
      });
  };

/**
 * ## Channel.add
 *
 * Add a new Telepat object to the current channel. The channel might emit an `error` if the operation fails.
 *
 * @param {Object} object The new object to add
 *
 */
  this.add = function(object) {
    API.call('object/create',
      {
        model: options.channel.model,
        context: options.channel.context || object.context_id,
        content: object
      },
      function (err) {
        if (err) {
          event.emit('error', error('Adding object failed with error: ' + err));
        } else {
        }
      });
  };

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
  this.remove = function(id) {
    API.del('object/delete',
      {
        model: options.channel.model,
        context: options.channel.context || self.objects[id].context_id,
        id: id
      },
      function (err) {
        if (err) {
          event.emit('error', error('Removing object failed with error: ' + err));
        } else {
        }
      });
  };

/**
 * ## Channel.update
 *
 * Updates a Telepat object from the current channel. The channel might emit an `error` if the operation fails.
 *
 * To call this function, you need to create an  array containing 'patch' objects, representing the modifications that need to be persisted. The structure of a patch object is:
 *
 * `{'op': 'replace', 'path': channel + '/' + object_id + '/' + object_property, 'value': modified_value}`
 *
 * Instead of using this function, you can also update the object directly from `Channel.objects`.
 *
 * @param {integer} id The id of the object to update
 * @param {Array} patch The array of patches representing the modifications that need to be persisted.
 *
 */
  this.update = function(id, patch) {
    API.call('object/update',
      {
        model: options.channel.model,
        context: options.channel.context || self.objects[id].context_id,
        id: id,
        patches: patch
      },
      function (err) {
        if (err) {
          event.emit('error', error('Updating object failed with error: ' + err));
        } else {
        }
      });
  };

/**
 * ## Channel.on
 *
 * Call this function to add callbacks to be invoked on event triggers.
 *
 * @param {string} name The name of the event to associate the callback with
 * @param {function} callback The callback to be executed
 */
  this.on = function(name, callback) {
    return event.on(name, callback);
  };
};

module.exports = Channel;
