'use strict';

/* eslint no-console: 0 */

const ArgumentParser  = require('argparse').ArgumentParser;
const pkg = require('../package.json');
const co = require('co');
const coinquirer = require('coinquirer');
const xml2js = require('xml2js');
const thunkify = require('thunkify');
const mkdirp = require('mkdirp');
const os = require('os');
const fs = require('fs');
const ini = require('ini');
const path = require('path');
const getToken = require('./token-getter');
require('colors');

const config = require('../cfg/config');
const arnRegExp = /^arn:aws:iam::(\d+):([^\/]+)\/(.+)$/;

co(function *() {
  console.log('Earnest AWS Token Generator\n'.green.bold);
  const provider = require(`./providers/${config.provider}`);
  const args = parseArgs(provider.name);
  const account = getSelectedAccount(config, args);

  const samlAssertion = yield provider.login(config.idpEntryUrl, args.username, args.password);
  const role = yield selectRole(samlAssertion, args.role);
  const token = yield getToken(config, samlAssertion, account, role);
  const profileName = buildProfileName(role, account.name, args.profile);
  yield writeTokenToConfig(token, profileName);

  console.log('\n\n----------------------------------------------------------------');
  console.log('Your new access key pair has been stored in the AWS configuration file ' +
    '~%s'.green.bold + ' under the ' + '%s'.green.bold +
    ' profile.', config.awsConfigPath, profileName);
  console.log('Note that it will expire at ' + '%s'.yellow.bold + '.',
    token.Credentials.Expiration);
  console.log('After this time, you may safely rerun this script to refresh your access key pair.');
  console.log('To use this credential, call the AWS CLI with the --profile option (e.g. ' +
    'aws --profile %s ec2 describe-instances'.italic.grey + ').', profileName);
  console.log('----------------------------------------------------------------\n\n');
})
  .catch(function (err) {
    if (err instanceof Error) {
      console.error(err.message);
      console.error(err.stack);
    } else {
      console.error(err);
    }
    process.exit(-1);
  });


function parseArgs(providerName) {
  let parser = new ArgumentParser({
    addHelp: true,
    description: pkg.description,
    version: pkg.version
  });
  parser.addArgument(['--username'], {
    help: `${providerName} username (ex. user@domain.com)`
  });
  parser.addArgument(['--password'], {
    help: `${providerName} password`
  });
  parser.addArgument(['--role'], {
    help: 'Name of SAML role to assume'
  });
  parser.addArgument(['--account'], {
    defaultValue: config.defaultAccount,
    help: 'Name of account to switch to. Defaults to "' + config.defaultAccount + '".',
    choices: config.accounts
  });
  parser.addArgument(['--profile'], {
    help: 'Profile name that the AWS credentials should be saved as. ' +
    'Defaults to the name of the account specified.'
  });
  return parser.parseArgs();
}

function getSelectedAccount(config, args) {
  let accountNumber = config.accounts[args.account];
  return {accountNumber, name: args.account};
}

function *selectRole(samlAssertion, roleName) {
  let buf = new Buffer(samlAssertion, 'base64');
  let saml = yield thunkify(xml2js.parseString)(
    buf,
    {tagNameProcessors: [xml2js.processors.stripPrefix], xmlns: true});

  // Extract SAML roles
  let roles;
  let attributes = saml.Response.Assertion[0].AttributeStatement[0].Attribute;
  for (let attribute of attributes) {
    if (attribute.$.Name.value === 'https://aws.amazon.com/SAML/Attributes/Role') {
      roles = attribute.AttributeValue.map(function (role) {
        return parseRoleAttributeValue(role._);
      });
    }
  }

  if (!roles || roles.length <= 0) {
    throw new Error('No roles are assigned to your SAML account. Please contact Ops.');
  }

  let accountIds = [];
  roles.forEach(function (role) {
    if (accountIds.indexOf(role.accountId) === -1) {
      accountIds.push(role.accountId);
    }
  });
  let multipleAccounts = accountIds.length > 1;

  // Set the default role if one was passed
  let role = roles.find(r => r.name === roleName);
  if (!role) {
    role = roles[0]; // Couldn't find that role, default to the first one
  }

  if (roles.length > 1 && !roleName) {
    let ci = new coinquirer();
    role = yield ci.prompt({
      type: 'list',
      message: 'Please select a role:',
      choices: roles.map(r => {
        let name = r.name;
        if (multipleAccounts) {
          name += ' (' + r.accountId + ')';
        }

        return {
          name: name,
          value: r
        };
      })
    });
  }

  return role;
}

function parseRoleAttributeValue(attributeValue) {
  let arns = attributeValue.split(',').map(function (arn) {
    let match = arnRegExp.exec(arn);
    if (!match) {
      throw new Error('Unable to parse role ARN: ' + arn);
    }

    return {
      arn: arn,
      accountId: match[1],
      type: match[2],
      value: match[3]
    };
  });

  let provider = arns.find(arn => arn.type === 'saml-provider');
  let role = arns.find(arn => arn.type === 'role');

  return {
    name: role.value,
    accountId: role.accountId,
    roleArn: role.arn,
    principalArn: provider.arn
  };
}

function *writeTokenToConfig(token, label) {
  let configFile = path.join(os.homedir(), config.awsConfigPath);
  yield thunkify(mkdirp)(path.dirname(configFile));

  try {
    fs.accessSync(configFile);
  } catch (err) {
    fs.writeFileSync(configFile, '');
  }

  const iniCfg = ini.parse(fs.readFileSync(configFile).toString());

  if (!iniCfg.hasOwnProperty(label)) {
    iniCfg[label] = {};
  }

  iniCfg[label].output = config.outputFormat;
  iniCfg[label].region = config.region;
  iniCfg[label].aws_access_key_id = token.Credentials.AccessKeyId;
  iniCfg[label].aws_secret_access_key = token.Credentials.SecretAccessKey;
  iniCfg[label].aws_session_token = token.Credentials.SessionToken;
  iniCfg[label].aws_security_token = token.Credentials.SessionToken;

  fs.writeFileSync(configFile, ini.encode(iniCfg));
}

function buildProfileName(role, accountName, overrideName) {
  if (overrideName) { return overrideName; }

  return `${accountName}-${role.name}`;
}
