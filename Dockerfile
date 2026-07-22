# One Render web service: Express serves both the API and the built React UI.
FROM node:22-bookworm-slim

WORKDIR /app

# Chromium needs these system packages. Git and GitHub CLI support the optional
# draft-PR workflow; Render credentials should be supplied as secrets, never baked in.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git gnupg \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
  && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
RUN npm ci

COPY . .
RUN npm run build \
  && npx playwright install --with-deps chromium \
  && mkdir -p storage/uploads storage/codegen-sessions storage/runs storage/indexes storage/learning

ENV NODE_ENV=production
ENV CI=true
ENV PLAYWRIGHT_RETRIES=0
ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright
EXPOSE 10000

CMD ["node", "apps/api/dist/apps/api/src/server.js"]
