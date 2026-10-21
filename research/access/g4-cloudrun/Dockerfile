# G4: installed_chrome on Cloud Run with a fixed runtime (research/access/runs/2026-10-21-g4-cloudrun-fixed-runtime-22c9e1ca.md).
# The 2026-10-14 image (research/access/cloudrun-xvfb/) took node:22-bookworm and Chrome stable by tag; here the base
# image is pinned by digest, Chrome by version and SHA-256, Playwright by package-lock.json, and the rest is recorded in
# /app/.g4-image-manifest.txt at build time and fixed by the pushed image's digest. Not a service: a Cloud Run job runs
# entry.sh once per execution. Build context: a shallow clone of the commit measured (build.sh).
# Node 26.8.1 is the Node of the local arm on Howard's Mac, so the HTTP lane's TLS stack matches between the two sides.
FROM node:26.8.1-bookworm@sha256:53eaddc9c421e3e33f5365bb605cb4d85477886745573216219933e22ac13ab0

# Google Chrome 155.0.8059.79, the build the 2026-10-14 job used (the Mac runs 155.0.8059.85, which Google's Linux pool
# does not have), from Google's pool, checked against the SHA-256 taken on 2026-10-21. Xvfb as its display, tini as
# PID 1 (reaps Chrome's children, forwards SIGTERM), xdpyinfo for the self-check. The fonts are the 2026-10-14 set.
ARG CHROME_VERSION=155.0.8059.79-1
ARG CHROME_SHA256=b7726070ca707965e9a17b38e4f15ba283bf6f65c339626c092862af7b19badc
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates wget xvfb xauth x11-utils tini fonts-liberation fonts-noto-cjk git \
    && wget -qO /tmp/chrome.deb "https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_${CHROME_VERSION}_amd64.deb" \
    && echo "${CHROME_SHA256}  /tmp/chrome.deb" | sha256sum -c - \
    && apt-get install -y --no-install-recommends /tmp/chrome.deb && rm /tmp/chrome.deb \
    && rm -f /etc/apt/sources.list.d/google-chrome.list \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
# The bundled Chromium (the browser_local lane before the rung) at the revision package-lock.json's Playwright names.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npm ci && npx playwright install --with-deps chromium && npx tsc --build \
    && git config --system --add safe.directory /app \
    && { google-chrome --version; node --version; npx playwright --version; dpkg-query -W -f '${Package} ${Version}\n'; } > /app/.g4-image-manifest.txt

# Locale and time zone stated, not left implicit: the 2026-10-14 image had neither set, which Chrome reads as en-US and
# UTC, so these keep that. They are the system's; the rung passes no --lang and no time zone (ADR 0005).
ENV LANG=C.UTF-8 TZ=Etc/UTC

# Chrome runs as a user, never root, so its own sandbox stays on: the launch takes no --no-sandbox (ADR 0005 flags).
RUN useradd --create-home octo && chown -R octo /app
USER octo
ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
CMD ["bash", "research/access/g4-cloudrun/entry.sh"]
