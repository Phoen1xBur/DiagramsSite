from fastapi import APIRouter, HTTPException
from app.schemas.diagram import ChartRequest
from app.services.chart_service import create_sunburst_chart, build_d3_payload

router = APIRouter()

@router.post("/generate")
async def generate_chart(request: ChartRequest):
    """
    Генерирует HTML диаграммы на основе данных
    """
    try:
        html, chart_size = create_sunburst_chart(
            data=request.data,
            columns=request.columns,
            hierarchy_cols=request.hierarchy_columns,
            value_col=request.value_column,
            use_gradient=request.use_gradient,
            uniform_size=request.uniform_size,
            show_zero_values=request.show_zero_values,
            text_along_circumference=request.text_along_circumference,
            show_full_text=request.show_full_text,
            dynamic_font_size=request.dynamic_font_size,
            column_mapping=request.column_mapping,
            color_map=request.color_map,
        )
        size = chart_size if isinstance(chart_size, int) else 800
        return {"html": html, "chart_width": size, "chart_height": size}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка генерации диаграммы: {str(e)}")


@router.post("/generate-d3")
async def generate_chart_d3(request: ChartRequest):
    """
    Генерирует данные для D3 sunburst диаграммы
    """
    try:
        payload = build_d3_payload(
            data=request.data,
            columns=request.columns,
            hierarchy_cols=request.hierarchy_columns,
            value_col=request.value_column,
            use_gradient=request.use_gradient,
            uniform_size=request.uniform_size,
            show_zero_values=request.show_zero_values,
            text_along_circumference=request.text_along_circumference,
            show_full_text=request.show_full_text,
            dynamic_font_size=request.dynamic_font_size,
            column_mapping=request.column_mapping,
            color_map=request.color_map,
        )
        return payload
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка генерации D3 диаграммы: {str(e)}")

