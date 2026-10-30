FROM node:24-bookworm AS node
FROM golang:1.27.3-bookworm AS kubectl-build
WORKDIR /build
RUN git clone --depth 1 --branch v1.37.2 https://github.com/kubernetes/kubernetes.git . \
 && test "$(git rev-parse HEAD)" = "1755f07c19a1d4a25955616aabdfdd66e0fbe224"
ENV GOWORK=off CGO_ENABLED=0
# Rebuild the upstream client with patched transport dependencies.
RUN go mod edit -require=golang.org/x/net@v0.60.0 -require=golang.org/x/text@v0.41.0 \
 && go build -mod=mod -trimpath -ldflags="-s -w -X k8s.io/component-base/version.gitVersion=v1.37.2-assertide.1 -X k8s.io/component-base/version.gitCommit=1755f07c19a1d4a25955616aabdfdd66e0fbe224" -o /kubectl ./cmd/kubectl
FROM postgres:17-bookworm AS service
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
COPY --from=kubectl-build /kubectl /usr/local/bin/kubectl
WORKDIR /app
COPY package.json ./
COPY apps/api/package*.json apps/api/
RUN npm --prefix apps/api ci
COPY packages/automation/package*.json packages/automation/
RUN npm --prefix packages/automation ci
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/gosu /usr/local/bin/docker-entrypoint.sh
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

FROM ghcr.io/nginx/nginx-unprivileged:1.30.6-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /build/dist/assertide-web/browser /usr/share/nginx/html
EXPOSE 8080
