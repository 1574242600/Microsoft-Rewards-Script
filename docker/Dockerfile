FROM oven/bun:latest AS builder
WORKDIR /MRS

COPY ./ .

# --ignore-scripts 是为了跳过 electron postinstall，避免它在 CI 里报错
# electron 在这个项目没有任何用处，只是因为 playwright require 了它，不安装它的话，bun 打不了包
RUN bun install --frozen-lockfile --ignore-scripts \
    && bun run build



FROM oven/bun:latest as prod
WORKDIR /config

ENV NODE_ENV=production
ENV ACCOUNTS_PATH=/config/accounts.json
ENV CONFIG_PATH=/config/config.json
ENV SESSIONS_DIR=/sessions

RUN bunx playwright install --with-deps chromium

COPY --from=builder /MRS/dist/*  /MRS/
COPY --from=builder /MRS/node_modules/  /MRS/node_modules/

VOLUME /config
VOLUME /sessions

CMD ["bun", "/MRS/index.js"]