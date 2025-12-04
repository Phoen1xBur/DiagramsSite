# Быстрый старт

## Запуск через Docker Compose

1. Убедитесь, что Docker и Docker Compose установлены

2. Создайте файл `.env` в корне проекта:
```bash
# Windows
copy .env.example .env

# Linux/Mac
cp .env.example .env
```
При необходимости отредактируйте `.env` файл.

3. В корне проекта выполните:
```bash
docker-compose up -d
```

3. Дождитесь запуска всех сервисов (около 30-60 секунд)

4. Откройте в браузере:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000
   - API документация: http://localhost:8000/docs

## Проверка работы

1. Откройте http://localhost:5173
2. Нажмите "Загрузить Excel/CSV" и выберите файл
3. Перейдите на вкладку "Редактор" для редактирования данных
4. Перейдите на вкладку "Диаграмма" и постройте диаграмму

## Остановка

```bash
docker-compose down
```

## Очистка данных

```bash
docker-compose down -v
```

## Просмотр логов

```bash
docker-compose logs -f
```

## Перезапуск после изменений

```bash
docker-compose restart backend
docker-compose restart frontend
```

