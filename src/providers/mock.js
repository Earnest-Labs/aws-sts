'use strict';

const Mock = {
  /**
   * Name of the provider
   */
  name: 'Mock',

  /**
   * Login method used to generate a valid SAML assertion
   * @param idpEntryUrl URL to start the login process
   * @param username Username at the SSO provider
   * @param password Password for the SSO provider
   * @returns Base64 encoded SAML assertion from the SSO provider
   */
  login: function *(idpEntryUrl, username, password) {
    // ... authenticate
    return 'base 64 encoded SAML assertion';
  }
};

module.exports = Mock;
