from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from app.core.database import get_db
from app.models.project import Project
from app.models.user import User, SubscriptionType
from app.models.diagram import DataFile, Diagram
from app.models.subscription_config import SubscriptionConfig
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse, ProjectWithStats
from app.api.v1.auth import get_current_user

router = APIRouter()

def get_subscription_limits(user: User, db: Session):
    """Получает лимиты подписки из конфигурации"""
    config = db.query(SubscriptionConfig).filter(
        SubscriptionConfig.subscription_type == user.subscription_type.value
    ).first()
    
    if not config:
        # Если конфигурация не найдена, используем жесткие ограничения для basic
        if user.subscription_type == SubscriptionType.BASIC:
            return {'max_projects': 1, 'max_files': 3, 'max_diagrams': 10}
        else:
            return {'max_projects': -1, 'max_files': -1, 'max_diagrams': -1}
    
    return {
        'max_projects': config.max_projects,
        'max_files': config.max_files_per_project,
        'max_diagrams': config.max_diagrams_per_project
    }

def check_subscription_limits(user: User, db: Session, project_id: int = None):
    """Проверяет ограничения подписки"""
    limits = get_subscription_limits(user, db)
    
    if limits['max_projects'] == -1:
        # Безлимитная подписка
        return
    
    # Проверяем лимит проектов
    projects_count = db.query(func.count(Project.id)).filter(Project.user_id == user.id).scalar()
    
    if project_id:
        # При обновлении существующего проекта - проверяем, что это единственный проект
        existing_project = db.query(Project).filter(Project.id == project_id, Project.user_id == user.id).first()
        if not existing_project:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Проект не найден или нет доступа"
            )
        # Если обновляем существующий - можно
        return
    
    if projects_count >= limits['max_projects']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Ваша подписка позволяет создать только {limits['max_projects']} проект(ов). Обновите подписку для создания большего количества проектов."
        )

def check_file_limit(user: User, project_id: int, db: Session):
    """Проверяет лимит файлов в проекте"""
    limits = get_subscription_limits(user, db)
    
    if limits['max_files'] == -1:
        # Безлимитная подписка
        return
    
    files_count = db.query(func.count(DataFile.id)).filter(
        DataFile.project_id == project_id
    ).scalar()
    
    if files_count >= limits['max_files']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Ваша подписка позволяет загрузить только {limits['max_files']} файл(ов) на проект. Обновите подписку для загрузки большего количества файлов."
        )

def check_diagram_limit(user: User, project_id: int, db: Session):
    """Проверяет лимит диаграмм в проекте"""
    limits = get_subscription_limits(user, db)
    
    if limits['max_diagrams'] == -1:
        # Безлимитная подписка
        return
    
    diagrams_count = db.query(func.count(Diagram.id)).filter(
        Diagram.project_id == project_id,
        Diagram.user_id == user.id
    ).scalar()
    
    if diagrams_count >= limits['max_diagrams']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Ваша подписка позволяет создать только {limits['max_diagrams']} диаграмм(ы) на проект. Обновите подписку для создания большего количества диаграмм."
        )

@router.post("/", response_model=ProjectResponse)
async def create_project(
    project: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Создает новый проект"""
    # Проверяем ограничения подписки
    check_subscription_limits(current_user, db)
    
    db_project = Project(
        user_id=current_user.id,
        name=project.name,
        description=project.description
    )
    
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    
    return db_project

@router.get("/", response_model=List[ProjectWithStats])
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получает список проектов пользователя"""
    projects = db.query(Project).filter(Project.user_id == current_user.id).order_by(Project.created_at.desc()).all()
    
    result = []
    for project in projects:
        files_count = db.query(func.count(DataFile.id)).filter(DataFile.project_id == project.id).scalar()
        diagrams_count = db.query(func.count(Diagram.id)).filter(Diagram.project_id == project.id).scalar()
        
        result.append(ProjectWithStats(
            id=project.id,
            user_id=project.user_id,
            name=project.name,
            description=project.description,
            created_at=project.created_at,
            updated_at=project.updated_at,
            files_count=files_count,
            diagrams_count=diagrams_count
        ))
    
    return result

@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Получает проект по ID"""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")
    
    return project

@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    project: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Обновляет проект"""
    db_project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not db_project:
        raise HTTPException(status_code=404, detail="Проект не найден")
    
    # Проверяем ограничения (для базовой подписки)
    check_subscription_limits(current_user, db, project_id)
    
    # Обновляем только переданные поля (позволяет явно очистить description при переименовании)
    update_data = project.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_project, key, value)

    db.commit()
    db.refresh(db_project)
    
    return db_project

@router.delete("/{project_id}")
async def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Удаляет проект"""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")
    
    db.delete(project)
    db.commit()
    
    return {"message": "Проект удален"}

