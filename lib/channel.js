var Channel = function (api, context, channel) {
  this.api = api;
  this.context = context;
  this.channel = channel;

  api.call('object/subscribe',
    {
      context: context,
      model: channel
    },
    function (err, data) {
      if (err) {

      } else {
        console.log(data);
      }
    });
}

module.exports = Channel;