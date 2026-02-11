FROM node:22
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 4101
CMD ["npm","run","dev","--","--host","0.0.0.0","--port","4101"]
