var request = require('superagent');
var SHA256 = require("crypto-js/sha256");

var API = {
  apiEndpoint: null,
  apiKey: null,
  appId: null,
  UDID: null,
  authenticationToken: null
}

API.call = function (endpoint, data, callback, method) {
  if (!this.apiEndpoint || !this.apiKey || !this.appId)
    return callback(null, null);

  var req;

  if (method == 'get')
    req = request.get(this.apiEndpoint + endpoint);
  else 
    req = request.post(this.apiEndpoint + endpoint);

  req.send(data)
    .set('X-BLGREQ-SIGN', SHA256(this.apiKey))
    .set('X-BLGREQ-APPID', this.appId)
    .set('X-BLGREQ-UDID', this.UDID || '');
  
  if (this.authenticationToken)
    req.set('Authorization', 'Bearer ' + this.authenticationToken);

  req.end(function (err, res) {
      if (this.authenticationToken && res.status == 401) {

      }
      else {
        callback(err, res);
      }
    });
}

API.get = function (endpoint, data, callback) {
  return this.call(endpoint, data, callback, 'get');
}

module.exports = API;