import EventObject from './event';
import API from './api';
import log from './logger';
import error from './error';
import JDP from 'jsondiffpatch';

var jsondiffpatch = JDP.create({
  objectHash: function (obj) {
    if (obj.id) {
      return obj.id;
    }
    return JSON.stringify(obj);
  }, textDiff: {
    minLength: 10000
  }
});

export default class Monitor {
  constructor(interval = 150) {
    function objectPropertyTrimFilter(context) {
      function trimObject(obj) {
        var trimmedObject = {};

        for (var name in obj) {
          if (name.slice(0, 2) !== '$$' && typeof obj[name] !== 'function') {
            trimmedObject[name] = obj[name];
          }
        }
        return trimmedObject;
      }
      if (!context.leftIsArray && context.leftType === 'object') {
        context.left = trimObject(context.left);
      }
      if (!context.rightIsArray && context.rightType === 'object') {
        context.right = trimObject(context.right);
      }
    }

    jsondiffpatch.processor.pipes.diff.before('objects', objectPropertyTrimFilter);

    this._updateRunning = false;
    this._processingPatch = false;
    this._timer = null;
    this._lastObjects = {};
    this._events = {};

    this.objects = {};
    this.options = {};
    this.callbacks = {};
    this.timerInterval = interval;
  }

  static subscriptionKeyForOptions(options) {
    var key = 'blg:' + API.appId;

    if (!options.channel.id && options.channel.context) {
      key += ':context:' + options.channel.context;
    }
    if (options.channel.parent) {
      key += ':' + options.channel.parent.model + ':' + options.channel.parent.id;
    }
    if (options.channel.user) {
      key += ':users:' + options.channel.user;
    }
    key += ':' + options.channel.model;
    if (options.channel.id) {
      key += ':' + options.channel.id;
    }
    if (options.filters) {
      key += ':filter:' + (btoa(JSON.stringify(options.filters)).toString('base64'));
    }
    return key;
  };

  remove(subscriptionOptions) {
    var subscriptionKey = Monitor.subscriptionKeyForOptions(subscriptionOptions);

    delete this.objects[subscriptionKey];
    delete this._lastObjects[subscriptionKey];
    delete this.options[subscriptionKey];
    delete this.callbacks[subscriptionKey];
    delete this._events[subscriptionKey];
  };

