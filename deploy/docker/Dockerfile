# Octocrawl on your own server: the published `octocrawl` package from npm, with the Chromium its Playwright expects.
# Built and run by compose.yaml beside this file (docs/self-host-docker.md). It needs nothing from this repository.
FROM node:22-bookworm-slim

# The npm version to install: `latest`, or a pinned one such as 0.4.1 (OCTOCRAWL_VERSION=0.4.1 docker compose build).
ARG OCTOCRAWL_VERSION=latest

# better-sqlite3 falls back to building from source when no prebuilt binary matches the platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Browsers go to a shared path, so the unprivileged user that runs the server finds the ones root installed.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npm install -g "octocrawl@${OCTOCRAWL_VERSION}" \
    && node "$(npm root -g)/octocrawl/node_modules/playwright/cli.js" install --with-deps chromium \
    && npm cache clean --force \
    && octocrawl --version

# Task records, batch and crawl results, and the page cache live in /data: keep it as a volume.
RUN mkdir -p /data && chown node:node /data
USER node
WORKDIR /data
ENV W2L_TASK_ROOT=/data
EXPOSE 8787

# Every interface, so the published port reaches it; `octocrawl serve` refuses that without a token (W2L_API_TOKEN).
CMD ["octocrawl", "serve", "--host", "0.0.0.0", "--port", "8787"]
