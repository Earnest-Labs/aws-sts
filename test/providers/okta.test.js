'use strict';

const assert = require('assert');
const Okta = require('../../src/providers/okta');

describe('Okta Provider', function () {
  it('should conform to provider interface', function () {
    assert.hasOwnProperty('name', Okta);

    assert.equal(Okta.name, 'Okta');
  });
});
