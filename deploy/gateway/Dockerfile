# C1 网关容器：合并 4 个前端静态资源 + 反向代理（2 阶段，符合免费 512MB 限制）
# 构建上下文 = 仓库根；Dockerfile 路径 = deploy/gateway/Dockerfile

# 阶段一：一次性构建全部 4 个前端
FROM node:20-alpine AS builder
WORKDIR /work
COPY . .
RUN for d in client admin-dashboard agent-dashboard support-dashboard; do \
      echo "=== build $d ===" && \
      (cd "$d" && npm install --legacy-peer-deps && npm run build) || exit 1; \
    done

# 阶段二：nginx 托管
FROM nginx:alpine
RUN apk add --no-cache gettext

COPY --from=builder /work/client/dist              /usr/share/nginx/html
COPY --from=builder /work/admin-dashboard/dist      /usr/share/nginx/html/admin
COPY --from=builder /work/agent-dashboard/dist      /usr/share/nginx/html/agent
COPY --from=builder /work/support-dashboard/dist   /usr/share/nginx/html/support
COPY deploy/gateway/nginx.conf.template /etc/nginx/conf.d/default.conf.template

EXPOSE 80

CMD ["/bin/sh", "-c", "envsubst '${BFF_URL} ${GAME_ENGINE_URL}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
