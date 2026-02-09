FROM node:20-alpine

WORKDIR /app

# IPv4 first to avoid npm hangs on IPv6
ENV NODE_OPTIONS=--dns-result-order=ipv4first

# Копирование package.json (и package-lock.json при наличии)
COPY package.json package-lock.json* ./

# Устанавливаем все зависимости (включая dev для режима разработки)
RUN npm config set registry https://registry.npmjs.org/ \
  && npm config set fetch-retries 5 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm install --no-audit --no-fund --progress=false

# Копирование исходного кода (после установки зависимостей для лучшего кэширования)
COPY . .

# Порт для Vite
EXPOSE 5173

# Команда запуска
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

