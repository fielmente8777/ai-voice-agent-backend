# Development image: the source code is mounted in by docker-compose.yml, and
# nodemon restarts the server whenever a file in src/ changes.
FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

EXPOSE 5001

# --legacy-watch (polling): file-change events don't reliably reach a container
# from a Windows folder, so without it edits would not trigger a restart.
CMD ["node_modules/.bin/nodemon", "--legacy-watch", "--watch", "src", "src/index.js"]
