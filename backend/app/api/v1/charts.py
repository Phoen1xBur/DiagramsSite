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
            show_white=request.show_white,
            use_gradient=request.use_gradient
        )
        
        return {"html": html}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка генерации диаграммы: {str(e)}")

