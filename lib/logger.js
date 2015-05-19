var log = require('loglevel');

var originalFactory = log.methodFactory;
log.methodFactory = function (methodName, logLevel) {
    var rawMethod = originalFactory(methodName, logLevel);
    return function (message) {
        rawMethod('Telepat: ' + message);
    };
};
log.setLevel('warn');

module.exports = log;