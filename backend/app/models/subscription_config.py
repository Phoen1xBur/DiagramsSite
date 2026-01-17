from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from app.core.database import Base

class SubscriptionConfig(Base):
    """Конфигурация лимитов для каждого типа подписки"""
    __tablename__ = "subscription_configs"
    
    id = Column(Integer, primary_key=True, index=True)
    subscription_type = Column(String(50), unique=True, nullable=False, index=True)  # basic, premium, enterprise
    display_name = Column(String(100), nullable=False)  # Отображаемое имя
    max_projects = Column(Integer, nullable=False, default=-1)  # -1 = безлимит
    max_files_per_project = Column(Integer, nullable=False, default=-1)  # -1 = безлимит
    max_diagrams_per_project = Column(Integer, nullable=False, default=-1)  # -1 = безлимит
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
