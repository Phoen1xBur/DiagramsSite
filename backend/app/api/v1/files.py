from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
import pandas as pd
import uuid
import os
from typing import List, Optional
from app.core.database import get_db
from app.core.redis_client import get_redis
from app.models.diagram import DataFile
from app.models.user import User, SubscriptionType
from app.models.project import Project
from app.schemas.diagram import DataFileCreate, DataFileResponse
from app.api.v1.auth import get_current_user_optional, get_current_user
from app.api.v1.projects import check_file_limit

router = APIRouter()

UPLOAD_DIR = "/tmp/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload", response_model=DataFileResponse)
async def upload_file(
    file: UploadFile = File(...),
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    redis = Depends(get_redis),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Загружает Excel или CSV файл и сохраняет данные в БД
    """
    # Если указан project_id, проверяем права доступа и лимиты
    if project_id and current_user:
        project = db.query(Project).filter(
            Project.id == project_id,
            Project.user_id == current_user.id
        ).first()
        if not project:
            raise HTTPException(status_code=404, detail="Проект не найден")
        
        # Проверяем лимит файлов
        check_file_limit(current_user, project_id, db)
    
    try:
        # Генерируем уникальное имя файла
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in ['.xlsx', '.xls', '.csv']:
            raise HTTPException(status_code=400, detail="Поддерживаются только файлы .xlsx, .xls, .csv")
        
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)
        
        # Сохраняем файл
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Читаем данные
        if file_ext == '.csv':
            df = pd.read_csv(file_path, encoding='utf-8')
        else:
            df = pd.read_excel(file_path)
        
        # Конвертируем в JSON-совместимый формат
        data = df.fillna("").to_dict('records')
        columns = [str(col) for col in df.columns]
        
        # Сохраняем в БД
        db_file = DataFile(
            filename=unique_filename,
            original_filename=file.filename,
            file_type=file_ext[1:],  # Без точки
            columns=columns,
            data=data,
            user_id=current_user.id if current_user else None,
            project_id=project_id if project_id else None,
            is_anonymous=current_user is None
        )
        db.add(db_file)
        db.commit()
        db.refresh(db_file)
        
        # Кэшируем в Redis
        redis_key = f"file:{db_file.id}"
        redis.setex(redis_key, 3600, str(db_file.id))  # Кэш на 1 час
        
        # Удаляем временный файл
        os.remove(file_path)
        
        return db_file
        
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки файла: {str(e)}")

@router.get("/", response_model=List[DataFileResponse])
async def list_files(
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Получает список загруженных файлов пользователя
    """
    if current_user:
        files = db.query(DataFile).filter(DataFile.user_id == current_user.id).order_by(DataFile.created_at.desc()).all()
    else:
        # Для неавторизованных пользователей возвращаем пустой список
        files = []
    return files

@router.get("/{file_id}", response_model=DataFileResponse)
async def get_file(
    file_id: int,
    db: Session = Depends(get_db),
    redis = Depends(get_redis),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Получает данные файла по ID
    """
    # Проверяем кэш
    redis_key = f"file:{file_id}"
    cached = redis.get(redis_key)
    
    file = db.query(DataFile).filter(DataFile.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="Файл не найден")
    
    # Проверяем права доступа
    if file.user_id and (not current_user or file.user_id != current_user.id):
        raise HTTPException(status_code=403, detail="Нет доступа к этому файлу")
    
    return file

@router.put("/{file_id}", response_model=DataFileResponse)
async def update_file(
    file_id: int,
    data: dict,
    db: Session = Depends(get_db),
    redis = Depends(get_redis),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Обновляет данные файла
    """
    file = db.query(DataFile).filter(DataFile.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="Файл не найден")
    
    # Проверяем права доступа
    if file.user_id and (not current_user or file.user_id != current_user.id):
        raise HTTPException(status_code=403, detail="Нет доступа к этому файлу")
    
    # Обновляем данные
    file.data = data.get('data', file.data)
    file.columns = data.get('columns', file.columns)
    
    db.commit()
    db.refresh(file)
    
    # Обновляем кэш
    redis_key = f"file:{file_id}"
    redis.setex(redis_key, 3600, str(file.id))
    
    return file

@router.delete("/{file_id}")
async def delete_file(
    file_id: int,
    db: Session = Depends(get_db),
    redis = Depends(get_redis),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Удаляет файл и все связанные диаграммы
    """
    file = db.query(DataFile).filter(DataFile.id == file_id).first()
    if not file:
        raise HTTPException(status_code=404, detail="Файл не найден")
    
    # Проверяем права доступа
    if file.user_id and (not current_user or file.user_id != current_user.id):
        raise HTTPException(status_code=403, detail="Нет доступа к этому файлу")
    
    # Удаляем из кэша
    redis_key = f"file:{file_id}"
    redis.delete(redis_key)
    
    db.delete(file)
    db.commit()
    
    return {"message": "Файл удален"}
