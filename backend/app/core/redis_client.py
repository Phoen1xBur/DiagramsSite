import redis
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

try:
    redis_client = redis.Redis(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        db=settings.REDIS_DB,
        decode_responses=True,
        socket_connect_timeout=5
    )
    # Проверяем подключение
    redis_client.ping()
except Exception as e:
    logger.warning(f"Redis connection failed: {e}. Continuing without Redis cache.")
    redis_client = None

def get_redis():
    if redis_client is None:
        # Возвращаем mock объект, если Redis недоступен
        class MockRedis:
            def get(self, key):
                return None
            def setex(self, key, time, value):
                pass
            def delete(self, key):
                pass
        return MockRedis()
    return redis_client

