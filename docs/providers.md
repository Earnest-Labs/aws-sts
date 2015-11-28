# SSO Providers

Creating a provider is done by adding a new file in `src/providers` and implementing the expected interface.
In your `cfg/config.js` file update the `provider` key to reference the filename of the new provider.

Authentication is done via form-based authentication as described in the Amazon blog post, 
[How to Implement a General Solution for Federated API CLI Access Using SAML 2.0](http://blogs.aws.amazon.com/security/post/TxU0AVUS9J00FP/How-to-Implement-a-General-Solution-for-Federated-API-CLI-Access-Using-SAML-2-0).

### Example Provider

```
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
```

## Okta

The Okta form-based authentication provider uses [Nightmare]() for headless-browser automation. It can successfully 
authenticate via the Okta login and handles a TOTP multifactor challenge. Other multifactor challenges are not 
currently supported.

To enable debugging, set the `DEBUG` environment variable prior to running:
 
`DEBUG=1 node src/index.js`
