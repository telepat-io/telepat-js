import chai from 'chai';
import Telepat from '../lib/telepat.js';

chai.expect();

const expect = chai.expect;

var lib;

describe('Given an instance of Telepat', function () {
  before(function () {
    lib = new Telepat();
  });
  describe('when I check for the connect function', function () {
    it('should be present', () => {
      expect(lib.connect).to.not.be.an('undefined');
    });
  });
});
