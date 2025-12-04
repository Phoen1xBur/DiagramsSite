import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

def create_sunburst_chart(
    data: List[Dict],
    columns: List[str],
    hierarchy_cols: List[str],
    value_col: Optional[str] = None,
    show_white: bool = True,
    use_gradient: bool = True
) -> str:
    """
    Создает sunburst диаграмму на основе данных
    """
    try:
        if not data or len(data) == 0:
            return "<p style='color:red'>Нет данных.</p>"
        
        df = pd.DataFrame(data)
        
        # Обработка столбца значений
        has_percentage = False
        if value_col and value_col in df.columns:
            df[value_col] = pd.to_numeric(df[value_col], errors="coerce")
            has_percentage = True

        # Приводим всё к строкам и обрабатываем пустые значения
        for col in hierarchy_cols:
            if col in df.columns:
                df[col] = df[col].astype(str).replace(['nan', 'None', 'NaN'], '').fillna("")

        # Создаем столбец для цветов на основе процента выполнения
        if use_gradient and value_col and has_percentage:
            def get_color_category(row):
                pct = row.get(value_col, 0)
                if pd.isna(pct) or pct == 0 or pct == "":
                    return 'white' if show_white else 'empty'
                
                if pct <= 25:
                    return 'level_25'
                elif pct <= 50:
                    return 'level_50'
                elif pct <= 75:
                    return 'level_75'
                else:
                    return 'level_100'
            
            df['_color_cat'] = df.apply(get_color_category, axis=1)
            color_col = '_color_cat'
            
            color_map = {
                'white': '#FFFFFF',
                'empty': '#E0E0E0',
                'level_25': '#87CEEB',
                'level_50': '#4682B4',
                'level_75': '#1E90FF',
                'level_100': '#00008B'
            }
        else:
            color_col = hierarchy_cols[-1] if hierarchy_cols else None
            color_map = None

        # Создаем sunburst диаграмму
        fig = px.sunburst(
            df,
            path=hierarchy_cols,
            values=value_col if value_col else None,
            color=color_col if use_gradient and value_col and has_percentage else (hierarchy_cols[-1] if hierarchy_cols else None),
            color_discrete_sequence=px.colors.qualitative.Pastel if not (use_gradient and value_col and has_percentage) else None,
            color_discrete_map=color_map if color_map else None,
        )
        
        # Дополнительная обработка для белых секторов
        if show_white and value_col:
            for trace in fig.data:
                if hasattr(trace, 'marker') and hasattr(trace.marker, 'colors'):
                    if hasattr(trace, 'ids'):
                        for i, id_val in enumerate(trace.ids):
                            mask = df.apply(lambda row: '/'.join([str(row[c]) for c in hierarchy_cols]) == id_val, axis=1)
                            if mask.any():
                                row_data = df[mask].iloc[0]
                                pct_val = row_data.get(value_col, 0) if value_col else None
                                if pd.isna(pct_val) or pct_val == 0 or pct_val == "":
                                    if i < len(trace.marker.colors):
                                        trace.marker.colors[i] = '#FFFFFF'
        
        # Настраиваем отображение текста
        if value_col:
            hover_template = '<b>%{label}</b><br>' + \
                           '<b>Путь:</b><br>%{parent}<br>' + \
                           '<b>Значение:</b> %{value}<br>' + \
                           '<extra></extra>'
        else:
            hover_template = '<b>%{label}</b><br>' + \
                           '<b>Путь:</b><br>%{parent}<br>' + \
                           '<extra></extra>'
        
        fig.update_layout(
            hovermode='closest',
            hoverlabel=dict(
                bgcolor="white",
                font_size=12,
                font_family="Arial",
                namelength=-1,
                bordercolor="black"
            )
        )
        
        fig.update_traces(
            textinfo="label",
            hovertemplate=hover_template,
            textfont=dict(size=11, family="Arial, sans-serif"),
            insidetextorientation='radial',
            branchvalues='total',
            maxdepth=len(hierarchy_cols),
        )
        
        fig.update_layout(
            margin=dict(t=20, l=20, r=20, b=20),
            font=dict(family="Arial, sans-serif", size=11),
            paper_bgcolor='white',
            plot_bgcolor='white',
            width=900,
            height=900,
            autosize=False,
        )
        
        # Генерируем HTML
        html = fig.to_html(include_plotlyjs="inline", full_html=True)
        
        logger.info(f"HTML графика сгенерирован, длина: {len(html)} символов")
        return html
        
    except Exception as e:
        logger.exception("Ошибка построения диаграммы")
        return f"<p style='color:red'>Ошибка: {str(e)}</p>"

