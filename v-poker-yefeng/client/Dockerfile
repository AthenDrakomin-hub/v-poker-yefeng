# 多阶段构建：Node 构建 + Nginx 托管
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# Nginx 托管静态文件 + 反向代理
FROM nginx:alpine

RUN apk add --no-cache gettext

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/conf.d/default.conf.template

EXPOSE 80

# 启动时用环境变量替换 upstream（BFF_URL / GAME_ENGINE_URL），再启动 nginx
CMD ["/bin/sh", "-c", "envsubst '${BFF_URL} ${GAME_ENGINE_URL}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
