FROM node:22
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 4102
CMD ["next","dev","--","-p","4102","-H","0.0.0.0"]
