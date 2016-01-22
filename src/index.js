'use strict';

const ArgumentParser  = require('argparse').ArgumentParser;
const pkg = require('../package.json');
const co = require('co');
const coinquirer = require('coinquirer');
const xml2js = require('xml2js');
const thunkify = require('thunkify');
const AWS = require('aws-sdk');
const mkdirp = require('mkdirp');
const os = require('os');
const fs = require('fs');
const ini = require('ini');
const path = require('path');
const clui = require('clui');
require('colors');

const config = require('../cfg/config');


co(function *() {
  console.log('Earnest AWS Token Generator\n'.green.bold);
  let provider = require(`./providers/${config.provider}`);

  let args = parseArgs(provider.name);
  let samlAssertion = yield provider.login(config.idpEntryUrl, args.username, args.password);
  let role = yield selectRole(samlAssertion, args.role);
  let token = yield getToken(samlAssertion, args.account, role);
  let profileName = buildProfileName(role, args.account, args.profile);
  yield writeTokenToConfig(token, profileName);

  console.log('\n\n----------------------------------------------------------------');
  console.log('Your new access key pair has been stored in the AWS configuration file ' + '~%s'.green.bold + ' under the ' + '%s'.green.bold + ' profile.', config.awsConfigPath, profileName);
  console.log('Note that it will expire at ' + '%s'.yellow.bold + '.', token.Credentials.Expiration);
  console.log('After this time, you may safely rerun this script to refresh your access key pair.');
  console.log('To use this credential, call the AWS CLI with the --profile option (e.g. ' + 'aws --profile %s ec2 describe-instances'.italic.grey + ').', profileName);
  console.log('----------------------------------------------------------------\n\n');
})
  .catch(function(err) {
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
    help: 'Profile name that the AWS credentials should be saved as. Defaults to the name of the account specified.'
  });
  return parser.parseArgs();
}

function *selectRole(samlAssertion, roleName) {
  let buf = new Buffer(samlAssertion, 'base64');
  let saml = yield thunkify(xml2js.parseString)(buf);

  // Extract SAML roles
  let roles;
  let attributes = saml['saml2p:Response']['saml2:Assertion'][0]['saml2:AttributeStatement'][0]['saml2:Attribute'];
  for (let attribute of attributes) {
    if (attribute['$']['Name'] === 'https://aws.amazon.com/SAML/Attributes/Role') {
      roles = attribute['saml2:AttributeValue'].map(function(role) {
        return role['_'];
      });
    }
  }

  if (!roles || roles.length <= 0) {
    throw new Error('No roles are assigned to your SAML account. Please contact Ops.')
  }

  // Set the default role if one was passed
  let role = roles.find(r => r.split(',')[1].split('/')[1] === roleName);
  if (!role) {
    role = roles[0]; // Couldn't find that role, default to the first one
  }

  if (roles.length > 1 && !roleName) {
    let ci = new coinquirer();
    role = yield ci.prompt({
      type: 'list',
      message: 'Please select a role:',
      choices: roles.map(r => {
        return {
          name: r.split(',')[1].split('/')[1],
          value: r
        }
      })
    });
  }

  return role;
}

function *getToken(samlAssertion, account, role) {
  let spinner = new clui.Spinner('Getting token...');
  let principalArn = role.split(',')[0];
  let roleArn = role.split(',')[1];

  return new Promise(function(resolve, reject) {
    spinner.start();
    let sts = new AWS.STS({region: config.region});
    sts.assumeRoleWithSAML({
      PrincipalArn: principalArn,
      RoleArn: roleArn,
      SAMLAssertion: samlAssertion
    }, function(err, token) {
      if (err) { return reject(err); }

      if (account === config.defaultAccount) {
        spinner.stop();
        return resolve(token);
      } else {
        sts.config.credentials = new AWS.Credentials(token.Credentials.AccessKeyId, token.Credentials.SecretAccessKey,token.Credentials.SessionToken);
        roleArn = roleArn.replace(/::(\d+)/, `::${config.accounts[account]}`);

        // Need to switch roles to the other account
        sts.assumeRole({
          RoleArn: roleArn,
          RoleSessionName: token.AssumedRoleUser.Arn.split('/')[token.AssumedRoleUser.Arn.split('/').length - 1]
        }, function(err, assumedToken) {
          if (err) { return reject(err); }

          spinner.stop();
          return resolve(assumedToken);
        });
      }
    });
  });
}

function *writeTokenToConfig(token, label) {
  let configFile = path.join(os.homedir(), config.awsConfigPath);
  yield thunkify(mkdirp)(path.dirname(configFile));

  try {
    fs.accessSync(configFile);
  } catch(err) {
    fs.writeFileSync(configFile, '');
  }

  var iniCfg = ini.parse(fs.readFileSync(configFile).toString());

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

function buildProfileName(role, account, overrideName) {
  if (overrideName) { return overrideName; }

  let roleArn = role.split(',')[1];
  let roleName = roleArn.split('/').pop().toLowerCase();
  return `${account}-${roleName}`;
}
