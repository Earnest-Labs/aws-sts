#!/usr/bin/env groovy

@Library('jenkins-pipeline-library') _

def Strength = library('jenkins-pipeline-library').com.earnest.jpl.AccomplishmentStrength

pipeline {
  agent { label "generic" }

  options {
    // colorful output for Jenkins terminal
    ansiColor colorMapName: 'XTerm'
  }

  environment {
    DOCKER_LOGIN = credentials("DOCKER_LOGIN")
  }

  stages {
    stage("Prepare Build Environment") {
      steps {
        script {
          version = sh(returnStdout: true, script: 'cat version').trim()
          env.DOCKER_IMAGE_TAG = "earnest/aws-sts:${version}"
        }
        prepareNpmEnv()
        prepareDockerEnv()
      }
    }

    stage("Run Tests") {
      steps {
        sh "docker-compose build"
        sh 'docker-compose run --entrypoint "bash -c" app "npm run test"'
      }
    }

    stage("Build") {
      steps {
        script {
            sh "docker build -t $DOCKER_IMAGE_TAG ."
            sh "docker push $DOCKER_IMAGE_TAG"
        }
      }
    }
  }
}
