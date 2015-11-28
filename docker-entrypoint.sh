#!/usr/bin/env bash

Xvfb -ac -screen scrn 1280x2000x24 :9.0 &
node src/index.js "$@"
