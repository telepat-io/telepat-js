import request from 'superagent';
import SHA256 from 'crypto-js/sha256';

var API = {
  apiEndpoint: null,
  apiKey: null,
  appId: null,
  UDID: null,
  authenticationToken: null,
  tokenUpdateCallback: (newToken) => {}
};

API.call = function (endpoint, data, callback = () => {}, method) {
  if (!this.apiEndpoint) {
    return callback(new Error('No API endpoint set - run Telepat.configure or Telepat.connect first'), null);
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
    if (this.needsTokenUpdate(res)) {
      this.updateToken((error, result) => {
        if (error) {
          callback(error, null);
        } else {
          this.call(endpoint, data, callback, method);
        }
      });
    } else {
      callback(err, res);
    }
  });
};

API.needsTokenUpdate = function (response) {
  return (this.authenticationToken && (response.status === 401 || (response.status === 400 && response.body.code === '040') || (response.status === 500 && response.body.code === '002')));
};

API.updateToken = function (callback) {
  this.get('user/refresh_token', '', (err, res) => {
    if (err) {
      callback(err, null);
    } else {
      this.authenticationToken = res.body.content.token;
      this.tokenUpdateCallback(this.authenticationToken);
      callback(null, res);
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
