from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class DataFile(Base):
    __tablename__ = "data_files"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # null для анонимных
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)  # обязательное поле
    filename = Column(String, nullable=False)
    original_filename = Column(String, nullable=False)
    file_type = Column(String, nullable=False)  # xlsx, csv
    columns = Column(JSON, nullable=False)  # List of column names
    data = Column(JSON, nullable=False)  # List of dictionaries
    is_anonymous = Column(Boolean, default=False)  # True для анонимных файлов
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    project = relationship("Project", back_populates="data_files")
    diagrams = relationship("Diagram", back_populates="data_file", cascade="all, delete-orphan")

class Diagram(Base):
    __tablename__ = "diagrams"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)  # обязательное поле
    data_file_id = Column(Integer, ForeignKey("data_files.id"), nullable=False)
    name = Column(String, nullable=True)
    hierarchy_columns = Column(JSON, nullable=False)
    value_column = Column(String, nullable=True)
    use_gradient = Column(Integer, default=1)
    uniform_size = Column(Integer, default=0)
    show_zero_values = Column(Integer, default=1)
    chart_html = Column(Text, nullable=True)
    is_anonymous = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    project = relationship("Project", back_populates="diagrams")
    data_file = relationship("DataFile", back_populates="diagrams")

