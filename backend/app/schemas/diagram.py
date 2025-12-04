from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class DataFileCreate(BaseModel):
    filename: str
    original_filename: str
    file_type: str
    columns: List[str]
    data: List[dict]

class DataFileResponse(BaseModel):
    id: int
    filename: str
    original_filename: str
    file_type: str
    columns: List[str]
    data: List[dict]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class DiagramCreate(BaseModel):
    data_file_id: int
    name: Optional[str] = None
    hierarchy_columns: List[str]
    value_column: Optional[str] = None
    show_white: bool = True
    use_gradient: bool = True

class DiagramResponse(BaseModel):
    id: int
    data_file_id: int
    name: Optional[str]
    hierarchy_columns: List[str]
    value_column: Optional[str]
    show_white: bool
    use_gradient: bool
    chart_html: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class ChartRequest(BaseModel):
    data: List[dict]
    columns: List[str]
    hierarchy_columns: List[str]
    value_column: Optional[str] = None
    show_white: bool = True
    use_gradient: bool = True

