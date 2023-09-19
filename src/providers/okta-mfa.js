'use strict';

const clui = require('clui');
const OktaHelpers = require('./okta-helpers');

const GoogleAuthenticator = {
  name: "GoogleAuthenticator",
  detect: function *(nightmare) {
    return yield nightmare.visible('.mfa-verify-totp');
  },

  prompt: function *(ci) {
    return yield ci.prompt({
      type: 'input',
      message: 'Google Authenticator code:'
    });
  },

  verify: function *(mfaPrompt, nightmare) {
    const spinner = new clui.Spinner('Verifying MFA...');
    spinner.start();

    yield nightmare
      .visible('.mfa-verify-totp')
      .wait(300)
      .type('input[name="answer"]', mfaPrompt)
      .wait(1000)
      .click('input[type="submit"]')
      .wait(OktaHelpers.waitAndEmitSAMLResponse);
    spinner.stop();

    const hasError = yield nightmare
      .exists('.o-form-has-errors');

    if (hasError) {
      let errMsg = yield nightmare.evaluate(function () {
        return document.querySelector('.o-form-has-errors').innerText;
      });
      throw new Error(errMsg);
    }
  }
};

const OktaVerify = {
  name: "OktaVerify",

  detect: function *(nightmare) {
    return yield nightmare
      .wait(500)
      .visible('.mfa-verify-push');
  },

  prompt: function *() {
    // None needed - will send a push
  },

  verify: function *(mfaPrompt, nightmare) {
    const spinner = new clui.Spinner('Sending Okta Verify push notification...');
    spinner.start();

    yield nightmare
      .click('.mfa-verify-push input[type="submit"]')
      .wait(OktaHelpers.waitAndEmitSAMLResponse);
    spinner.stop();

    const hasError = yield nightmare
      .exists('.o-form-has-errors');

    if (hasError) {
      let errMsg = yield nightmare.evaluate(function () {
        return document.querySelector('.o-form-has-errors').innerText;
      });
      throw new Error(errMsg);
    }
  }
};

module.exports = [GoogleAuthenticator, OktaVerify];
