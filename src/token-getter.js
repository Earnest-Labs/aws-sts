'use strict';
const { STSClient, AssumeRoleWithSAMLCommand, AssumeRoleCommand  } = require("@aws-sdk/client-sts");
const clui = require('clui');

// Not thread safe!
class TokenGetter {
  constructor(config) {
    this.spinner = new clui.Spinner('Getting token...');
    this.sts = new STSClient({region: config.region});
    this.defaultAccount = config.defaultAccount;
  }

  async getToken(samlAssertion, account, role) {
    this.samlAssertion = samlAssertion;
    this.account = account;
    this.accountNumber = this.account.accountNumber;
    this.role = role;

    try {
      this.spinner.start();
      const token = await this.getSTSToken();

      // if the account has an IDP field we don't care about the default account
      // because we loged in directly to the final account
      if (this.isDefaultAccount() || this.hasAccountIDP()) {
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

  hasAccountIDP() {
    return 'idpEntryUrl' in this.account;
  }

  async getSTSToken() {
    const command = new AssumeRoleWithSAMLCommand({
      PrincipalArn: this.role.principalArn,
      RoleArn: this.role.roleArn,
      SAMLAssertion: this.samlAssertion
    });
    return await this.sts.send(command);
  }

  async getAssumeRoleToken(originalToken) {
    this.sts.config.credentials = {
      accessKeyId: originalToken.Credentials.AccessKeyId,
      secretAccessKey: originalToken.Credentials.SecretAccessKey,
      sessionToken: originalToken.Credentials.SessionToken
    };
    const roleArn = this.role.roleArn.replace(/::(\d+)/, `::${this.accountNumber}`);
    const splitArn = originalToken.AssumedRoleUser.Arn.split('/');

    const command = new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: splitArn[splitArn.length - 1]
    });
    return await this.sts.send(command);
  }
}

module.exports = TokenGetter;
