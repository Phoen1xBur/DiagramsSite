from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.core.security import verify_password, get_password_hash, create_access_token, decode_access_token
from app.models.user import User, SubscriptionType
from app.models.diagram import DataFile, Diagram
from app.schemas.user import UserCreate, UserResponse, Token, TransferAnonymousDataRequest

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

def get_current_user(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    """Получает текущего пользователя из токена"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Неверные учетные данные",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    if token is None:
        raise credentials_exception
    
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    
    username: str = payload.get("sub")
    if username is None:
        raise credentials_exception
    
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    
    return user

def get_current_user_optional(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Optional[User]:
    """Получает текущего пользователя или None если не авторизован"""
    try:
        if token is None:
            return None
        return get_current_user(token, db)
    except HTTPException:
        return None

@router.post("/register", response_model=UserResponse)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Регистрация нового пользователя"""
    # Проверяем, существует ли пользователь
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким email уже существует"
        )
    
    # Если указан username, проверяем его уникальность
    if user_data.username:
        existing_username = db.query(User).filter(User.username == user_data.username).first()
        if existing_username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Пользователь с таким username уже существует"
            )
    
    # Генерируем username из email, если не указан
    username = user_data.username
    if not username:
        # Берем часть email до @ как username
        username = user_data.email.split('@')[0]
        # Проверяем уникальность
        counter = 1
        original_username = username
        while db.query(User).filter(User.username == username).first():
            username = f"{original_username}{counter}"
            counter += 1
    
    # Создаем нового пользователя
    hashed_password = get_password_hash(user_data.password)
    db_user = User(
        email=user_data.email,
        first_name=user_data.first_name,
        username=username,
        hashed_password=hashed_password,
        is_active=True,
        subscription_type=SubscriptionType.BASIC  # По умолчанию базовая подписка
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    return UserResponse(
        id=db_user.id,
        email=db_user.email,
        first_name=db_user.first_name,
        username=db_user.username,
        is_active=db_user.is_active,
        subscription_type=db_user.subscription_type.value,
        created_at=db_user.created_at
    )

@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """Вход пользователя по email или username"""
    login_identifier = form_data.username  # Может быть email или username
    
    # Пытаемся найти пользователя по email или username
    user = db.query(User).filter(
        (User.email == login_identifier) | (User.username == login_identifier)
    ).first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email/логин или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Пользователь неактивен"
        )
    
    # Создаем токен
    access_token = create_access_token(data={"sub": user.username})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": UserResponse(
            id=user.id,
            email=user.email,
            first_name=user.first_name,
            username=user.username,
            is_active=user.is_active,
            subscription_type=user.subscription_type.value,
            created_at=user.created_at
        )
    }

@router.post("/transfer-anonymous-data")
async def transfer_anonymous_data(
    request: TransferAnonymousDataRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Переносит анонимные данные в аккаунт пользователя"""
    anonymous_file_id = request.anonymous_file_id
    if anonymous_file_id:
        # Переносим конкретный файл
        file = db.query(DataFile).filter(
            DataFile.id == anonymous_file_id,
            DataFile.is_anonymous == True,
            DataFile.user_id == None
        ).first()
        
        if file:
            file.user_id = current_user.id
            file.is_anonymous = False
            
            # Переносим связанные диаграммы
            diagrams = db.query(Diagram).filter(
                Diagram.data_file_id == file.id,
                Diagram.is_anonymous == True
            ).all()
            for diagram in diagrams:
                diagram.user_id = current_user.id
                diagram.is_anonymous = False
            
            db.commit()
            db.refresh(file)
            return {"message": "Данные успешно перенесены", "file_id": file.id}
        else:
            # Файл уже перенесен или не найден
            return {"message": "Файл не найден или уже перенесен", "file_id": None}
    
    # Переносим все анонимные файлы пользователя (если есть временные данные)
    return {"message": "Нет данных для переноса", "file_id": None}

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Получить информацию о текущем пользователе"""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        username=current_user.username,
        is_active=current_user.is_active,
        created_at=current_user.created_at
    )
