'use strict';

const ArgumentParser  = require('argparse').ArgumentParser;
const pkg = require('../package.json');
const co = require('co');
const Nightmare = require('nightmare');
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

const config = require('../cfg/config');


co(function *() {
  console.log('Earnest AWS Token Generator\n'.green.bold);

  let args = parseArgs();

  let samlAssertion = yield login(args.username, args.password);
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
    console.error(err.message);
    console.error(err.stack);
    process.exit(-1);
  });


function parseArgs() {
  let parser = new ArgumentParser({
    addHelp: true,
    description: pkg.description,
    version: pkg.version
  });
  parser.addArgument(['--username'], {
    help: 'Okta username (ex. user@domain.com)'
  });
  parser.addArgument(['--password'], {
    help: 'Okta password'
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

function *login(username, password) {
  let spinner = new clui.Spinner('Logging in...');

  let ci = new coinquirer();
  username = username ? username : yield ci.prompt({
    type: 'input',
    message: 'Okta username (ex. user@meetearnest.com):'
  });
  password = password ? password : yield ci.prompt({
    type: 'password',
    message: 'Okta password:'
  });

  spinner.start();
  let nightmare = Nightmare();

  let hasError = yield nightmare
    .useragent(pkg.description + ' v.' + pkg.version)
    .goto(config.idpEntryUrl)
    .type('input[name="username"]', username)
    .type('input[name="password"]', password)
    .click('input[name="login"]')
    .wait('body')
    .exists('#signin-feedback');
  spinner.stop();

  if (hasError) {
    yield logBody(nightmare);
    let errMsg = yield nightmare.evaluate(function() {
      return document.querySelector('#signin-feedback').innerText;
    });
    throw new Error(errMsg);
  }

  // Provide verify code
  let totp = yield ci.prompt({
    type: 'input',
    message: 'Okta verify code:'
  });

  spinner = new clui.Spinner('Verifying...');
  spinner.start();
  hasError = yield nightmare
    .type('input[name="passcode"]', totp)
    .click('#verify_factor')
    .wait(2000) //TODO - Find a better solution here
    .exists('#oktaSoftTokenAttempt\\.edit\\.errors');

  if (hasError) {
    yield logBody(nightmare);

    let errMsg = yield nightmare.evaluate(function() {
      return document.querySelector('#oktaSoftTokenAttempt\\.edit\\.errors').innerText;
    });
    throw new Error(errMsg);
  }

  let samlAssertion = yield nightmare.evaluate(function () {
    return document.querySelector('input[name="SAMLResponse"]').value;
  });

  yield nightmare.end();
  spinner.stop();

  return samlAssertion;
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

  let role;
  if (roleName) {
    role = roles.find(r => r.split(',')[1].split('/')[1] === roleName);
    if (!role) {
      role = roles[0]; // Couldn't find that role, default to the first one
    }
  }

  if (roles.length && !roleName) {
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

  var config = ini.parse(fs.readFileSync(configFile).toString());

  if (!config.hasOwnProperty(label)) {
    config[label] = {};
  }

  config[label].output = config.outputFormat;
  config[label].region = config.region;
  config[label].aws_access_key_id = token.Credentials.AccessKeyId;
  config[label].aws_secret_access_key = token.Credentials.SecretAccessKey;
  config[label].aws_session_token = token.Credentials.SessionToken;

  fs.writeFileSync(configFile, ini.encode(config));
}

function buildProfileName(role, account, overrideName) {
  if (overrideName) { return overrideName; }

  let roleArn = role.split(',')[1];
  let roleName = roleArn.split('/').pop().toLowerCase();
  return `${account}-${roleName}`;
}

function *logBody(nightmare) {
  if (!process.env.DEBUG) { return; }

  let errBody = yield nightmare.evaluate(function () {
    return document.querySelector('body').innerHTML;
  });
  console.log(errBody);
}
