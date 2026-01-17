from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from app.core.database import get_db
from app.models.project import Project
from app.models.user import User, SubscriptionType
from app.models.diagram import DataFile, Diagram
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse, ProjectWithStats
from app.api.v1.auth import get_current_user

router = APIRouter()

def check_subscription_limits(user: User, db: Session, project_id: int = None):
    """Проверяет ограничения подписки"""
    if user.subscription_type == SubscriptionType.BASIC:
        # Базовая подписка: 1 проект максимум
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
        
        if projects_count >= 1:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Базовая подписка позволяет создать только 1 проект. Обновите подписку для создания большего количества проектов."
            )

def check_file_limit(user: User, project_id: int, db: Session):
    """Проверяет лимит файлов в проекте"""
    if user.subscription_type == SubscriptionType.BASIC:
        files_count = db.query(func.count(DataFile.id)).filter(
            DataFile.project_id == project_id
        ).scalar()
        
        if files_count >= 3:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Базовая подписка позволяет загрузить только 3 файла на проект. Обновите подписку для загрузки большего количества файлов."
            )

def check_diagram_limit(user: User, project_id: int, db: Session):
    """Проверяет лимит диаграмм в проекте"""
    if user.subscription_type == SubscriptionType.BASIC:
        diagrams_count = db.query(func.count(Diagram.id)).filter(
            Diagram.project_id == project_id,
            Diagram.user_id == user.id
        ).scalar()
        
        if diagrams_count >= 10:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Базовая подписка позволяет создать только 10 диаграмм на проект. Обновите подписку для создания большего количества диаграмм."
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
    
    if project.name is not None:
        db_project.name = project.name
    if project.description is not None:
        db_project.description = project.description
    
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

