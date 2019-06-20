'use strict';
const AWS = require('aws-sdk');
const clui = require('clui');

class TokenGetter {
  constructor(config, samlAssertion, account, role) {
    this.spinner = new clui.Spinner('Getting token...');
    this.sts = new AWS.STS({region: config.region});
    this.samlAssertion = samlAssertion;
    this.role = role;
    this.account = account;
    this.defaultAccount = config.defaultAccount;
    this.accountNumber = this.account.accountNumber;
  }

  async getToken() {
    try {
      this.spinner.start();
      const token = await this.getSTSToken();

      if (this.isDefaultAccount()) {
        this.spinner.stop();
        return token;
      }

      // need to switch roles to the other account
      const assumedToken = await this.getAssumeRoleToken(token);
      this.spinner.stop();
      return assumedToken;
    } catch (e) {
      console.log(e.stack); // eslint-disable-line no-console
      throw new Error('error getting token: ' + e.message);
    }
  }

  isDefaultAccount() {
    return this.account.name === this.defaultAccount;
  }

  async getSTSToken() {
    const request = this.sts.assumeRoleWithSAML({
      PrincipalArn: this.role.principalArn,
      RoleArn: this.role.roleArn,
      SAMLAssertion: this.samlAssertion
    });
    return await request.promise();
  }

  async getAssumeRoleToken(originalToken) {
    this.sts.config.credentials = new AWS.Credentials(
      originalToken.Credentials.AccessKeyId,
      originalToken.Credentials.SecretAccessKey,
      originalToken.Credentials.SessionToken);
    const roleArn = this.role.roleArn.replace(/::(\d+)/, `::${this.accountNumber}`);
    const splitArn = originalToken.AssumedRoleUser.Arn.split('/');

    return await this.sts.assumeRole({
      RoleArn: roleArn,
      RoleSessionName: splitArn[splitArn.length - 1]
    }).promise();
  }
}

function *getToken(config, samlAssertion, account, role) {
  return new TokenGetter(config, samlAssertion, account, role).getToken();
}

module.exports = getToken;
