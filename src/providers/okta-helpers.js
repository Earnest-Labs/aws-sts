const Helpers = {
  waitAndEmitSAMLResponse: function () {
    /* eslint-disable  */

    // Stop waiting if an error was found
    var errEl = document.querySelector('.o-form-has-errors');
    if (errEl) return true;

    // Keep waiting if no error or SAMLResponse detected
    var samlEl = document.querySelector('input[name="SAMLResponse"]');
    if (!samlEl) return false;

    // SAMLResponse found, send it out to Node via console.log
    console.log(JSON.stringify({
      SAMLResponse: samlEl.value
    }));
    return true;
    /* eslint-enable */
  }
};

module.exports = Helpers;