  add(subscriptionOptions, objects, event, addCallback, removeCallback, updateCallback) {
    var self = this;

    function processDeltaObject(object) {
      if (object['_t'] === 'a') {
        return true;
      }
      for (var key in object) {
        if (typeof object[key] === 'object' && processDeltaObject(object[key])) {
          delete object[key];
        }
      }
      if (Object.keys(object).length === 0) {
        return true;
      }
      return false;
    }

    function timerFunction() {
      if (self._processingPatch || self._updateRunning) {
        return;
      }
      var totalDiff = jsondiffpatch.diff(self._lastObjects, self.objects);

      if (totalDiff !== undefined) {
        log.debug('Found diff: ' + JSON.stringify(totalDiff));
        for (var subKey in totalDiff) {
          var root = self._lastObjects[subKey];
          var diff = totalDiff[subKey];
          var options = self.options[subKey];
          var callbacks = self.callbacks[subKey];
          var diffKeys = Object.keys(diff);

          for (var i = 0; i < diffKeys.length; i++) {
            var key = diffKeys[i];

            if (key !== '_t') {
              var obj = diff[key];

              if (Array.isArray(obj)) {
                if (obj.length === 1) {
                  callbacks.add(self.objects[subKey][key]);
                  delete root[key];
                  delete self.objects[subKey][key];
                  log.debug('Adding object to ' + subKey + ' channel');
                } else if (obj.length === 3) {
                  callbacks.remove(key);
                  delete root[key];
                  log.debug('Removing object from ' + subKey + ' channel');
                }
              } else {
                var objKeys = Object.keys(obj);
                var patch = [];
                var publicKey = key;

                if (Array.isArray(self.objects[subKey]) && self.objects[subKey][key].id) {
                  publicKey = self.objects[subKey][key].id;
                }

                for (var j = 0; j < objKeys.length; j++) {
                  var objKey = objKeys[j];
                  var delta = obj[objKey];

                  if (!processDeltaObject(delta)) {
                    if (typeof delta === 'object') {
                      patch.push({'op': 'replace', 'path': options.channel.model + '/' + publicKey + '/' + objKey, 'value': self.objects[subKey][key][objKey]});
                      log.debug('Modified ' + objKey + ' property on object ' + key + ', ' + options.channel.model + ' channel');
                    } else if (delta.length === 1) {
                      patch.push({'op': 'replace', 'path': options.channel.model + '/' + publicKey + '/' + objKey, 'value': delta[0]});
                      log.debug('Added ' + objKey + ' property to object ' + key + ', ' + options.channel.model + ' channel');
                    } else if (delta.length === 2) {
                      patch.push({'op': 'replace', 'path': options.channel.model + '/' + publicKey + '/' + objKey, 'value': delta[1]});
                      log.debug('Modified ' + objKey + ' property on object ' + key + ', ' + options.channel.model + ' channel');
                    } else if (delta.length === 3) {
                      log.info('Removing object properties is not supported in this version. Try setting to an empty value instead.');
                    }
                  } else {
                    patch.push({'op': 'replace', 'path': options.channel.model + '/' + publicKey + '/' + objKey, 'value': self.objects[subKey][key][objKey]});
                    log.debug('Modified ' + objKey + ' property on object ' + key + ', ' + options.channel.model + ' channel');
                  }

                  root[key][objKey] = JSON.parse(JSON.stringify(self.objects[subKey][key][objKey]));
                }

                if (patch.length) {
                  callbacks.update(publicKey, patch);
                }
                log.debug('Sending patch to object ' + key + ' on ' + options.channel.model + ' channel: ' + JSON.stringify(patch));
              }
            }
          }
        }
      }
    }

    var subscriptionKey = Monitor.subscriptionKeyForOptions(subscriptionOptions);

    this.objects[subscriptionKey] = objects;
    this.options[subscriptionKey] = subscriptionOptions;
    this.callbacks[subscriptionKey] = {
      add: addCallback,
      remove: removeCallback,
      update: updateCallback
    };
    this._events[subscriptionKey] = event;
    this._lastObjects[subscriptionKey] = JSON.parse(JSON.stringify(this.objects[subscriptionKey]));

    if (this._timer === null) {
      this._timer = setInterval(timerFunction, this.timerInterval);
    }
  };

  // ## Getting notified of object modifications
  // Use the `Channel.on('update', ...)` function to subscribe to object updates.
  //  This will only notify you of changes received from the 'outside' - you'll only see events when the backend
  //  notifies the client that there are updates available, either made by you or by someone else.
  //
  //     Channel.on('update', function(operation, parentId, parentObject, delta) {
  //       // operation can be one of 'replace', 'delete' or 'add'.
  //       // parentId is the id of the Telepat object being modified.
  //       // parentObject is the Telepat object being modified.
  //       // delta is available just for the 'replace' operation, and is an object that contains two properties:
  //  'path' (the name of the modified property on the object) and 'oldValue'.
  //     });

