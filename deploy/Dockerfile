FROM node:24-bookworm AS node
FROM postgres:17-bookworm AS service
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
ARG KUBECTL_VERSION=v1.35.0
RUN curl -fsSLo /usr/local/bin/kubectl https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl \
 && curl -fsSLo /tmp/kubectl.sha256 https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl.sha256 \
 && echo "$(cat /tmp/kubectl.sha256)  /usr/local/bin/kubectl" | sha256sum --check \
 && chmod 755 /usr/local/bin/kubectl
WORKDIR /app
COPY apps/api/package*.json apps/api/
RUN npm --prefix apps/api ci
COPY packages/automation/package*.json packages/automation/
RUN npm --prefix packages/automation ci
COPY apps/api apps/api
COPY packages/domain packages/domain
COPY packages/automation packages/automation
COPY workers workers
RUN mkdir -p /app/.local && chown 10001:10001 /app/.local
ENV NODE_ENV=production HOST=0.0.0.0 REPORT_HOST=0.0.0.0 HOME=/tmp
USER 10001:10001
EXPOSE 4010 4012 4020
ENTRYPOINT ["node", "--import", "/app/apps/api/node_modules/tsx/dist/loader.mjs"]
CMD ["/app/apps/api/src/main.ts"]

FROM node:24-bookworm AS web-build
WORKDIR /build
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web ./
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /build/dist/assertide-web/browser /usr/share/nginx/html
EXPOSE 8080
