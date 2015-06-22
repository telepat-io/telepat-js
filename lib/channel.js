var EventObject = require('./event');
var jsondiffpatch = require('jsondiffpatch').create({
  objectHash: function(obj) {
    return obj._id || obj.id;
  }
});

var Channel = function (api, log, error, context, channel) {
  var api = api;
  var error = error;
  var context = context;
  var channel = channel;
  var log = log;
  var event = new EventObject(log);
  var self = this;
  var timer;
  var lastObjects;
  var processingPatch = false;
  jsondiffpatch.processor.pipes.diff.before('objects', objectPropertyTrimFilter);

  function trimObject(obj) {
    trimmedObject = {};
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

  this.objects = {};

  this.subscribe = function() {
    api.call('object/subscribe',
    {
      'channel': {
        'context': context,
        'model': channel
      }
    },
    function (err, res) {
      if (err) {
        event.emit('error', error('Subscribe failed with error: ' + err));
      } else {
        self.objects = res.body.message;
        var objectKeys = Object.keys(self.objects);
        for (var i=0; i<objectKeys.length; i++) {
          self.objects[objectKeys[i]].$$event = new EventObject(log);
        }
        lastObjects = JSON.parse(JSON.stringify(self.objects));
        event.emit('subscribe');
        timer = setInterval(function () {
          if (self.processingPatch)
            return;
          var diff = jsondiffpatch.diff(lastObjects, self.objects);
          if (diff !== undefined) {
            log.debug('Found diff: ' + JSON.stringify(diff));
            var diffKeys = Object.keys(diff);
            for (var i=0; i<diffKeys.length; i++) {
              var key = diffKeys[i];
              var obj = diff[key];

              if (Array.isArray(obj)) {
                if (obj.length == 1) {
                  self.add(self.objects[key]);
                  delete self.objects[key];
                  log.debug('Adding object to ' + channel + ' channel');
                } else if (obj.length == 3) {
                  self.remove(key);
                  log.debug('Removing object from ' + channel + ' channel');
                }
              } else {
                var objKeys = Object.keys(obj);
                var patch = [];

                for (var j=0; j<objKeys.length; j++) {
                  var objKey = objKeys[j];
                  var delta = obj[objKey];
                  if (delta.length == 1) {
                    patch.push({'op': 'replace', 'path': channel + '/' + key + '/' + objKey, 'value': delta[0]});
                    log.debug('Added ' + objKey + ' property to object ' + key + ', ' + channel + ' channel');
                  } else if (delta.length == 2) {
                    patch.push({'op': 'replace', 'path': channel + '/' + key + '/' + objKey, 'value': delta[1]});
                    log.debug('Modified ' + objKey + ' property on object ' + key + ', ' + channel + ' channel');
                  } else if (delta.length == 3) {
                    log.info('Removing object properties is not supported in this version. Try setting to an empty value instead.');
                  }
                }

                self.update(key, patch);
                log.debug('Sending patch to object ' + key + ' on ' + channel + ' channel: ' + JSON.stringify(patch));
              }
            }
            lastObjects = JSON.parse(JSON.stringify(self.objects));
          }
        }, 100);
      }
    });
  }

  this.unsubscribe = function() {
    api.call('object/unsubscribe',
      {
        channel: {
          context: context,
          model: channel
        }
      },
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
  }

  this.add = function(object) {
    api.call('object/create',
      {
        model: channel,
        context: context,
        content: object
      },
      function (err, res) {
        if (err) {
          event.emit('error', error('Adding object failed with error: ' + err));
        } else {
        }
      });
  }

  this.remove = function(id) {
    api.call('object/delete',
      {
        model: channel,
        context: context,
        id: id
      },
      function (err, res) {
        if (err) {
          event.emit('error', error('Removing object failed with error: ' + err));
        } else {
        }
      });
  }

  this.update = function(id, patch) {
    api.call('object/update',
      {
        model: channel,
        context: context,
        id: id,
        patch: patch
      },
      function (err, res) {
        if (err) {
          event.emit('error', error('Updating object failed with error: ' + err));
        } else {
        }
      });
  }

  this.processPatch = function (operation) {
    this.processingPatch = true;
    if (operation.hasOwnProperty('path')) {
      var pathComponents = operation.path.split('/');
      if (operation.hasOwnProperty('op')) {
        if (operation.op == 'replace') {
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
        } else if (operation.op == 'delete') {
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
  }

  this.on = function(name, callback) {
    return event.on(name, callback);
  }
}

module.exports = Channel;