# C1 网关容器：合并 4 个前端静态资源 + 反向代理
# 构建上下文 = 仓库根目录；Dockerfile 路径 = deploy/gateway/Dockerfile

FROM node:20-alpine AS base
WORKDIR /work

# ---- client（根路径）----
FROM base AS client
COPY client/package*.json ./client/
RUN cd client && npm install --legacy-peer-deps
COPY client/ ./client/
RUN cd client && npm run build

# ---- admin（/admin/）----
FROM base AS admin
COPY admin-dashboard/package*.json ./admin-dashboard/
RUN cd admin-dashboard && npm install --legacy-peer-deps
COPY admin-dashboard/ ./admin-dashboard/
RUN cd admin-dashboard && npm run build

# ---- agent（/agent/）----
FROM base AS agent
COPY agent-dashboard/package*.json ./agent-dashboard/
RUN cd agent-dashboard && npm install --legacy-peer-deps
COPY agent-dashboard/ ./agent-dashboard/
RUN cd agent-dashboard && npm run build

# ---- support（/support/）----
FROM base AS support
COPY support-dashboard/package*.json ./support-dashboard/
RUN cd support-dashboard && npm install --legacy-peer-deps
COPY support-dashboard/ ./support-dashboard/
RUN cd support-dashboard && npm run build

# ---- nginx 运行时 ----
FROM nginx:alpine
RUN apk add --no-cache gettext

COPY --from=client  /work/client/dist          /usr/share/nginx/html
COPY --from=admin   /work/admin-dashboard/dist /usr/share/nginx/html/admin
COPY --from=agent   /work/agent-dashboard/dist /usr/share/nginx/html/agent
COPY --from=support /work/support-dashboard/dist /usr/share/nginx/html/support
COPY deploy/gateway/nginx.conf.template /etc/nginx/conf.d/default.conf.template

EXPOSE 80

CMD ["/bin/sh", "-c", "envsubst '${BFF_URL} ${GAME_ENGINE_URL}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
