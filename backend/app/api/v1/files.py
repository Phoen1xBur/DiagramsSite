from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Query, Header
from fastapi import Request
from sqlalchemy.orm import Session
from sqlalchemy import func
import pandas as pd
import uuid
import os
import json
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
    request: Request,
    file: UploadFile = File(...),
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    redis = Depends(get_redis),
    current_user: Optional[User] = Depends(get_current_user_optional),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """
    Загружает Excel или CSV файл.
    Для авторизованных пользователей: сохраняет в БД и привязывает к пользователю и проекту.
    Для неавторизованных: сохраняет только во временной сессии Redis, файл физически удаляется.
    """
    # Получаем или создаем session_id для неавторизованных пользователей
    session_id = None
    if not current_user:
        if x_session_id:
            session_id = x_session_id
        else:
            session_id = request.cookies.get("session_id")
        if not session_id:
            session_id = str(uuid.uuid4())
    
    file_path = None
    try:
        # Для авторизованных пользователей обрабатываем project_id
        if current_user:
            # Если project_id не указан, создаем или используем дефолтный проект
            if not project_id:
                # Ищем первый существующий проект пользователя
                project = db.query(Project).filter(
                    Project.user_id == current_user.id
                ).order_by(Project.created_at.asc()).first()
                
                # Если проектов нет, создаем дефолтный
                if not project:
                    project = Project(
                        user_id=current_user.id,
                        name="Мой проект",
                        description="Проект по умолчанию"
                    )
                    db.add(project)
                    db.commit()
                    db.refresh(project)
                
                project_id = project.id
            else:
                # Если project_id указан, проверяем права доступа
                project = db.query(Project).filter(
                    Project.id == project_id,
                    Project.user_id == current_user.id
                ).first()
                if not project:
                    raise HTTPException(status_code=404, detail="Проект не найден")
            
            # Проверяем лимит файлов
            check_file_limit(current_user, project_id, db)
        
        # Генерируем уникальное имя файла
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in ['.xlsx', '.xls', '.csv']:
            raise HTTPException(status_code=400, detail="Поддерживаются только файлы .xlsx, .xls, .csv")
        
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)
        
        # Сохраняем файл временно для чтения
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
        
        # Удаляем файл с диска сразу после чтения
        if os.path.exists(file_path):
            os.remove(file_path)
            file_path = None
        
        if current_user:
            # Авторизованный пользователь: сохраняем в БД
            # project_id уже гарантированно установлен выше
            db_file = DataFile(
                filename=unique_filename,
                original_filename=file.filename,
                file_type=file_ext[1:],  # Без точки
                columns=columns,
                data=data,
                user_id=current_user.id,
                project_id=project_id,  # обязательное поле
                is_anonymous=False
            )
            db.add(db_file)
            db.commit()
            db.refresh(db_file)
            
            # Кэшируем в Redis
            redis_key = f"file:{db_file.id}"
            redis.setex(redis_key, 3600, str(db_file.id))  # Кэш на 1 час
            
            return db_file
        else:
            # Неавторизованный пользователь: сохраняем только в Redis сессии
            file_id = str(uuid.uuid4())
            session_key = f"session:{session_id}:file:{file_id}"
            
            file_data = {
                "id": file_id,
                "filename": unique_filename,
                "original_filename": file.filename,
                "file_type": file_ext[1:],
                "columns": columns,
                "data": data,
                "created_at": None,
                "updated_at": None
            }
            
            # Сохраняем в Redis на 24 часа
            redis.setex(session_key, 24 * 3600, json.dumps(file_data))
            
            # Сохраняем список файлов сессии
            session_files_key = f"session:{session_id}:files"
            existing_files = redis.get(session_files_key)
            if existing_files:
                files_list = json.loads(existing_files)
            else:
                files_list = []
            files_list.append(file_id)
            redis.setex(session_files_key, 24 * 3600, json.dumps(files_list))
            
            # Возвращаем объект, совместимый с DataFileResponse
            # Используем отрицательный ID для сессионных файлов
            return DataFileResponse(
                id=-int(file_id[:8], 16) if len(file_id) >= 8 else -1,  # Временный отрицательный ID
                filename=unique_filename,
                original_filename=file.filename,
                file_type=file_ext[1:],
                columns=columns,
                data=data,
                created_at=None,
                updated_at=None
            )
        
    except HTTPException:
        raise
    except Exception as e:
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Ошибка загрузки файла: {str(e)}")

