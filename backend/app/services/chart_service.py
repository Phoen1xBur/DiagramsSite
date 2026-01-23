import pandas as pd
import plotly.express as px
import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)

COLOR_MAP = {
    'empty': '#E0E0E0',
    'level_25': '#87CEEB',
    'level_50': '#4682B4',
    'level_75': '#1E90FF',
    'level_100': '#00008B'
}

def _get_color_category(pct: float) -> str:
    """Определяет категорию цвета на основе процента"""
    if pct <= 1:  # 0 и 1 считаем пустыми (из-за замены 0->1)
        return 'empty'
    elif pct <= 25:
        return 'level_25'
    elif pct <= 50:
        return 'level_50'
    elif pct <= 75:
        return 'level_75'
    else:
        return 'level_100'

def create_sunburst_chart(
    data: List[Dict],
    columns: List[str],
    hierarchy_cols: List[str],
    value_col: Optional[str] = None,
    use_gradient: bool = True,
    uniform_size: bool = False,
    show_zero_values: bool = True,
    text_along_circumference: bool = False
) -> str:
    """Создает sunburst диаграмму"""
    try:
        if not data:
            return "<p style='color:red'>Нет данных.</p>"
        
        df = pd.DataFrame(data)
        
        # Обработка иерархических столбцов
        for col in hierarchy_cols:
            if col in df.columns:
                df[col] = df[col].astype(str).replace(['nan', 'None', 'NaN'], '').fillna("")
        
        # Обработка столбца значений
        use_value_col = None
        original_values_col = None
        if value_col and value_col in df.columns:
            df[value_col] = df[value_col].replace(['', ' ', 'nan', 'None', 'NaN'], None)
            df[value_col] = pd.to_numeric(df[value_col], errors="coerce").fillna(0)
            
            # Сохраняем оригинальные значения ДО замены 0->1 для отображения в hover
            original_values_col = f'{value_col}_original'
            df[original_values_col] = df[value_col].copy()
            
            # Фильтрация нулевых значений если нужно
            if not show_zero_values:
                df = df[df[value_col] > 0]
            
            # ВАЖНО: Plotly не может отображать сектора с нулевым размером
            # Поэтому заменяем 0 на 1 (минимальное значение для отображения)
            df[value_col] = df[value_col].replace(0, 1)
            use_value_col = value_col
        
        if df.empty:
            return "<p style='color:red'>Нет данных для отображения (все значения нулевые).</p>"
        
        # Настройка цветов для градиента
        color_col, color_map = None, None
        if use_gradient and value_col and original_values_col:
            df['_color_cat'] = df[original_values_col].apply(_get_color_category)
            color_col = '_color_cat'
            color_map = COLOR_MAP
        else:
            color_col = hierarchy_cols[-1] if hierarchy_cols else None
        
        # Создание диаграммы
        fig = px.sunburst(
            df,
            path=hierarchy_cols,
            values=None if uniform_size else use_value_col,
            color=color_col,
            color_discrete_sequence=None if color_map else px.colors.qualitative.Pastel,
            color_discrete_map=color_map,
            custom_data=[original_values_col] if original_values_col else None,
        )
        
        # Настройка hover
        if value_col:
            # Всегда показываем реальные значения из custom_data (где 0 это 0, а не 1)
            if original_values_col:
                hover_template = '<b>%{label}</b><br><b>Путь:</b> %{parent}<br><b>Значение:</b> %{customdata[0]}<br><extra></extra>'
            else:
                hover_template = '<b>%{label}</b><br><b>Путь:</b> %{parent}<br><b>Значение:</b> %{value}<br><extra></extra>'
        else:
            hover_template = '<b>%{label}</b><br><b>Путь:</b> %{parent}<br><extra></extra>'
        
        fig.update_layout(
            hovermode='closest',
            hoverlabel=dict(bgcolor="white", font_size=12, font_family="Arial", namelength=-1, bordercolor="black"),
            margin=dict(t=20, l=20, r=20, b=20),
            font=dict(family="Arial, sans-serif", size=11),
            paper_bgcolor='white',
            plot_bgcolor='white',
            width=900,
            height=900,
            autosize=False,
            # Добавляем поддержку word wrap в тексте диаграммы
            annotations=[],
        )
        
        # Функция для разбиения длинного текста на строки с переносами
        def wrap_text(text, max_length=12):
            """Умный перенос текста с учетом слов - разбиваем на короткие строки для предотвращения уменьшения шрифта"""
            if not text:
                return text
            text_str = str(text)
            # Если текст короткий, возвращаем его как есть
            if len(text_str) <= max_length:
                return text_str
            words = text_str.split()
            lines = []
            current_line = ""
            for word in words:
                # Если слово само по себе длиннее max_length, разбиваем его
                if len(word) > max_length:
                    if current_line:
                        lines.append(current_line)
                        current_line = ""
                    # Разбиваем длинное слово на части
                    for i in range(0, len(word), max_length):
                        lines.append(word[i:i+max_length])
                    current_line = ""
                elif len(current_line) + len(word) + 1 <= max_length:
                    current_line += (" " if current_line else "") + word
                else:
                    if current_line:
                        lines.append(current_line)
                    current_line = word
            if current_line:
                lines.append(current_line)
            # Всегда возвращаем с переносами, если было разбиение
            return "<br>".join(lines) if len(lines) > 1 else text_str
        
        # Определяем ориентацию текста
        if text_along_circumference:
            # Текст вдоль окружности с изгибом
            text_orientation = 'tangential'
            text_font_size = 16  # Фиксированный размер шрифта
        else:
            # Обычная радиальная ориентация
            text_orientation = 'radial'
            text_font_size = 12  # Фиксированный размер шрифта
        
        # ВАЖНО: Применяем переносы ко ВСЕМ текстам длиннее 10 символов
        # Используем более короткие строки (max_length=12), чтобы текст точно помещался
        if hierarchy_cols:
            for col in hierarchy_cols:
                if col in df.columns:
                    # Применяем переносы ко всем текстам длиннее 10 символов
                    df[col] = df[col].apply(lambda x: wrap_text(x, max_length=12) if len(str(x)) > 10 else str(x))
        
        fig.update_traces(
            textinfo="label",  # Только названия на секторах
            hovertemplate=hover_template,
            textfont=dict(size=text_font_size, family="Arial, sans-serif", color="black"),
            insidetextorientation=text_orientation,
            branchvalues='total',
            maxdepth=len(hierarchy_cols),
        )
        
        # Устанавливаем фиксированный размер шрифта, но НЕ скрываем текст
        # Используем mode="show" чтобы показывать весь текст, даже если он не помещается идеально
        fig.update_layout(
            font=dict(family="Arial, sans-serif", size=text_font_size),
            # Показываем весь текст, но с минимальным размером шрифта
            uniformtext=dict(mode="show", minsize=text_font_size),
        )
        
        html = fig.to_html(include_plotlyjs="inline", full_html=True)
        logger.info(f"HTML графика сгенерирован, длина: {len(html)} символов")
        return html
        
    except Exception as e:
        logger.exception("Ошибка построения диаграммы")
        return f"<p style='color:red'>Ошибка: {str(e)}</p>"
