from sqlalchemy import Column, Integer, String, DateTime, Boolean, TypeDecorator
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.core.database import Base

class SubscriptionType(str, enum.Enum):
    BASIC = "basic"  # 1 проект, 3 файла на проект
    PREMIUM = "premium"  # Неограниченно
    ENTERPRISE = "enterprise"  # Неограниченно + дополнительные функции

class SubscriptionTypeColumn(TypeDecorator):
    """Кастомный тип для хранения SubscriptionType как строки в БД"""
    impl = String
    cache_ok = True
    
    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, SubscriptionType):
            return value.value
        return str(value)
    
    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, SubscriptionType):
            return value
        # Конвертируем строку в Enum
        try:
            return SubscriptionType(value)
        except ValueError:
            # Если значение не найдено в Enum, возвращаем BASIC по умолчанию
            return SubscriptionType.BASIC

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    first_name = Column(String, nullable=False)  # Имя пользователя для отображения
    username = Column(String, unique=True, index=True, nullable=True)  # Опциональный никнейм
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)  # Флаг администратора
    subscription_type = Column(SubscriptionTypeColumn(50), default=SubscriptionType.BASIC, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    projects = relationship("Project", back_populates="user", cascade="all, delete-orphan")
