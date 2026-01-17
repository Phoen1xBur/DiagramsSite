from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class SubscriptionConfigBase(BaseModel):
    subscription_type: str
    max_projects: int = -1  # -1 = безлимит
    max_files_per_project: int = -1
    max_diagrams_per_project: int = -1

class SubscriptionConfigCreate(SubscriptionConfigBase):
    pass

class SubscriptionConfigUpdate(BaseModel):
    max_projects: Optional[int] = None
    max_files_per_project: Optional[int] = None
    max_diagrams_per_project: Optional[int] = None

class SubscriptionConfigResponse(SubscriptionConfigBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
