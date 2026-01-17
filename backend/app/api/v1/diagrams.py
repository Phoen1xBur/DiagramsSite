from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.core.redis_client import get_redis
from app.models.diagram import Diagram, DataFile
from app.models.user import User
from app.models.project import Project
from app.schemas.diagram import DiagramCreate, DiagramResponse
from app.services.chart_service import create_sunburst_chart
from app.api.v1.auth import get_current_user_optional

router = APIRouter()

@router.post("/", response_model=DiagramResponse)
async def create_diagram(
    diagram: DiagramCreate,
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    redis = Depends(get_redis),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Создает диаграмму и сохраняет в БД
    """
    # Проверяем существование файла
    data_file = db.query(DataFile).filter(DataFile.id == diagram.data_file_id).first()
    if not data_file:
        raise HTTPException(status_code=404, detail="Файл данных не найден")
    
    # Если указан project_id, проверяем права доступа
    if project_id and current_user:
        project = db.query(Project).filter(
            Project.id == project_id,
            Project.user_id == current_user.id
        ).first()
        if not project:
            raise HTTPException(status_code=404, detail="Проект не найден")
    
    # Генерируем HTML диаграммы
    chart_html = create_sunburst_chart(
        data=data_file.data,
        columns=data_file.columns,
        hierarchy_cols=diagram.hierarchy_columns,
        value_col=diagram.value_column,
        use_gradient=diagram.use_gradient,
        uniform_size=diagram.uniform_size,
        show_zero_values=diagram.show_zero_values
    )
    
    # Создаем диаграмму
    db_diagram = Diagram(
        data_file_id=diagram.data_file_id,
        name=diagram.name,
        hierarchy_columns=diagram.hierarchy_columns,
        value_column=diagram.value_column,
        use_gradient=1 if diagram.use_gradient else 0,
        uniform_size=1 if diagram.uniform_size else 0,
        show_zero_values=1 if diagram.show_zero_values else 0,
        chart_html=chart_html,
        user_id=current_user.id if current_user else None,
        project_id=project_id if project_id else (data_file.project_id if data_file.project_id else None),
        is_anonymous=current_user is None
    )
    
    db.add(db_diagram)
    db.commit()
    db.refresh(db_diagram)
    
    # Кэшируем в Redis
    redis_key = f"diagram:{db_diagram.id}"
    redis.setex(redis_key, 3600, str(db_diagram.id))
    
    return DiagramResponse(
        id=db_diagram.id,
        data_file_id=db_diagram.data_file_id,
        name=db_diagram.name,
        hierarchy_columns=db_diagram.hierarchy_columns,
        value_column=db_diagram.value_column,
        use_gradient=bool(db_diagram.use_gradient),
        uniform_size=bool(db_diagram.uniform_size),
        show_zero_values=bool(db_diagram.show_zero_values),
        chart_html=db_diagram.chart_html,
        created_at=db_diagram.created_at,
        updated_at=db_diagram.updated_at
    )

@router.get("/", response_model=List[DiagramResponse])
async def list_diagrams(
    project_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Получает список диаграмм пользователя или проекта
    """
    if current_user:
        query = db.query(Diagram).filter(Diagram.user_id == current_user.id)
        if project_id:
            query = query.filter(Diagram.project_id == project_id)
        diagrams = query.order_by(Diagram.created_at.desc()).all()
    else:
        # Для неавторизованных пользователей возвращаем пустой список
        diagrams = []
    return [
        DiagramResponse(
            id=d.id,
            data_file_id=d.data_file_id,
            name=d.name,
            hierarchy_columns=d.hierarchy_columns,
            value_column=d.value_column,
            use_gradient=bool(d.use_gradient),
            uniform_size=bool(d.uniform_size),
            show_zero_values=bool(d.show_zero_values),
            chart_html=d.chart_html,
            created_at=d.created_at,
            updated_at=d.updated_at
        )
        for d in diagrams
    ]

@router.get("/{diagram_id}", response_model=DiagramResponse)
async def get_diagram(
    diagram_id: int,
    db: Session = Depends(get_db),
    redis = Depends(get_redis),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Получает диаграмму по ID
    """
    # Проверяем кэш
    redis_key = f"diagram:{diagram_id}"
    cached = redis.get(redis_key)
    
    diagram = db.query(Diagram).filter(Diagram.id == diagram_id).first()
    if not diagram:
        raise HTTPException(status_code=404, detail="Диаграмма не найдена")
    
    # Проверяем права доступа
    if diagram.user_id and (not current_user or diagram.user_id != current_user.id):
        raise HTTPException(status_code=403, detail="Нет доступа к этой диаграмме")
    
    return DiagramResponse(
        id=diagram.id,
        data_file_id=diagram.data_file_id,
        name=diagram.name,
        hierarchy_columns=diagram.hierarchy_columns,
        value_column=diagram.value_column,
        use_gradient=bool(diagram.use_gradient),
        uniform_size=bool(diagram.uniform_size),
        show_zero_values=bool(diagram.show_zero_values),
        chart_html=diagram.chart_html,
        created_at=diagram.created_at,
        updated_at=diagram.updated_at
    )

@router.put("/{diagram_id}", response_model=DiagramResponse)
async def update_diagram(
    diagram_id: int,
    diagram: DiagramCreate,
    db: Session = Depends(get_db),
    redis = Depends(get_redis),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Обновляет диаграмму
    """
    db_diagram = db.query(Diagram).filter(Diagram.id == diagram_id).first()
    if not db_diagram:
        raise HTTPException(status_code=404, detail="Диаграмма не найдена")
    
    # Проверяем права доступа
    if db_diagram.user_id and (not current_user or db_diagram.user_id != current_user.id):
        raise HTTPException(status_code=403, detail="Нет доступа к этой диаграмме")
    
    # Проверяем существование файла
    data_file = db.query(DataFile).filter(DataFile.id == diagram.data_file_id).first()
    if not data_file:
        raise HTTPException(status_code=404, detail="Файл данных не найден")
    
    # Регенерируем HTML
    chart_html = create_sunburst_chart(
        data=data_file.data,
        columns=data_file.columns,
        hierarchy_cols=diagram.hierarchy_columns,
        value_col=diagram.value_column,
        use_gradient=diagram.use_gradient,
        uniform_size=diagram.uniform_size,
        show_zero_values=diagram.show_zero_values
    )
    
    # Обновляем диаграмму
    db_diagram.data_file_id = diagram.data_file_id
    db_diagram.name = diagram.name
    db_diagram.hierarchy_columns = diagram.hierarchy_columns
    db_diagram.value_column = diagram.value_column
    db_diagram.use_gradient = 1 if diagram.use_gradient else 0
    db_diagram.uniform_size = 1 if diagram.uniform_size else 0
    db_diagram.show_zero_values = 1 if diagram.show_zero_values else 0
    db_diagram.chart_html = chart_html
    # Обновляем user_id если пользователь авторизовался
    if current_user:
        db_diagram.user_id = current_user.id
        db_diagram.is_anonymous = False
    
    db.commit()
    db.refresh(db_diagram)
    
    # Обновляем кэш
    redis_key = f"diagram:{db_diagram.id}"
    redis.setex(redis_key, 3600, str(db_diagram.id))
    
    return DiagramResponse(
        id=db_diagram.id,
        data_file_id=db_diagram.data_file_id,
        name=db_diagram.name,
        hierarchy_columns=db_diagram.hierarchy_columns,
        value_column=db_diagram.value_column,
        use_gradient=bool(db_diagram.use_gradient),
        uniform_size=bool(db_diagram.uniform_size),
        show_zero_values=bool(db_diagram.show_zero_values),
        chart_html=db_diagram.chart_html,
        created_at=db_diagram.created_at,
        updated_at=db_diagram.updated_at
    )

@router.delete("/{diagram_id}")
async def delete_diagram(
    diagram_id: int,
    db: Session = Depends(get_db),
    redis = Depends(get_redis),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Удаляет диаграмму
    """
    diagram = db.query(Diagram).filter(Diagram.id == diagram_id).first()
    if not diagram:
        raise HTTPException(status_code=404, detail="Диаграмма не найдена")
    
    # Проверяем права доступа
    if diagram.user_id and (not current_user or diagram.user_id != current_user.id):
        raise HTTPException(status_code=403, detail="Нет доступа к этой диаграмме")
    
    # Удаляем из кэша
    redis_key = f"diagram:{diagram_id}"
    redis.delete(redis_key)
    
    db.delete(diagram)
    db.commit()
    
    return {"message": "Диаграмма удалена"}

