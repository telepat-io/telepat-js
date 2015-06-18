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

  this.objects = {};

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
        lastObjects = JSON.parse(JSON.stringify(self.objects));
        event.emit('subscribe');
        timer = setInterval(function () {
          var diff = jsondiffpatch.diff(lastObjects, self.objects);
          if (diff !== undefined) {
            console.log(diff);
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
                    patch.push({'op': 'add', 'path': channel + '/' + key + '/' + objKey, 'value': delta[0]});
                    log.debug('Added ' + objKey + ' property to object ' + key + ', ' + channel + ' channel');
                  } else if (delta.length == 2) {
                    patch.push({'op': 'replace', 'path': channel + '/' + key + '/' + objKey, 'value': delta[1]});
                    log.debug('Modified ' + objKey + ' property on object ' + key + ', ' + channel + ' channel');
                  } else if (delta.length == 3) {
                    patch.push({'op': 'remove', 'path': channel + '/' + key + '/' + objKey});
                    log.debug('Removed ' + objKey + ' property from object ' + key + ', ' + channel + ' channel');
                  }
                }

                //self.update(key, patch);
                log.debug('Sending patch to object ' + key + ' on ' + channel + ' channel: ' + JSON.stringify(patch));
              }
            }
            lastObjects = JSON.parse(JSON.stringify(self.objects));
          }
        }, 50);
      }
    });

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
          //event.emit('update');
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
          //event.emit('update');
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
          //event.emit('update');
        }
      });
  }

  this.processPatch = function (patch) {
    function findParent(pathComponents) {
      var parentObject = this.objects;
      for (var j=0; j<(pathComponents-1); j++) {
        if (parentObject.hasOwnProperty(pathComponents[j])) {
          parentObject = parentObject[pathComponents[j]]
        }
        else {
          return false;
        }
      }
      return parentObject;
    }

    for (var i=0; i<patch.length; i++) {
      var operation = patch[i];
      var path = operation['path'];
      var value = operation['value'];
      var pathComponents = path.split("/");
      var lastPathComponent = pathComponents[pathComponents.length - 1];
      var parentObject = findParent(pathComponents);
      if (parentObject) {
        if (operation['op'] == 'add') {
          if (parentObject.hasOwnProperty(lastPathComponent)) {
            event.emit('error', error('Error in add operation: existing property ' + path));
          } else {
            parentObject[lastPathComponent] = value;
            log.debug('Added ' + path + ' property with value ' + value);
          }
        } else if (operation['op'] == 'remove') {
          if (parentObject.hasOwnProperty(lastPathComponent)) {
            delete parentObject[lastPathComponent];
            log.debug('Removed ' + path + ' property');
          } else {
            event.emit('error', error('Error in remove operation: non-existing property ' + path));
          }
        } else if (operation['op'] == 'replace') {
          if (parentObject.hasOwnProperty(lastPathComponent)) {
            parentObject[lastPathComponent] = value;
            log.debug('Replaced ' + path + ' property with value ' + value);
          } else {
            event.emit('error', error('Error in replace operation: non-existing property ' + path));
          }
        }
      } else {
        event.emit('error', error('Error in operation: path not found ' + path));
      }
    }
  }

  this.on = function(name, callback) {
    return event.on(name, callback);
  }
}

module.exports = Channel;