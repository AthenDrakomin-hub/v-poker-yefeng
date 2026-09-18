FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps --omit=dev

COPY . .
RUN npm run build

EXPOSE 4000

CMD ["npm", "start"]
