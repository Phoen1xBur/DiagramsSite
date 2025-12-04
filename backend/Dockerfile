FROM python:3.11-slim

WORKDIR /app

# Установка системных зависимостей
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Копирование requirements и установка зависимостей
# Делаем это отдельно для лучшего кэширования Docker слоев
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копирование кода приложения (после установки зависимостей)
COPY . .

# Создание директории для загрузок
RUN mkdir -p /tmp/uploads

# Копирование entrypoint скрипта
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Порт для FastAPI
EXPOSE 8000