@router.get("/", response_model=List[DataFileResponse])
async def list_files(
    request: Request,
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    redis = Depends(get_redis),
    current_user: Optional[User] = Depends(get_current_user_optional),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """
    Получает список загруженных файлов пользователя.
    Для авторизованных: файлы из БД (опционально фильтруя по project_id).
    Для неавторизованных: файлы из сессии Redis.
    """
    if current_user:
        query = db.query(DataFile).filter(DataFile.user_id == current_user.id)
        if project_id:
            query = query.filter(DataFile.project_id == project_id)
        files = query.order_by(DataFile.created_at.desc()).all()
        return files
    else:
        # Для неавторизованных пользователей получаем файлы из сессии
        session_id = None
        if x_session_id:
            session_id = x_session_id
        else:
            session_id = request.cookies.get("session_id")
        
        if not session_id:
            return []
        
        # Получаем список файлов сессии
        session_files_key = f"session:{session_id}:files"
        files_list_json = redis.get(session_files_key)
        if not files_list_json:
            return []
        
        files_list = json.loads(files_list_json)
        result = []
        for file_id in files_list:
            session_key = f"session:{session_id}:file:{file_id}"
            file_data_json = redis.get(session_key)
            if file_data_json:
                file_data = json.loads(file_data_json)
                result.append(DataFileResponse(
                    id=-int(file_id[:8], 16) if len(file_id) >= 8 else -1,
                    filename=file_data["filename"],
                    original_filename=file_data["original_filename"],
                    file_type=file_data["file_type"],
                    columns=file_data["columns"],
                    data=file_data["data"],
                    created_at=None,
                    updated_at=None
                ))
        return result

@router.get("/{file_id}", response_model=DataFileResponse)
async def get_file(
    file_id: int,
    request: Request,
    db: Session = Depends(get_db),
    redis = Depends(get_redis),
    current_user: Optional[User] = Depends(get_current_user_optional),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """
    Получает данные файла по ID.
    Для авторизованных: из БД.
    Для неавторизованных: из сессии Redis (отрицательный file_id).
    """
    # Если file_id отрицательный, это сессионный файл
    if file_id < 0:
        if current_user:
            raise HTTPException(status_code=404, detail="Файл не найден")
        
        # Получаем session_id
        session_id = None
        if x_session_id:
            session_id = x_session_id
        else:
            session_id = request.cookies.get("session_id")
        
        if not session_id:
            raise HTTPException(status_code=404, detail="Файл не найден")
        
        # Ищем файл в сессии
        session_files_key = f"session:{session_id}:files"
        files_list_json = redis.get(session_files_key)
        if not files_list_json:
            raise HTTPException(status_code=404, detail="Файл не найден")
        
        files_list = json.loads(files_list_json)
        # Ищем файл по отрицательному ID (конвертируем обратно)
        target_file_id = None
        for fid in files_list:
            temp_id = -int(fid[:8], 16) if len(fid) >= 8 else -1
            if temp_id == file_id:
                target_file_id = fid
                break
        
        if not target_file_id:
            raise HTTPException(status_code=404, detail="Файл не найден")
        
        session_key = f"session:{session_id}:file:{target_file_id}"
        file_data_json = redis.get(session_key)
        if not file_data_json:
            raise HTTPException(status_code=404, detail="Файл не найден")
        
        file_data = json.loads(file_data_json)
        return DataFileResponse(
            id=file_id,
            filename=file_data["filename"],
            original_filename=file_data["original_filename"],
            file_type=file_data["file_type"],
            columns=file_data["columns"],
            data=file_data["data"],
            created_at=None,
            updated_at=None
        )
    
    # Положительный ID - файл из БД
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
    # Обновляем имя файла, если указано
    if 'original_filename' in data:
      file.original_filename = data.get('original_filename')
    
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
