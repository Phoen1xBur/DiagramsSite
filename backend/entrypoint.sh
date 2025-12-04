#!/bin/bash
set -e

echo "Waiting for postgres..."
until nc -z postgres 5432; do
  echo "Postgres is unavailable - sleeping"
  sleep 1
done
echo "Postgres is up!"

echo "Running migrations..."
cd /app
alembic upgrade head

echo "Starting server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

