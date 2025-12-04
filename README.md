# Диаграмма "Солнечные лучи" - Веб-приложение

Веб-приложение для создания и управления sunburst диаграммами (диаграммы "солнечные лучи").

## Технологии

### Backend
- **FastAPI** - современный веб-фреймворк для Python
- **SQLAlchemy** - ORM для работы с базой данных
- **PostgreSQL** - реляционная база данных
- **Redis** - кэширование данных
- **Pydantic** - валидация данных
- **Alembic** - миграции базы данных

### Frontend
- **React** - библиотека для создания пользовательского интерфейса
- **Vite** - сборщик и dev-сервер
- **Axios** - HTTP клиент
- **Plotly.js** - библиотека для визуализации диаграмм

## Структура проекта

```
.
├── backend/              # Backend приложение (FastAPI)
│   ├── app/
│   │   ├── api/         # API endpoints
│   │   ├── core/        # Конфигурация, БД, Redis
│   │   ├── models/      # SQLAlchemy модели
│   │   ├── schemas/     # Pydantic схемы
│   │   └── services/    # Бизнес-логика
│   ├── alembic/         # Миграции БД
│   ├── Dockerfile
│   ├── entrypoint.sh    # Скрипт запуска с миграциями
│   └── requirements.txt
├── frontend/            # Frontend приложение (React)
│   ├── src/
│   │   ├── components/  # React компоненты
│   │   ├── api/         # API клиент
│   │   └── App.jsx
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml   # Docker Compose конфигурация
├── .env.example         # Пример файла с переменными окружения
└── README.md
```

## Установка и запуск

### Требования
- Docker и Docker Compose
- (Опционально) Node.js 20+ и Python 3.11+ для локальной разработки

### Запуск через Docker Compose

1. Клонируйте репозиторий или скопируйте файлы проекта

2. Создайте файл `.env` из примера:
```bash
cp .env.example .env
```
При необходимости отредактируйте `.env` файл.

3. Запустите все сервисы:
```bash
docker-compose up -d
```

4. Приложение будет доступно:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000
   - API документация: http://localhost:8000/docs

5. Для просмотра логов:
```bash
docker-compose logs -f
```

6. Для остановки:
```bash
docker-compose down
```

### Первый запуск

При первом запуске автоматически:
- Создаются таблицы в PostgreSQL
- Инициализируется Redis
- Запускаются backend и frontend сервисы

### Настройка переменных окружения

Все переменные окружения настраиваются через файл `.env` в корне проекта. 
Скопируйте `.env.example` в `.env` и отредактируйте при необходимости.

**Важно:**
- PostgreSQL и Redis по умолчанию доступны только внутри Docker сети (без внешних портов)
- Если нужен доступ к БД с хоста, раскомментируйте секцию `ports` в `docker-compose.yml`
- Это предотвращает конфликты портов при запуске нескольких проектов

### Локальная разработка (без Docker)

#### Backend

1. Установите зависимости:
```bash
cd backend
pip install -r requirements.txt
```

2. Настройте переменные окружения:
   - Скопируйте `backend/.env.example` в `backend/.env`
   - При необходимости отредактируйте значения

3. Запустите миграции:
```bash
alembic upgrade head
```

4. Запустите сервер:
```bash
uvicorn app.main:app --reload
```

#### Frontend

1. Установите зависимости:
```bash
cd frontend
npm install
```

2. Создайте `.env` файл:
   - Скопируйте `frontend/.env.example` в `frontend/.env`
   - При необходимости отредактируйте значения

3. Запустите dev-сервер:
```bash
npm run dev
```

## Использование

1. **Загрузка файла**: Перейдите на вкладку "Файл" и загрузите Excel (.xlsx, .xls) или CSV файл
2. **Редактирование данных**: На вкладке "Редактор" вы можете редактировать данные, добавлять/удалять строки и столбцы
3. **Создание диаграммы**: На вкладке "Диаграмма":
   - Выберите столбцы для иерархии (порядок важен)
   - Выберите столбец значений (опционально)
   - Настройте параметры отображения
   - Нажмите "Построить диаграмму"

## API Endpoints

### Файлы
- `POST /api/v1/files/upload` - Загрузка файла
- `GET /api/v1/files/` - Список всех файлов
- `GET /api/v1/files/{file_id}` - Получить файл по ID
- `DELETE /api/v1/files/{file_id}` - Удалить файл

### Диаграммы
- `POST /api/v1/charts/generate` - Генерация HTML диаграммы
- `POST /api/v1/diagrams/` - Создать диаграмму
- `GET /api/v1/diagrams/` - Список всех диаграмм
- `GET /api/v1/diagrams/{diagram_id}` - Получить диаграмму по ID
- `PUT /api/v1/diagrams/{diagram_id}` - Обновить диаграмму
- `DELETE /api/v1/diagrams/{diagram_id}` - Удалить диаграмму

Полная документация API доступна по адресу: http://localhost:8000/docs

## Развертывание на сервере (Linux Debian)

1. Установите Docker и Docker Compose на сервере:
```bash
sudo apt-get update
sudo apt-get install docker.io docker-compose
sudo systemctl start docker
sudo systemctl enable docker
```

2. Скопируйте проект на сервер

3. Настройте переменные окружения:
   - Скопируйте `.env.example` в `.env`
   - Измените `CORS_ORIGINS` на URL вашего домена
   - Измените `VITE_API_BASE_URL` на URL вашего API
   - Измените `SECRET_KEY` на безопасный ключ
   - При необходимости раскомментируйте внешние порты PostgreSQL/Redis в `docker-compose.yml`

4. Запустите:
```bash
docker-compose up -d
```

5. (Опционально) Настройте Nginx как reverse proxy для frontend и backend

## Развертывание на Windows

1. Установите Docker Desktop для Windows

2. Запустите Docker Desktop

3. Создайте `.env` файл из `.env.example`

4. Откройте терминал в папке проекта и выполните:
```bash
docker-compose up -d
```

5. Приложение будет доступно по тем же адресам

## Устранение неполадок

### Проблемы с подключением к БД
- Убедитесь, что PostgreSQL контейнер запущен: `docker-compose ps`
- Проверьте логи: `docker-compose logs postgres`
- Проверьте переменные окружения в `.env` файле

### Проблемы с Redis
- Проверьте логи: `docker-compose logs redis`
- Убедитесь, что Redis контейнер здоров: `docker-compose ps`

### Проблемы с миграциями
- Выполните миграции вручную: `docker-compose exec backend alembic upgrade head`

### Очистка данных
- Остановите контейнеры: `docker-compose down`
- Удалите volumes: `docker-compose down -v`
- Запустите заново: `docker-compose up -d`

### Конфликты портов
- PostgreSQL и Redis по умолчанию не имеют внешних портов
- Если нужен доступ с хоста, раскомментируйте `ports` в `docker-compose.yml`
- Это позволяет запускать несколько проектов без конфликтов

## Лицензия

MIT
