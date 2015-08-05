'use strict';

// # Telepat Channel Class
// Use Channels to create, update and remove Telepat objects. You can create new Channels using the `subscribe` function of the main [Telepat](http://docs.telepat.io/javascript-sdk/lib/telepat.js.html) object.

var EventObject = require('./event');
var jsondiffpatch = require('jsondiffpatch').create({
  objectHash: function(obj) {
    return obj._id || obj.id;
  }
});

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
var Channel = function (tapi, tlog, terror, toptions, interval) {
  var api = tapi;
  var error = terror;
  var options = toptions;
  var log = tlog;
  var event = new EventObject(log);
  var self = this;
  var timer;
  var lastObjects;
  var processingPatch = false;
  jsondiffpatch.processor.pipes.diff.before('objects', objectPropertyTrimFilter);
  var updateRunning = false;
  var timerInterval = interval || 150;

  function trimObject(obj) {
    var trimmedObject = {};
    for (var name in obj) {
      if (name.slice(0, 2) !== '$$') {
        trimmedObject[name] = obj[name];
      }
    }
    return trimmedObject;
  }

  function objectPropertyTrimFilter(context) {
    if (!context.leftIsArray && context.leftType === 'object') {
      context.left = trimObject(context.left);
    }
    if (!context.rightIsArray && context.rightType === 'object') {
      context.right = trimObject(context.right);
    }
  }

  // ## Channel.objects
  // You can access a hash of all the objects on the current channel using this property. Each object is stored on a key named after the object id.
  this.objects = {};

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
    api.call('object/subscribe',
    options,
    function (err, res) {
      if (err) {
        event.emit('error', error('Subscribe failed with error: ' + err));
      } else {
        var i;
        for (i=0; i<res.body.content.length; i++) {
          self.objects[res.body.content[i].id] = res.body.content[i];
        }
        var objectKeys = Object.keys(self.objects);
        for (i=0; i<objectKeys.length; i++) {
          self.objects[objectKeys[i]].$$event = new EventObject(log);
        }
        lastObjects = JSON.parse(JSON.stringify(self.objects));
        event.emit('subscribe');

        // ## Modifying objects
        // - To create new objects, you can either add a new property on `Channel.objects` or use the `Channel.add` function. Any new properties added to `Channel.objects` will be immediately removed, and then added back (on the proper key, assigned by the server) - therefore, it is probably more convenient to use the `Channel.add` function for adding new objects.
        // - To edit or delete objects, simply access them using `Channel.objects` and make modifications as needed. Alternatively, you can also call the `Channel.remove` and `Channel.update` functions.
        timer = setInterval(function () {
          if (self.processingPatch || updateRunning) {
            return;
          }
          var diff = jsondiffpatch.diff(lastObjects, self.objects);
          if (diff !== undefined) {
            log.debug('Found diff: ' + JSON.stringify(diff));
            var diffKeys = Object.keys(diff);
            for (var i=0; i<diffKeys.length; i++) {
              var key = diffKeys[i];
              var obj = diff[key];

              if (Array.isArray(obj)) {
                if (obj.length === 1) {
                  self.add(self.objects[key]);
                  delete self.objects[key];
                  log.debug('Adding object to ' + options.channel.model + ' channel');
                } else if (obj.length === 3) {
                  self.remove(key);
                  log.debug('Removing object from ' + options.channel.model + ' channel');
                }
              } else {
                var objKeys = Object.keys(obj);
                var patch = [];

                for (var j=0; j<objKeys.length; j++) {
                  var objKey = objKeys[j];
                  var delta = obj[objKey];
                  if (typeof delta === 'object') {
                    patch.push({'op': 'replace', 'path': options.channel.model + '/' + key + '/' + objKey, 'value': self.objects[key][objKey]});
                    log.debug('Modified ' + objKey + ' property on object ' + key + ', ' + options.channel.model + ' channel');
                  } else if (delta.length === 1) {
                    patch.push({'op': 'replace', 'path': options.channel.model + '/' + key + '/' + objKey, 'value': delta[0]});
                    log.debug('Added ' + objKey + ' property to object ' + key + ', ' + options.channel.model + ' channel');
                  } else if (delta.length === 2) {
                    patch.push({'op': 'replace', 'path': options.channel.model + '/' + key + '/' + objKey, 'value': delta[1]});
                    log.debug('Modified ' + objKey + ' property on object ' + key + ', ' + options.channel.model + ' channel');
                  } else if (delta.length === 3) {
                    log.info('Removing object properties is not supported in this version. Try setting to an empty value instead.');
                  }
                }

                self.update(key, patch);
                log.debug('Sending patch to object ' + key + ' on ' + options.channel.model + ' channel: ' + JSON.stringify(patch));
              }
            }
            lastObjects = JSON.parse(JSON.stringify(self.objects));
          }
        }, timerInterval);
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
    api.call('object/unsubscribe',
      options,
      function (err, res) {
        if (err) {
          event.emit('error', error('Unsubscribe failed with error: ' + err));
        } else {
          self.objects = {};
          clearInterval(timer);
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
    api.call('object/create',
      {
        model: options.channel.model,
        context: options.channel.context,
        content: object
      },
      function (err, res) {
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
    api.call('object/delete',
      {
        model: options.channel.model,
        context: options.channel.context,
        id: id
      },
      function (err, res) {
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
    updateRunning = true;
    api.call('object/update',
      {
        model: options.channel.model,
        context: options.channel.context,
        id: id,
        patch: patch
      },
      function (err, res) {
        if (err) {
          event.emit('error', error('Updating object failed with error: ' + err));
        } else {
        }
        updateRunning = false;
      });
  };

  // ## Getting notified of object modifications
  // Use the `Channel.on('update', ...)` function to subscribe to object updates. This will only notify you of changes received from the 'outside' - you'll only see events when the backend notifies the client that there are updates available, either made by you or by someone else.
  // 
  //     Channel.on('update', function(operation, parentId, parentObject, delta) {
  //       // operation can be one of 'replace', 'delete' or 'add'.
  //       // parentId is the id of the Telepat object being modified.
  //       // parentObject is the Telepat object being modified.
  //       // delta is available just for the 'replace' operation, and is an object that contains two properties: 'path' (the name of the modified property on the object) and 'oldValue'.
  //     });
  this.processPatch = function (operation) {
    this.processingPatch = true;
    if (operation.hasOwnProperty('path')) {
      var pathComponents = operation.path.split('/');
      if (operation.hasOwnProperty('op')) {
        if (operation.op === 'replace') {
          if (!this.objects.hasOwnProperty(pathComponents[1])) {
            event.emit('error', error('Object id doesn\'t exist ' + operation));
          } else if (operation.hasOwnProperty('value')) {
            var parent = this.objects[pathComponents[1]];
            var oldValue = parent[pathComponents[2]];
            parent[pathComponents[2]] = operation.value;
            event.emit('update', 'replace', pathComponents[1], parent, { path: pathComponents[2], oldValue: oldValue });
            log.debug('Replaced property ' + pathComponents[2] + ' of object id ' + pathComponents[1] + ' with  value ' + operation.value);
          } else {
            event.emit('error', error('Invalid operation ' + operation));
          }
        } else if (operation.op === 'delete') {
          var oldValue = this.objects[pathComponents[1]];
          delete this.objects[pathComponents[1]];
          event.emit('update', 'delete', pathComponents[1], oldValue);
          log.debug('Removed object id ' + pathComponents[1]);
        } else {
          event.emit('error', error('Unsupported operation ' + operation));
        }
      } else {
        event.emit('error', error('Invalid operation ' + operation));
      }
    } else {
      if (operation.hasOwnProperty('value') && operation.value.hasOwnProperty('id')) {
        if (!this.objects.hasOwnProperty(operation.value.id)) {
          operation.value.$$event = new EventObject(log);
          this.objects[operation.value.id] = operation.value;
          event.emit('update', 'add', operation.value.id, operation.value);
          log.debug('Added object with id ' + operation.value.id);
        } else {
          event.emit('error', error('Object id already exists ' + operation));
        }
      } else {
        event.emit('error', error('Invalid add operation ' + operation));
      }
    }
    lastObjects = JSON.parse(JSON.stringify(self.objects));
    this.processingPatch = false;
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