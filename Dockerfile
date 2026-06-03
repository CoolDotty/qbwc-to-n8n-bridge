FROM node:20-alpine

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/app.js"]
