FROM node:20-alpine

WORKDIR /app

# Копирование package.json (и package-lock.json при наличии)
COPY package.json package-lock.json* ./

# Устанавливаем все зависимости (включая dev для режима разработки)
RUN npm install

# Копирование исходного кода (после установки зависимостей для лучшего кэширования)
COPY . .

# Порт для Vite
EXPOSE 5173

# Команда запуска
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

