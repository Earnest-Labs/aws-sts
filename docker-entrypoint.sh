#!/usr/bin/env bash

xvfb-run --server-args="-screen 0 1280x2000x24" node src/index.js "$@"
