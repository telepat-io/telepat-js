import olog from 'loglevel';

var originalFactory = olog.methodFactory;

olog.methodFactory = function (methodName, logLevel) {
  var rawMethod = originalFactory(methodName, logLevel);

  return function (message) {
    rawMethod('Telepat: ' + message);
  };
};
olog.setLevel('warn');

export default olog;
