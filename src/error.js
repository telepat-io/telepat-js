import log from './logger';

export default function error(string) {
  log.error(string);
  return new Error(string);
};
