FROM node:22-alpine
WORKDIR /app
ARG API_URL=http://api:8000
ENV API_URL=$API_URL
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
