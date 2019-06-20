FROM node:8-slim

WORKDIR /usr/src/app

RUN set -ex \
    && apt-get update -qq \
    && apt-get install -qq -y \
      libgtk2.0-0 \
      libgconf-2-4 \
      libasound2 \
      libxtst6 \
      libxss1 \
      libnss3 \
      xvfb \
      libnotify-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install \
    && mkdir -p cfg
COPY src ./src
COPY docker-entrypoint.sh .

VOLUME "/root/.aws"

ONBUILD COPY config.json /usr/src/app/cfg/

ENTRYPOINT ["./docker-entrypoint.sh"]
