# syntax=docker/dockerfile:1
# Static admin UI behind nginx. Every VITE_* value is public and baked in at build time (ADR 0002).
#   docker build --build-arg VITE_API_BASE_URL=https://api.mmlabs.online --build-arg VITE_APP_KEY=admin .

FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS build
WORKDIR /app
ENV CI=true PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm install -g pnpm@10 --no-fund --no-audit
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_API_BASE_URL
ARG VITE_APP_KEY
ARG VITE_TURNSTILE_SITE_KEY=
# The values end up in the bundle and in the nginx CSP, so validate them before use.
RUN set -eu; \
    printf '%s\n' "$VITE_API_BASE_URL" | grep -Eq '^https://[a-z0-9.-]+(:[0-9]{1,5})?$' \
      || { echo "VITE_API_BASE_URL must be an https origin (no path, no trailing slash)"; exit 1; }; \
    printf '%s\n' "$VITE_APP_KEY" | grep -Eq '^[a-z][a-z0-9-]*$' \
      || { echo "VITE_APP_KEY must match ^[a-z][a-z0-9-]*$"; exit 1; }; \
    printf '%s\n' "$VITE_TURNSTILE_SITE_KEY" | grep -Eq '^[0-9A-Za-z_-]*$' \
      || { echo "VITE_TURNSTILE_SITE_KEY has invalid characters"; exit 1; }; \
    export VITE_API_BASE_URL VITE_APP_KEY VITE_TURNSTILE_SITE_KEY; \
    pnpm build; \
    extra="$(find dist -mindepth 1 \( -name '*.map' -o -name '.*' \))"; \
    [ -z "$extra" ] || { echo "unexpected files in dist: $extra"; exit 1; }; \
    sed "s#@API_ORIGIN@#${VITE_API_BASE_URL}#g" nginx/security-headers.conf > /app/security-headers.conf; \
    if grep -q '@API_ORIGIN@' /app/security-headers.conf; then echo "CSP placeholder not rendered"; exit 1; fi

FROM nginxinc/nginx-unprivileged:1.30.6-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03
ENV NGINX_ENTRYPOINT_QUIET_LOGS=1
USER root
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/*
COPY --chown=root:root nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=root:root /app/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build --chown=root:root /app/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
