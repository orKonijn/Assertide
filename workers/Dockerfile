FROM mcr.microsoft.com/playwright:v1.64.1-noble
WORKDIR /app/apps/api
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci
COPY apps/api/src/lab.ts apps/api/src/database.ts apps/api/src/migrations.ts apps/api/src/local-sandbox.ts apps/api/src/worker-fixture.ts ./src/
COPY packages/automation/package.json packages/automation/package-lock.json /app/packages/automation/
RUN npm --prefix /app/packages/automation ci
COPY .local/targets/swag-store/build /app/.local/targets/swag-store/build
COPY workers/entry.mjs /app/workers/entry.mjs
RUN sha256sum /app/packages/automation/package-lock.json | cut -d ' ' -f 1 > /app/automation-lock.sha256
ENV NODE_ENV=development HOME=/tmp PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
USER 10001:10001
ENTRYPOINT ["node", "--import", "tsx", "/app/workers/entry.mjs"]