  processMessage(message) {
    var self = this;

    function process(operation) {
      var oldValue, root, lastRoot, event, subscription, pathComponents, parent;

      if (__0_3__) { // eslint-disable-line no-undef
        if (self.objects.hasOwnProperty(operation.subscription)) {
          root = self.objects[operation.subscription];
          lastRoot = self._lastObjects[operation.subscription];
          event = self._events[operation.subscription];

          if (operation.hasOwnProperty('path')) {
            pathComponents = operation.path.split('/');

            if (operation.hasOwnProperty('op')) {
              if (operation.op === 'replace') {
                if (!root.hasOwnProperty(pathComponents[1])) {
                  self._event.emit('error', error('Object id doesn\'t exist ' + operation));
                } else if (operation.hasOwnProperty('value')) {
                  parent = root[pathComponents[1]];

                  oldValue = parent[pathComponents[2]];
                  parent[pathComponents[2]] = operation.value;
                  lastRoot[pathComponents[1]][pathComponents[2]] = JSON.parse(JSON.stringify(operation.value));
                  event.emit('update', 'replace', pathComponents[1], parent, { path: pathComponents[2], oldValue: oldValue });
                  log.debug('Replaced property ' + pathComponents[2] + ' of object id ' + pathComponents[1] + ' with  value ' + operation.value);
                } else {
                  event.emit('error', error('Invalid operation ' + operation));
                }
              } else if (operation.op === 'delete') {
                oldValue = root[pathComponents[1]];
                delete root[pathComponents[1]];
                delete lastRoot[pathComponents[1]];
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
              if (!root.hasOwnProperty(operation.value.id)) {
                operation.value.$$event = new EventObject(log);
                root[operation.value.id] = operation.value;
                lastRoot[operation.value.id] = JSON.parse(JSON.stringify(operation.value));
                event.emit('update', 'add', operation.value.id, operation.value);
                log.debug('Added object with id ' + operation.value.id);
              } else {
                event.emit('error', error('Object id already exists ' + operation));
              }
            } else {
              event.emit('error', error('Invalid add operation ' + operation));
            }
          }
        }
      } else {
        for (var i = 0; i < operation.subscriptions.length; i++) {
          subscription = operation.subscriptions[i];

          let subscriptionComponents = subscription.split(':');

          if (subscriptionComponents[2] === 'context' && subscriptionComponents.length === 4) {
            subscriptionComponents.pop();
            subscription = subscriptionComponents.join(':');
          }

          root = self.objects[subscription];
          lastRoot = self._lastObjects[subscription];
          event = self._events[subscription];

          if (root) {
            if (operation.op === 'new') {
              if (!root.hasOwnProperty(operation.object.id)) {
                operation.object.$$event = new EventObject(log);
                root[operation.object.id] = operation.object;
                lastRoot[operation.object.id] = JSON.parse(JSON.stringify(operation.object));
                event.emit('update', 'add', operation.object.id, operation.object);
                log.debug('Added object with id ' + operation.object.id);
              } else {
                event.emit('error', error('Object id already exists ' + operation));
              }
            } else if (operation.op === 'update') {
              pathComponents = operation.patch.path.split('/');

              if (!root.hasOwnProperty(pathComponents[1])) {
                event.emit('error', error('Object id doesn\'t exist ' + operation));
              } else if (operation.patch.hasOwnProperty('value')) {
                parent = root[pathComponents[1]];

                oldValue = parent[pathComponents[2]];
                parent[pathComponents[2]] = operation.patch.value;
                lastRoot[pathComponents[1]][pathComponents[2]] = JSON.parse(JSON.stringify(operation.patch.value));
                event.emit('update', 'replace', pathComponents[1], parent, { path: pathComponents[2], oldValue: oldValue });
                log.debug('Replaced property ' + pathComponents[2] + ' of object id ' + pathComponents[1] + ' with  value ' + operation.patch.value);
              } else {
                event.emit('error', error('Invalid operation ' + operation));
              }
            } else {
              oldValue = root[operation.object.id];
              delete root[operation.object.id];
              delete lastRoot[operation.object.id];
              event.emit('update', 'delete', operation.object.id, oldValue);
              log.debug('Removed object id ' + operation.object.id);
            }
          } else {
            error('Subscription not found ' + subscription);
          }
        }
      }
    }

    this._processingPatch = true;
    log.debug('Received update: ' + JSON.stringify(message));
    var i, operation;

    for (i = 0; i < message.data.new.length; i++) {
      operation = message.data.new[i];
      if (!__0_3__) operation.op = 'new'; // eslint-disable-line no-undef
      process(operation);
    }
    for (i = 0; i < message.data.updated.length; i++) {
      operation = message.data.updated[i];
      if (!__0_3__) operation.op = 'update'; // eslint-disable-line no-undef
      process(operation);
    }
    for (i = 0; i < message.data.deleted.length; i++) {
      operation = message.data.deleted[i];
      if (!__0_3__) operation.op = 'remove'; // eslint-disable-line no-undef
      process(operation);
    }
    this._processingPatch = false;
  };
};
