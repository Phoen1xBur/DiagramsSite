from fastapi import APIRouter, HTTPException
from app.schemas.diagram import ChartRequest
from app.services.chart_service import create_sunburst_chart

router = APIRouter()

@router.post("/generate")
async def generate_chart(request: ChartRequest):
    """
    Генерирует HTML диаграммы на основе данных
    """
    try:
        html = create_sunburst_chart(
            data=request.data,
            columns=request.columns,
            hierarchy_cols=request.hierarchy_columns,
            value_col=request.value_column,
            use_gradient=request.use_gradient,
            uniform_size=request.uniform_size,
            show_zero_values=request.show_zero_values,
            text_along_circumference=request.text_along_circumference,
            show_full_text=request.show_full_text,
            dynamic_font_size=request.dynamic_font_size
        )
        
        return {"html": html}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка генерации диаграммы: {str(e)}")

