# ADR 0005 installed_chrome on Cloud Run: the measurement of whether the route works on a server with a virtual display
# (Xvfb). Not a service: a Cloud Run job runs run.sh once, the local Octocrawl API inside it with a grant naming
# installed_chrome, and prints the 16 challenge tasks' outcomes to its log. research/access/runs/ has the record.
# Build context: a shallow clone of the commit measured (run-set.mjs reads its commit with git).
FROM node:22-bookworm

# Google Chrome stable from Google's own repository, the browser the route launches; Xvfb as its display.
RUN apt-get update && apt-get install -y --no-install-recommends wget gnupg ca-certificates xvfb xauth fonts-liberation fonts-noto-cjk git \
    && wget -qO- https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
# The bundled Chromium for the browser lane before the rung, where every user can read it.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npm ci && npx playwright install --with-deps chromium && npx tsc --build \
    && git config --system --add safe.directory /app

# Chrome runs as a user, never root, so its own sandbox stays on: the launch takes no --no-sandbox (ADR 0005 flags).
RUN useradd --create-home octo && chown -R octo /app
USER octo
CMD ["bash", "research/access/cloudrun-xvfb/run.sh"]
