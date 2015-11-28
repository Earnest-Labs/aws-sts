FROM node:5.1.0-onbuild

RUN apt-get update -qq && \
    apt-get install -y libgtk2.0-0 libgconf-2-4 \
    libasound2 libxtst6 libxss1 libnss3 xvfb

# Necessary for electron to function correctly

ENV DISPLAY=:9.0

VOLUME "/root/.aws"

ENTRYPOINT ["./docker-entrypoint.sh"]
