# AWS STS Token Generator


Single Sign on within AWS removes the ability to generate long-lived access tokens for AWS. Instead, the 
[Amazon Security Token Service](http://docs.aws.amazon.com/STS/latest/APIReference/Welcome.html) is used to generate 
short-lived tokens.

This command line utility can be used to authenticate with an SSO provider (ex: Okta) and generate access token credentials.
It supports assuming an AWS role and will automatically update your AWS CLI credentials file with the new credentials.
 
For ease of use, the token generator is packaged as a docker container. Your team will not need to clone this repository
or install anything. Token can be generated via a single `docker run` command. A helper script is also included to encapsulate
the arguments of the docker command.

We recommend the following steps for use in your organization:

1. Create a fresh git repository
2. Copy [`config.example.json`](./cfg/config.example.json) to the root of your repository as `config.json` and edit it for your organization
3. Copy the [`aws-token.example.sh`](./aws-token.example.sh) script to the root of your repository for easy distribution/use 
4. Create a Dockerfile for your token generator. The following should suffice:
    
    ```
    FROM earnest/aws-sts
    ```
    
5. Build and publish the docker image for use in your organization

## Configuration

Configuration is done by creating a config.json file in the root of your repository. An [example template](./cfg/config.example.json) is provided.
 
```
awsConfigPath:    Path to the user AWS CLI credential file. The recommended path is the path to the Docker container's credential path.
outputFormat:     Output format of AWS access token credentials
region:           Region used for AWS API calls
provider:         Name of the SAML provider to use for authentication
idPEntryUrl:      URL to access the form-based authentication login for the provider
defaultAccount:   Default AWS account to use when one is not specified via the command line
accounts:         Hash of name/accountID pairs for accounts which can be switched to once initially authenticated
```

## Building

Once configured, build a docker container so that folks on your team can easily generate tokens without setup or configuration.

```
docker build -t YOUR_ORG/aws-sts .
docker push YOUR_ORG/aws-sts
```

## Installation

The token generator runs as a docker container which can bind-mount to your AWS credentials file to save temporary credentials. 
Installation is as simple as downloading the [`aws-token.sh`](./aws-token.sh) script and saving it somewhere. Then execute that file every time 
you need a new token.

## Usage

`````
$> ./aws-token.sh --help
usage: index.js [-h] [-v] [--username USERNAME] [--password PASSWORD]
                [--role ROLE]
                [--account {staging,development}]
                [--profile PROFILE]


AWS STS Token Generator

Optional arguments:
  -h, --help            Show this help message and exit.
  -v, --version         Show program's version number and exit.
  --username USERNAME   Okta username (ex. user@meetearnest.com)
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
