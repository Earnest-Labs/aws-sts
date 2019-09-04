# AWS STS Token Generator2

Single Sign on within AWS removes the ability to generate long-lived access tokens for AWS. Instead, the
[Amazon Security Token Service](http://docs.aws.amazon.com/STS/latest/APIReference/Welcome.html) is used to generate
short-lived tokens.

This command line utility can be used to authenticate with an SSO provider (ex: Okta) and generate access token credentials.
It supports assuming an AWS role and will automatically update your AWS CLI credentials file with the new credentials.

For ease of use, the token generator is packaged as a docker container. Your team will not need to clone this repository
or install anything. Token can be generated via a single `docker run` command. A helper script is also included to encapsulate
the arguments of the docker command.

## Installation

The token generator runs as a docker container which can bind-mount to your AWS credentials file to save temporary credentials.
Installation is as simple as downloading the [`aws-token`](./example/aws-token) script and saving it to your prefered PATH location e.g. `/usr/local/bin/aws-token`. Then execute that file every time
you need a new token.

```
$> aws-token
```

### Bonus: exporting the credentials as ENV vars

```
export AWS_PROFILE=<the generated profile here>
export AWS_ACCESS_KEY_ID=$(aws configure get $AWS_PROFILE.aws_access_key_id)
export AWS_SECRET_ACCESS_KEY=$(aws configure get $AWS_PROFILE.aws_secret_access_key)
export AWS_SESSION_TOKEN=$(aws configure get $AWS_PROFILE.aws_session_token)
export AWS_DEFAULT_REGION=us-east-1
```

## Usage

`````
$> aws-token --help
usage: index.js [-h] [-v] [--username USERNAME] [--password PASSWORD]
                [--role ROLE]
                [--account {staging,development}]
                [--profile PROFILE]


AWS STS Token Generator

Optional arguments:
  -h, --help            Show this help message and exit.
  -v, --version         Show program's version number and exit.
  --username USERNAME   Okta username (ex. user@domain.com)
  --password PASSWORD   Okta password
  --role ROLE           Name of SAML role to assume
  --account {staging,development}
                        Name of account to switch to. Defaults to "staging".
  --profile PROFILE     Profile name that the AWS credentials should be saved
                        as. Defaults to the name of the account specified.
`````

![Image of Generator in Action](https://raw.githubusercontent.com/meetearnest/aws-sts/master/docs/aws-sts-token-generator.gif)

## How it Works

The process of authenticating with Okta (and many SAML SSO providers) is only possible via form-based authentication.
We're using headless browser automation to emulate a form-based sign-on. This is similar to the [solution proposed by Amazon](https://blogs.aws.amazon.com/security/post/Tx1LDN0UBGJJ26Q/How-to-Implement-Federated-API-and-CLI-Access-Using-SAML-2-0-and-AD-FS).

 1. Prompt user for SSO-provider username and password
 2. Use a headless browser to navigate to the login page and submit the credentials
 3. Prompt for a TOTP token
 4. Use the headless browser to submit the TOTP token
 5. Parse the response from Amazon to extract the SAML assertion
 6. Present accessible roles to the user (if more than one) and allow them to select the role to assume
 7. Use the STS API to [assume the role](http://docs.aws.amazon.com/cli/latest/reference/sts/assume-role-with-saml.html)
 8. Save the token information to the [AWS credentials file](https://blogs.aws.amazon.com/security/post/Tx3D6U6WSFGOK2H/A-New-and-Standardized-Way-to-Manage-Credentials-in-the-AWS-SDKs)


## Setting up the AWS Token Generator for your Organization

We recommend the following steps for use in your organization, see `example`:

1. Create a fresh git repository/dir
2. Copy [`config.example.json`](./cfg/config.example.json) to the root of your repository/dir as `config.json` and edit it for your organization
3. Create a Dockerfile for your token generator. The following should suffice:

    ```
    FROM $ORG/aws-sts:config
    ```

4. Build and publish the docker image for use in your organization
5. Copy the [`aws-token`](./example/aws-token) script to your prefered PATH location e.g. `/usr/local/bin/aws-token`
6. in your terminal do a `$ aws-token` to generate a temporal AWS token

## Configuration

Configuration is done by creating a config.json file in the root of your repository. An [example template](./cfg/config.example.json) is provided.

```
awsConfigPath:    Path to the user AWS CLI credential file. The recommended path is the path to the
                  Docker container's credential path.
outputFormat:     Output format of AWS access token credentials
region:           Region used for AWS API calls
provider:         Name of the SAML provider to use for authentication
idPEntryUrl:      URL to access the form-based authentication login for the provider
defaultAccount:   Default AWS account to use when one is not specified via the command line
accounts:         Map of accountName/account-objects for accounts which can be switched to
                  once initially authenticated
  account:
    accountNumber: AWS account number
    idpEntryUrl:   URL to access the form-based authentication login for the provider. If not defined will
                   fallback to the global idPEntryUrl
```

## Building

Once configured, build a docker container so that folks on your team can easily generate tokens without setup or configuration.

```
docker-compose build
docker-compose push
```

## Found a bug?

File it [HERE](https://github.com/meetearnest/aws-sts/issues/new)

## Troubleshooting

Sometimes, you might run into a timeout when you think all the required params are entered correctly.  When that happens, it's useful to turn of headless browsing to see what's going on.

```
$ npm run start-debug
```

## Limitations

* All functionality is executed inside a Docker container. Docker must be available in order for the application to work.
* At the moment, only Okta authentication is supported. We welcome Pull Requests for additional providers.
