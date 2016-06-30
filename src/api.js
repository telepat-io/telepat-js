import request from 'superagent';
import SHA256 from 'crypto-js/sha256';

var API = {
  apiEndpoint: null,
  apiKey: null,
  appId: null,
  UDID: null,
  authenticationToken: null
};

API.call = function (endpoint, data, callback, method) {
  if (!this.apiEndpoint || !this.apiKey || !this.appId) {
    return callback(null, null);
  }
  var req;

  if (method === 'get') {
    req = request.get(this.apiEndpoint + endpoint + '?' + data);
  } else if (method === 'delete') {
    req = request.del(this.apiEndpoint + endpoint);
  } else {
    req = request.post(this.apiEndpoint + endpoint);
  }

  if (method !== 'get') {
    req.send(data);
  }

  req.set('Content-Type', 'application/json')
    .set('X-BLGREQ-SIGN', SHA256(this.apiKey))
    .set('X-BLGREQ-APPID', this.appId)
    .set('X-BLGREQ-UDID', this.UDID || 'TP_EMPTY_UDID');

  if (this.authenticationToken) {
    req.set('Authorization', 'Bearer ' + this.authenticationToken);
  }

  req.end((err, res) => {
    if (this.authenticationToken && (res.status === 401 || (res.status === 400 && res.body.code === '040') || (res.status === 500 && res.body.code === '002'))) {
      this.get('user/refresh_token', '', function (err, res) {
        if (err) {
          callback(err, null);
        } else {
          this.authenticationToken = res.body.content;
          this.call(endpoint, data, callback, method);
        }
      });
    } else {
      callback(err, res);
    }
  });
};

API.get = function (endpoint, data, callback) {
  return this.call(endpoint, data, callback, 'get');
};

API.del = function (endpoint, data, callback) {
  return this.call(endpoint, data, callback, 'delete');
};

export default API;
