'use strict';

const Nightmare = require('nightmare');
const clui = require('clui');
const coinquirer = require('coinquirer');
const pkg = require('../../package.json');
const path = require('path');
const MfaProviders = require('./okta-mfa');
const OktaHelpers = require('./okta-helpers');

const Okta = {
  name: 'Okta',

  login: function *(idpEntryUrl, username, password, otp) {
    let spinner = new clui.Spinner('Logging in...');

    let ci = new coinquirer();
    username = username ? username : yield ci.prompt({
      type: 'input',
      message: 'Okta username (ex. user@domain.com):'
    });
    password = password ? password : yield ci.prompt({
      type: 'password',
      message: 'Okta password:'
    });

    spinner.start();

    let samlAssertion = undefined;
    let nightmare = Nightmare({
      show: process.env.DEBUG,
      openDevTools: true,
      typeInterval: 5,
      pollInterval: 10,
      waitTimeout: 30 * 1000
    });
    let hasError = yield nightmare
      .on('console', function (type, message) {
        // After authentication, Okta will create an interstitial page with a form including
        // a hidden input with the SAML response data. Javascript then immediately submits the
        // form once the page loads. This means there is limited time to extract the SAML response.
        // Each `wait` call is capable of detecting the SAML response. However, then executing an
        // `evaluate` call takes long enough for the SAML response to no longer be available.
        // So, we need to capture the SAML response in the `wait` call. The easiest mechanism to
        // get data from the browser back to Node is via the console logger. This event handler
        // looks for a log including the SAML response.
        //
        // This event handler is so early in the chain because it must be attached prior to calling
        // `goto`.
        if (type === 'log' && message && message.indexOf('SAMLResponse') >= 0) {
          samlAssertion = JSON.parse(message).SAMLResponse;
        }
      })
      .useragent(pkg.description + ' v.' + pkg.version)
      .goto(idpEntryUrl)
      .visible('.primary-auth-form')
      .wait('input[type="submit"]') // Form is loaded via AJAX
      .wait(300)
      .type('input[name="username"]', username)
      .click('input[type="submit"]') // Submit form
      .wait('.o-form-input-name-password')
      .type('input[name="password"]', password)
      .click('input[type="submit"]') // Submit form
      .wait('.o-form-has-errors, .mfa-verify, #saml_form') // Wait for error or success
      .exists('.o-form-has-errors');
    spinner.stop();

    if (hasError) {
      let errMsg = yield nightmare.evaluate(function () {
        return document.querySelector('.o-form-has-errors').innerText;
      });
      yield fail(nightmare, errMsg);
    }

    for (let i = 0; i < MfaProviders.length; i++) {
      const mfaProvider = MfaProviders[i];
      const good = yield mfaProvider.detect(nightmare);
      if (good) {
        try {
          const prompt = otp ? otp : yield mfaProvider.prompt(ci);
          yield mfaProvider.verify(prompt, nightmare);
        } catch (err) {
          yield fail(nightmare, err.message);
        }
        break;
      }
    }

    if (!samlAssertion) {
      yield nightmare.wait(OktaHelpers.waitAndEmitSAMLResponse);
    }
    yield nightmare.end();
    spinner.stop();

    if (!samlAssertion) {
      throw new Error('SAML Assertion was never found.');
    }
    return samlAssertion;
  }
};

function *fail(nightmare, errMsg) {
  if (process.env.DEBUG) {
    yield nightmare
      .screenshot(path.join(process.cwd(), '.debug', 'error.png'))
      .html(path.join(process.cwd(), '.debug', 'error.html'), 'HTMLComplete');
  }

  throw new Error(errMsg);
}

module.exports = Okta;
