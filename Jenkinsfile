pipeline {
  agent {
    label "system-operations"
  }    
  options {
    ansiColor colorMapName: 'XTerm'
    timestamps()
  }
  stages {
    stage("test") {
      steps {
        sh "echo hello"
      }
    }
  }
}
