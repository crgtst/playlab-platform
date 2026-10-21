FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build
EXPOSE 5173
CMD ["npx", "vite", "preview", "--port", "5173", "--host"]
