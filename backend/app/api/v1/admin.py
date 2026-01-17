from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from app.core.database import get_db
from app.models.user import User, SubscriptionType
from app.models.project import Project
from app.models.diagram import DataFile, Diagram
from app.schemas.user import UserResponse
from app.api.v1.auth import get_current_admin
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()

class UserStats(BaseModel):
    projects_count: int
    files_count: int
    diagrams_count: int

class UserWithStats(UserResponse):
    stats: UserStats

class UpdateUserSubscription(BaseModel):
    subscription_type: str

@router.get("/users", response_model=List[UserWithStats])
async def get_all_users(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """Получить список всех пользователей со статистикой"""
    users = db.query(User).all()
    
    result = []
    for user in users:
        # Собираем статистику
        projects_count = db.query(func.count(Project.id)).filter(Project.user_id == user.id).scalar()
        files_count = db.query(func.count(DataFile.id)).filter(DataFile.user_id == user.id).scalar()
        diagrams_count = db.query(func.count(Diagram.id)).filter(Diagram.user_id == user.id).scalar()
        
        result.append(UserWithStats(
            id=user.id,
            email=user.email,
            first_name=user.first_name,
            username=user.username,
            is_active=user.is_active,
            is_admin=user.is_admin,
            subscription_type=user.subscription_type.value,
            created_at=user.created_at,
            stats=UserStats(
                projects_count=projects_count,
                files_count=files_count,
                diagrams_count=diagrams_count
            )
        ))
    
    return result

@router.put("/users/{user_id}/subscription", response_model=UserResponse)
async def update_user_subscription(
    user_id: int,
    data: UpdateUserSubscription,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """Обновить подписку пользователя"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    # Проверяем валидность типа подписки
    try:
        subscription_type = SubscriptionType(data.subscription_type)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Неверный тип подписки. Доступные: {[s.value for s in SubscriptionType]}"
        )
    
    user.subscription_type = subscription_type
    db.commit()
    db.refresh(user)
    
    return UserResponse(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        username=user.username,
        is_active=user.is_active,
        is_admin=user.is_admin,
        subscription_type=user.subscription_type.value,
        created_at=user.created_at
    )

@router.put("/users/{user_id}/activate")
async def toggle_user_active(
    user_id: int,
    is_active: bool,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """Активировать/деактивировать пользователя"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    # Запрещаем деактивацию себя
    if user.id == admin.id:
        raise HTTPException(
            status_code=400,
            detail="Нельзя деактивировать собственный аккаунт"
        )
    
    user.is_active = is_active
    db.commit()
    
    return {"message": f"Пользователь {'активирован' if is_active else 'деактивирован'}"}

@router.get("/stats")
async def get_system_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """Получить общую статистику системы"""
    total_users = db.query(func.count(User.id)).scalar()
    active_users = db.query(func.count(User.id)).filter(User.is_active == True).scalar()
    total_projects = db.query(func.count(Project.id)).scalar()
    total_files = db.query(func.count(DataFile.id)).scalar()
    total_diagrams = db.query(func.count(Diagram.id)).scalar()
    
    # Подписки по типам
    subscriptions = {}
    for sub_type in SubscriptionType:
        count = db.query(func.count(User.id)).filter(User.subscription_type == sub_type).scalar()
        subscriptions[sub_type.value] = count
    
    return {
        "total_users": total_users,
        "active_users": active_users,
        "inactive_users": total_users - active_users,
        "total_projects": total_projects,
        "total_files": total_files,
        "total_diagrams": total_diagrams,
        "subscriptions": subscriptions
    }
