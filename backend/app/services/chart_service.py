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
        uniform_value_col = None
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

        # Равномерное распределение: подбираем веса так, чтобы все узлы на уровне были равны
        if uniform_size and hierarchy_cols:
            df_for_weights = df.drop_duplicates(subset=hierarchy_cols).copy()
            children_map = {}
            for _, row in df_for_weights.iterrows():
                path = []
                for level in range(len(hierarchy_cols)):
                    parent_key = tuple(path)
                    child = str(row[hierarchy_cols[level]])
                    children_map.setdefault(parent_key, set()).add(child)
                    path.append(child)

            def compute_weight(row):
                weight = 1.0
                path = []
                for level in range(len(hierarchy_cols)):
                    parent_key = tuple(path)
                    child_count = len(children_map.get(parent_key, [])) or 1
                    weight *= 1.0 / child_count
                    path.append(str(row[hierarchy_cols[level]]))
                return weight

            df_for_weights['_uniform_weight'] = df_for_weights.apply(compute_weight, axis=1)
            df = df_for_weights
            uniform_value_col = '_uniform_weight'
            use_value_col = uniform_value_col
        
        if df.empty:
            return "<p style='color:red'>Нет данных для отображения (все значения нулевые).</p>"
        
        # Настройка цветов для градиента
        color_col, color_map = None, None
        if uniform_size:
            # При равномерных секторах градиент по значениям не имеет смысла
            use_gradient = False
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
            values=use_value_col,
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
        
        # Размер диаграммы: базовый + запас для длинных подписей и большого числа лепестков
        max_label_len = 0
        for col in hierarchy_cols:
            if col in df.columns:
                max_label_len = max(max_label_len, df[col].astype(str).map(len).max())
        leaf_count = df.drop_duplicates(subset=hierarchy_cols).shape[0] if hierarchy_cols else len(df)
        base_size = 900
        extra_size = min(700, max(0, (max_label_len - 12) * 8) + max(0, leaf_count - 20) * 5)
        chart_size = base_size + extra_size

        fig.update_layout(
            hovermode='closest',
            hoverlabel=dict(bgcolor="white", font_size=12, font_family="Arial", namelength=-1, bordercolor="black"),
            margin=dict(t=20, l=20, r=20, b=20),
            font=dict(family="Arial, sans-serif", size=11),
            paper_bgcolor='white',
            plot_bgcolor='white',
            width=chart_size,
            height=chart_size,
            autosize=False,
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
            text_font_size = 16
        else:
            # Авто-ориентация лучше центрирует текст внутри лепестка
            text_orientation = 'auto'
            text_font_size = 12
        # Снижаем размер шрифта при большом количестве лепестков
        if leaf_count > 20:
            text_font_size = max(10, text_font_size - int((leaf_count - 20) / 20))

        # Применяем переносы к отображаемому тексту (без изменения данных)
        wrapped_labels = None
        raw_labels = None
        node_colors = None
        if fig.data and len(fig.data) > 0:
            trace = fig.data[0]
            original_labels = list(trace.labels)
            original_parents = list(trace.parents)
            original_ids = list(trace.ids) if getattr(trace, "ids", None) is not None else None
            original_values = list(trace.values) if getattr(trace, "values", None) is not None else None
            raw_labels = original_labels

            # Подготовка данных для оценки доступной ширины текста
            levels_count = max(1, len(hierarchy_cols))
            ring_thickness = (chart_size / 2) / (levels_count + 1)
            char_px = text_font_size * 0.6
            arc_padding_ratio = 0.8

            if original_ids:
                id_to_index = {node_id: idx for idx, node_id in enumerate(original_ids)}
                id_to_parent = {node_id: original_parents[idx] for idx, node_id in enumerate(original_ids)}
                children_map = {}
                for node_id, parent_id in id_to_parent.items():
                    children_map.setdefault(parent_id or '', []).append(node_id)

                id_to_value = {}
                values_match_nodes = original_values and len(original_values) == len(original_ids)
                if values_match_nodes:
                    id_to_value = {node_id: float(original_values[idx]) for idx, node_id in enumerate(original_ids)}
                else:
                    for node_id in original_ids:
                        id_to_value[node_id] = 1.0

                def compute_value(node_id, cache):
                    if node_id in cache:
                        return cache[node_id]
                    children = children_map.get(node_id, [])
                    if not children:
                        cache[node_id] = id_to_value.get(node_id, 1.0)
                        return cache[node_id]
                    total = 0.0
                    for child_id in children:
                        total += compute_value(child_id, cache)
                    cache[node_id] = total if total > 0 else id_to_value.get(node_id, 1.0)
                    return cache[node_id]

                value_cache = {}
                if not values_match_nodes:
                    for node_id in original_ids:
                        compute_value(node_id, value_cache)
                else:
                    value_cache = id_to_value

                root_total = sum(
                    value_cache.get(node_id, 0.0)
                    for node_id in children_map.get('', [])
                ) or 1.0

                def get_depth(node_id):
                    depth = 0
                    parent_id = id_to_parent.get(node_id, '')
                    while parent_id:
                        depth += 1
                        parent_id = id_to_parent.get(parent_id, '')
                    return depth

                def get_root_total():
                    return root_total
            else:
                # Фолбэк без ids
                id_to_index = {idx: idx for idx in range(len(original_labels))}

                def get_depth(_):
                    return 0

                def get_root_total():
                    if original_values:
                        return sum(original_values) or 1.0
                    return len(original_labels) or 1.0

            wrapped_labels = []
            for idx, (label, parent) in enumerate(zip(original_labels, original_parents)):
                label_str = str(label)
                if parent == '' or parent is None:
                    # Центр: рассчитываем ширину центра и переносим по словам
                    center_width = ring_thickness * 2.0 * arc_padding_ratio
                    max_chars = max(3, int(center_width / max(1, char_px)))
                    wrapped_labels.append(wrap_text(label_str, max_length=max_chars))
                    continue

                node_value = 1.0
                if original_ids:
                    node_value = value_cache.get(original_ids[idx], 1.0)
                elif original_values and idx < len(original_values):
                    node_value = float(original_values[idx]) or 1.0
                root_total = get_root_total()
                angle = (node_value / max(1.0, root_total)) * (2 * 3.14159)
                depth = get_depth(original_ids[idx] if original_ids else idx)
                radius = ring_thickness * (depth + 0.5)
                arc_length = angle * radius * arc_padding_ratio
                max_chars = max(3, int(arc_length / max(1, char_px)))
                wrapped_labels.append(wrap_text(label_str, max_length=max_chars))

            # Цвета для всех узлов, чтобы не было серых сегментов
            # Палитра без желтых оттенков
            palette = [
                '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728',
                '#9467bd', '#8c564b', '#e377c2', '#7f7f7f',
                '#17becf', '#2e91e5', '#e15f99', '#1ca71c',
                '#fb0d0d', '#da16ff', '#b68100'
            ]

            def hex_to_rgb(color_value):
                color_str = str(color_value).strip()
                if color_str.startswith('rgb'):
                    rgb_part = color_str[color_str.find('(') + 1:color_str.find(')')]
                    channels = [c.strip() for c in rgb_part.split(',')][:3]
                    return tuple(int(float(c)) for c in channels)
                color_hex = color_str.lstrip('#')
                return tuple(int(color_hex[i:i+2], 16) for i in (0, 2, 4))

            def rgb_to_hex(rgb):
                return '#%02x%02x%02x' % rgb

            def blend_with_white(color_hex, ratio):
                r, g, b = hex_to_rgb(color_hex)
                r = int(r + (255 - r) * ratio)
                g = int(g + (255 - g) * ratio)
                b = int(b + (255 - b) * ratio)
                return rgb_to_hex((r, g, b))

            if original_ids:
                id_to_parent = {node_id: original_parents[idx] for idx, node_id in enumerate(original_ids)}
                id_to_index = {node_id: idx for idx, node_id in enumerate(original_ids)}

                root_nodes = [node_id for node_id in original_ids if id_to_parent.get(node_id, '') in ('', None)]
                root_id = root_nodes[0] if root_nodes else None

                # Уникальные цвета для всех узлов первого уровня (depth == 1)
                level_one_nodes = [node_id for node_id in original_ids if get_depth(node_id) == 1]
                root_color_map = {node_id: palette[i % len(palette)] for i, node_id in enumerate(level_one_nodes)}
                node_colors = [None] * len(original_ids)

                def assign_color(node_id):
                    idx = id_to_index[node_id]
                    if node_colors[idx]:
                        return node_colors[idx]
                    parent_id = id_to_parent.get(node_id, '')
                    if node_id in root_color_map:
                        color = root_color_map[node_id]
                    elif parent_id in root_color_map:
                        color = blend_with_white(root_color_map[parent_id], 0.15)
                    elif parent_id in ('', None):
                        color = root_color_map.get(node_id, palette[0])
                    else:
                        parent_color = assign_color(parent_id)
                        color = blend_with_white(parent_color, 0.15)
                    node_colors[idx] = color
                    return color

                for node_id in original_ids:
                    assign_color(node_id)
            else:
                node_colors = [palette[i % len(palette)] for i in range(len(original_labels))]
        
        fig.update_traces(
            text=wrapped_labels if wrapped_labels else None,
            textinfo="text",
            hovertext=raw_labels if raw_labels else None,
            hovertemplate=hover_template.replace('%{label}', '%{hovertext}') if raw_labels else hover_template,
            textfont=dict(size=text_font_size, family="Arial, sans-serif", color="black"),
            insidetextorientation=text_orientation,
            branchvalues='total',
            sort=False,
            rotation=90,
            maxdepth=len(hierarchy_cols),
        )
        if node_colors:
            fig.update_traces(marker=dict(colors=node_colors))
        
        # Устанавливаем фиксированный размер шрифта, но НЕ скрываем текст
        # Используем mode="show" чтобы показывать весь текст, даже если он не помещается идеально
        fig.update_layout(
            font=dict(family="Arial, sans-serif", size=text_font_size),
            # Пытаемся показывать текст, но уменьшаем при нехватке места
            uniformtext=dict(mode="show", minsize=max(8, text_font_size - 3)),
        )
        
        html = fig.to_html(include_plotlyjs="inline", full_html=True)
        logger.info(f"HTML графика сгенерирован, длина: {len(html)} символов")
        return html
        
    except Exception as e:
        logger.exception("Ошибка построения диаграммы")
        return f"<p style='color:red'>Ошибка: {str(e)}</p>"
