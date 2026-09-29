from pydantic import BaseModel
from typing import List, Optional, Dict
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
    show_full_text: bool = False
    dynamic_font_size: bool = False

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
    show_full_text: bool
    dynamic_font_size: bool
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
    show_full_text: bool = False
    dynamic_font_size: bool = False
    # L1 sector name -> hex color overrides (session/API; not a DB column)
    color_map: Optional[Dict[str, str]] = None
    # canonical_name -> actual_name в данных; для совместимости диаграмм при переименовании столбцов
    column_mapping: Optional[Dict[str, str]] = None

