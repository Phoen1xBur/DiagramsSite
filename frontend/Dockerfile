FROM node:20-alpine

WORKDIR /app

# Копирование package.json и package-lock.json для лучшего кэширования
COPY package.json package-lock.json* ./

# Используем npm ci для быстрой установки (быстрее чем npm install)
# и устанавливаем зависимости только если изменились package файлы
RUN npm ci --only=production=false || npm install

# Копирование исходного кода (после установки зависимостей для лучшего кэширования)
COPY . .

# Порт для Vite
EXPOSE 5173

# Команда запуска
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

