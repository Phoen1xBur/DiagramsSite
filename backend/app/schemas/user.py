from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class UserCreate(BaseModel):
    email: EmailStr
    first_name: str  # Имя пользователя
    password: str
    username: Optional[str] = None  # Опциональный никнейм

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    first_name: str
    username: Optional[str] = None
    is_active: bool
    subscription_type: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class TransferAnonymousDataRequest(BaseModel):
    anonymous_file_id: Optional[int] = None
