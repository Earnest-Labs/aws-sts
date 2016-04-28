FROM node:4.2-slim

RUN apt-get update -qq && \
    apt-get install -y \
    libgtk2.0-0 libgconf-2-4 libasound2 libxtst6 libxss1 libnss3 xvfb libnotify-dev

WORKDIR /usr/src/app

COPY package.json /usr/src/app/
RUN npm install
COPY . /usr/src/app

VOLUME "/root/.aws"

ONBUILD COPY config.json /usr/src/app/cfg/

ENTRYPOINT ["./docker-entrypoint.sh"]
