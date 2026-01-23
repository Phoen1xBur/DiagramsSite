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
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class DiagramCreate(BaseModel):
    data_file_id: int
    name: Optional[str] = None
    hierarchy_columns: List[str]
    value_column: Optional[str] = None
    use_gradient: bool = True
    uniform_size: bool = False
    show_zero_values: bool = True
    text_along_circumference: bool = False

class DiagramResponse(BaseModel):
    id: int
    data_file_id: int
    name: Optional[str]
    hierarchy_columns: List[str]
    value_column: Optional[str]
    use_gradient: bool
    uniform_size: bool
    show_zero_values: bool
    text_along_circumference: bool
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
    use_gradient: bool = True
    uniform_size: bool = False
    show_zero_values: bool = True
    text_along_circumference: bool = False

