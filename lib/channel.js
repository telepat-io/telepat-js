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
        lastObjects = JSON.parse(JSON.stringify(self.objects));
        event.emit('update');
        timer = setInterval(function () {
          var diff = jsondiffpatch.diff(lastObjects, self.objects);
          if (diff !== undefined) {
            var diffKeys = Object.keys(diff);
            for (var i=0; i<diffKeys.length; i++) {
              if (diff[diffKeys[i]].length == 1) {
                self.add(self.objects[diffKeys[i]]);
                delete self.objects[diffKeys[i]];
              } else if (diff[diffKeys[i]].length == 2) {
                // update
              } else if (diff[diffKeys[i]].length == 3) {
                // delete
              }
            }
          }
          lastObjects = JSON.parse(JSON.stringify(self.objects));
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

  this.on = function(name, callback) {
    return event.on(name, callback);
  }
}

module.exports = Channel;