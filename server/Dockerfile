FROM node:24-alpine

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package.json .

RUN npm install

# Clean up build dependencies to reduce image size
RUN apk del python3 make g++

COPY . .

EXPOSE 3005

CMD ["node", "app.js"]

