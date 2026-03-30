FROM node:22-bullseye-slim

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV FRONTEND_PORT=8841

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

EXPOSE 8841

CMD ["npm", "run", "start"]
