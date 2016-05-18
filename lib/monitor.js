'use strict';

// # Telepat Monitor Class

var EventObject = require('./event');
var API = require('./api');
var log = require('./logger');
var error = require('./error');

var jsondiffpatch = require('jsondiffpatch').create({
  objectHash: function(obj) {
    return obj._id || obj.id;
  },
  textDiff: {
    minLength: 10000
  }
});

var Monitor = function (interval) {
  var updateRunning = false;
  var processingPatch = false;
  var timer = null;
  var lastObjects;
  var self = this;
  var events = {};

  function trimObject(obj) {
    var trimmedObject = {};
    for (var name in obj) {
      if (name.slice(0, 2) !== '$$' && typeof obj[name] !== 'function') {
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

  jsondiffpatch.processor.pipes.diff.before('objects', objectPropertyTrimFilter);

  this.objects = {};
  this.options = {};
  this.callbacks = {};
  this.timerInterval = interval || 150;

  this.subscriptionKeyForOptions = function(options) {
    /*
    4:  "blg:{appId}:{model}",                                 //channel
    used for built-in models (users, contexts)
    5:  "blg:{appId}:context:{context}:{model}",
    //the Channel of all objects from a context
    7:  "blg:{appId}:context:{context}:users:{user_id}:{model}",
    //the Channel of all objects from a context from an user
    12: "blg:{appId}:{parent_model}:{parent_id}:{model}",            //the
    Channel of all objects belong to a parent
    14: "blg:{appId}:users:{user_id}:{parent_model}:{parent_id}:{model}",//the
    Channel of all comments from event 1 from user 16
    20: "blg:{appId}:{model}:{id}",                            //the
    Channel of one item
    */

    var key = 'blg:'+API.appId;
    if (!options.channel.id && options.channel.context) {
      key += ':context:'+options.channel.context;
    }
    if (options.channel.parent) {
      key += ':' + options.channel.parent.model + ':' + options.channel.parent.id;
    }
    if (options.channel.user) {
      key += ':users:'+options.channel.user;
    }
    key += ':'+options.channel.model;
    if (options.channel.id) {
      key += ':'+options.channel.id;
    }
    if(options.filters) {
      key += ':filter:'+(btoa(JSON.stringify(options.filters)).toString('base64'));
    }
    
    return key;
  };

  this.remove = function (subscriptionOptions) {
    var subscriptionKey = self.subscriptionKeyForOptions(subscriptionOptions);
    delete self.objects[subscriptionKey];
    delete self.options[subscriptionKey];
    delete self.callbacks[subscriptionKey];
    delete events[subscriptionKey];
    lastObjects = JSON.parse(JSON.stringify(self.objects));
  }

  this.add = function (subscriptionOptions, objects, event, addCallback, removeCallback, updateCallback) {
    function timerFunction() {
      if (processingPatch || updateRunning) {
        return;
      }
      var totalDiff = jsondiffpatch.diff(lastObjects, self.objects);
      if (totalDiff !== undefined) {
        lastObjects = JSON.parse(JSON.stringify(self.objects));
        log.debug('Found diff: ' + JSON.stringify(totalDiff));
        for (var subKey in totalDiff) {
          var root = lastObjects[subKey];
          var diff = totalDiff[subKey];
          var options = self.options[subKey];
          var callbacks = self.callbacks[subKey];
          var diffKeys = Object.keys(diff);
          for (var i=0; i<diffKeys.length; i++) {
            var key = diffKeys[i];
            if (key !== '_t') {
              var obj = diff[key];

              if (Array.isArray(obj)) {
                if (obj.length === 1) {
                  callbacks.add(root[key]);
                  delete root[key];
                  delete self.objects[subKey][key];
                  log.debug('Adding object to ' + subKey + ' channel');
                } else if (obj.length === 3) {
                  callbacks.remove(key);
                  log.debug('Removing object from ' + subKey + ' channel');
                }
              } else {
                var objKeys = Object.keys(obj);
                var patch = [];

                for (var j=0; j<objKeys.length; j++) {
                  var objKey = objKeys[j];
                  var delta = obj[objKey];
                  if (typeof delta === 'object') {
                    patch.push({'op': 'replace', 'path': options.channel.model + '/' + key + '/' + objKey, 'value': root[key][objKey]});
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

                callbacks.update(key, patch);
                log.debug('Sending patch to object ' + key + ' on ' + options.channel.model + ' channel: ' + JSON.stringify(patch));
              }
            }
          }
        }
      }
    }

    var subscriptionKey = self.subscriptionKeyForOptions(subscriptionOptions);
    self.objects[subscriptionKey] = objects;
    self.options[subscriptionKey] = subscriptionOptions;
    self.callbacks[subscriptionKey] = {
      add: addCallback,
      remove: removeCallback,
      update: updateCallback
    }
    events[subscriptionKey] = event;
    //lastObjects = JSON.parse(JSON.stringify(self.objects));
    timerFunction();

    if (timer === null) {
      timer = setInterval(timerFunction, self.timerInterval);
    }
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
  this.processMessage = function (message) {
    function process(operation) {
      var oldValue;
      if (self.objects.hasOwnProperty(operation.subscription)) {
        var root = self.objects[operation.subscription];
        var lastRoot = lastObjects[operation.subscription];
        var event = events[operation.subscription];
        if (operation.hasOwnProperty('path')) {
          var pathComponents = operation.path.split('/');
          if (operation.hasOwnProperty('op')) {
            if (operation.op === 'replace') {
              if (!root.hasOwnProperty(pathComponents[1])) {
                event.emit('error', error('Object id doesn\'t exist ' + operation));
              } else if (operation.hasOwnProperty('value')) {
                var parent = root[pathComponents[1]];
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
    }

    processingPatch = true;
    log.debug('Received update: ' + JSON.stringify(message));
    var i, operation;
    for (i=0; i<message.data.new.length; i++) {
      operation = message.data.new[i];
      process(operation);
    }
    for (i=0; i<message.data.updated.length; i++) {
      operation = message.data.updated[i];
      process(operation);
    }
    for (i=0; i<message.data.deleted.length; i++) {
      operation = message.data.deleted[i];
      process(operation);
    }
    
    processingPatch = false;
  };
};

module.exports = Monitor;
