'use strict';

const clui = require('clui');

const GoogleAuthenticator = {
  detect: function *(nightmare) {
    return yield nightmare.visible('.google-auth-180');
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
      .type('input[name="passcode"]', mfaPrompt)
      .click('#verify_factor')
      .wait('#oktaSoftTokenAttempt\\.passcode\\.error:not(:empty), input[name="SAMLResponse"]');

    spinner.stop();

    const hasError = yield nightmare
      .exists('#oktaSoftTokenAttempt\\.passcode\\.error:not(:empty)');

    if (hasError) {
      let errMsg = yield nightmare.evaluate(function () {
        return document.querySelector('#oktaSoftTokenAttempt\\.edit\\.errors').innerText;
      });
      throw new Error(errMsg);
    }
  }
};

const OktaVerify = {
  detect: function *(nightmare) {
    return yield nightmare.visible('input[value="Send Push"]');
  },

  prompt: function *() {
    // None needed - will send a push
  },

  verify: function *(mfaPrompt, nightmare) {
    const spinner = new clui.Spinner('Sending Okta Verify push notification...');
    spinner.start();

    yield nightmare
      .click('input[value="Send Push"]');
      //.wait('#oktaSoftTokenAttempt\\.passcode\\.error:not(:empty), input[name="SAMLResponse"]');

    spinner.stop();

    const hasError = yield nightmare
      .exists('#oktaSoftTokenAttempt\\.passcode\\.error:not(:empty)');

    if (hasError) {
      let errMsg = yield nightmare.evaluate(function () {
        return document.querySelector('#oktaSoftTokenAttempt\\.edit\\.errors').innerText;
      });
      throw new Error(errMsg);
    }
  }
};

module.exports = [GoogleAuthenticator, OktaVerify];
