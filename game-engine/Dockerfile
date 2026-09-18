FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

EXPOSE 8003

# 直接用 tsx 运行 TS（免 tsc 类型检查，演示环境最稳）
CMD ["npx", "tsx", "src/index.ts"]
