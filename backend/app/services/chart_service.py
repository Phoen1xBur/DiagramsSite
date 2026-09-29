import math
import re
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


def _is_blank_hierarchy_value(val) -> bool:
    """True for empty / missing hierarchy cells (do not turn these into N/A nodes)."""
    if val is None:
        return True
    try:
        if isinstance(val, float) and math.isnan(val):
            return True
    except Exception:
        pass
    try:
        if pd.isna(val):
            return True
    except Exception:
        pass
    s = str(val).strip().lower()
    return s in ("", "nan", "none", "nat", "n/a", "na", "<na>")


def _clean_hierarchy_cell(val):
    """Return stripped label or None when the cell should terminate the branch."""
    if _is_blank_hierarchy_value(val):
        return None
    return str(val).strip()


# Visible only when an intermediate hierarchy column is blank but a deeper
# column still has a value. Preserves ring depth without an N/A flood on
# terminal blanks. Plotly forbids empty-string parents with non-empty children.
HIERARCHY_GAP_PLACEHOLDER = "\u2014"  # em dash


def _truncate_hierarchy_paths(df, hierarchy_cols):
    """Normalize hierarchy cells for sunburst paths.

    Rules:
    - Trim whitespace/tabs on every cell.
    - Terminal blanks (nothing filled after): null that cell and every deeper
      level (no synthetic N/A leaves).
    - Mid-gap blanks (a later hierarchy column is filled): keep depth by
      inserting HIERARCHY_GAP_PLACEHOLDER so later values are not wiped and do
      not collapse onto a shallower ring. Column order may put e.g. Задачи
      before Ценности Направления; blank Задачи must not erase a filled
      Ценности Направления.
    """
    cols = [c for c in (hierarchy_cols or []) if c in getattr(df, "columns", [])]
    if not cols or df is None or getattr(df, "empty", True):
        return df

    df = df.copy()
    for idx in list(df.index):
        cleaned = [_clean_hierarchy_cell(df.at[idx, col]) for col in cols]
        last_filled = -1
        for i, val in enumerate(cleaned):
            if val is not None:
                last_filled = i
        if last_filled < 0:
            for col in cols:
                df.at[idx, col] = None
            continue
        for i, col in enumerate(cols):
            if i > last_filled:
                df.at[idx, col] = None
            elif cleaned[i] is None:
                df.at[idx, col] = HIERARCHY_GAP_PLACEHOLDER
            else:
                df.at[idx, col] = cleaned[i]
    df = df[df[cols[0]].notna()].copy()
    return df.reset_index(drop=True)


def _hierarchy_path_tuple(row, cols):
    """Filled hierarchy labels in order (stops at first blank/null)."""
    parts = []
    for col in cols:
        val = row[col]
        if _is_blank_hierarchy_value(val):
            break
        parts.append(str(val))
    return tuple(parts)


def _drop_non_leaf_hierarchy_rows(df, hierarchy_cols):
    """Plotly requires every sunburst path row to be a leaf.

    Drop any row whose filled path is a strict prefix of another kept row.
    Rows that truly stop (no deeper sibling under the same prefix) stay and
    render as shorter branches. Uses path tuples (not string startswith) so
    labels like 'AB'+'C' vs 'A'+'BC' cannot false-match.

    Also removes rows that would fail Plotly's concat-substring leaf check
    (separator='' after null→''), which is stricter than pure path-prefix.
    """
    cols = [c for c in (hierarchy_cols or []) if c in getattr(df, "columns", [])]
    if not cols or df is None or df.empty:
        return df

    df = df.copy().reset_index(drop=True)
    paths = [_hierarchy_path_tuple(row, cols) for _, row in df.iterrows()]

    keep_mask = []
    for path in paths:
        is_prefix = any(
            len(other) > len(path) and other[: len(path)] == path
            for other in paths
        )
        keep_mask.append(not is_prefix)

    out = df.loc[keep_mask].reset_index(drop=True)
    if out.empty:
        return out

    # Plotly _check_dataframe_all_leaves: after sorting, if a null-padded row's
    # concat is a substring of another row's concat, it raises Non-leaves.
    def _concat_key(row):
        bits = []
        for col in cols:
            val = row[col]
            bits.append("" if _is_blank_hierarchy_value(val) else str(val))
        return "".join(bits)

    keys = [_concat_key(row) for _, row in out.iterrows()]
    has_null = [
        any(_is_blank_hierarchy_value(row[col]) for col in cols)
        for _, row in out.iterrows()
    ]
    keep2 = []
    for i, key in enumerate(keys):
        bad = False
        if has_null[i] and key:
            for j, other in enumerate(keys):
                if i == j or not other or key == other:
                    continue
                if key in other:
                    bad = True
                    break
        keep2.append(not bad)

    return out.loc[keep2].reset_index(drop=True)


def _wrap_hover_text(text, max_chars=48) -> str:
    """Insert <br> so Plotly/D3 hover tooltips wrap instead of one endless line."""
    s = str(text or "").strip()
    if not s:
        return s
    # Keep existing breaks; wrap long segments.
    parts = re.split(r"(<br\s*/?>)", s, flags=re.IGNORECASE)
    out = []
    for part in parts:
        if re.match(r"<br\s*/?>", part or "", flags=re.IGNORECASE):
            out.append("<br>")
            continue
        words = part.split()
        if not words:
            out.append(part)
            continue
        line = ""
        for w in words:
            trial = f"{line} {w}".strip()
            if len(trial) <= max_chars:
                line = trial
            else:
                if line:
                    out.append(line)
                if len(w) > max_chars:
                    for i in range(0, len(w), max_chars):
                        out.append(w[i:i + max_chars])
                    line = ""
                else:
                    line = w
        if line:
            out.append(line)
    return "<br>".join(out)


def create_sunburst_chart(
    data: List[Dict],
    columns: List[str],
    hierarchy_cols: List[str],
    value_col: Optional[str] = None,
    use_gradient: bool = True,
    uniform_size: bool = False,
    show_zero_values: bool = True,
    text_along_circumference: bool = False,
    show_full_text: bool = False,
    dynamic_font_size: bool = False,
    column_mapping: Optional[Dict[str, str]] = None,
    color_map: Optional[Dict[str, str]] = None,
) -> tuple:
    """Создает sunburst диаграмму. Возвращает (html, chart_size). column_mapping: canonical_name -> actual_name в данных."""
    try:
        if not data:
            return "<p style='color:red'>Нет данных.</p>", 800
        
        df = pd.DataFrame(data)
        # Применяем маппинг: переименовываем столбцы из «фактических» в «канонические», чтобы диаграммы не ломались
        if column_mapping:
            rename = {actual: canonical for canonical, actual in column_mapping.items() if actual in df.columns}
            if rename:
                df = df.rename(columns=rename)
        actual_columns = list(df.columns)

        # Проверка: все столбцы иерархии и столбец значений должны существовать в данных
        missing_hierarchy = [c for c in (hierarchy_cols or []) if c not in df.columns]
        value_col_missing = value_col and value_col not in df.columns
        if missing_hierarchy or value_col_missing:
            expected = list(set((hierarchy_cols or []) + ([value_col] if value_col else [])))
            received = actual_columns
            msg = (
                "Структура таблицы не совпадает с настройками диаграммы. "
                "Диаграмма настроена на столбцы, которых нет в этой таблице (например, после импорта файла от другого пользователя). "
                "Создайте новую диаграмму для этого файла и выберите столбцы из вашей таблицы."
            )
            detail = f"В настройках диаграммы: {expected}. В вашей таблице: {received}."
            return (
                f"<div style='padding:16px; max-width:560px; margin:0 auto; border:1px solid #f0ad4e; border-radius:8px; "
                f"background:#fffbf0; color:#333;'>"
                f"<p style='margin:0 0 12px 0; font-weight:600;'>Ошибка: {msg}</p>"
                f"<p style='margin:0; font-size:14px; color:#666;'>{detail}</p>"
                f"</div>",
                800,
            )

        # Clean hierarchy cells: blank/NaN terminate the branch (no synthetic N/A sectors).
        df = _truncate_hierarchy_paths(df, hierarchy_cols)
        
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
                    raw = row[hierarchy_cols[level]]
                    child = _clean_hierarchy_cell(raw)
                    if child is None:
                        break
                    parent_key = tuple(path)
                    children_map.setdefault(parent_key, set()).add(child)
                    path.append(child)

            def compute_weight(row):
                weight = 1.0
                path = []
                for level in range(len(hierarchy_cols)):
                    raw = row[hierarchy_cols[level]]
                    child = _clean_hierarchy_cell(raw)
                    if child is None:
                        break
                    parent_key = tuple(path)
                    child_count = len(children_map.get(parent_key, [])) or 1
                    weight *= 1.0 / child_count
                    path.append(child)
                return weight

            df_for_weights['_uniform_weight'] = df_for_weights.apply(compute_weight, axis=1)
            df = df_for_weights
            uniform_value_col = '_uniform_weight'
            use_value_col = uniform_value_col
        
        if df.empty:
            return "<p style='color:red'>Нет данных для отображения (все значения нулевые).</p>", 800
        
        # User L1 color overrides (must NOT be wiped — previous bug set color_map=None).
        user_color_map = dict(color_map or {})
        # "use_gradient" UI means depth lightening of nested sectors, NOT value buckets.
        depth_gradient = bool(use_gradient)
        # px.sunburst still needs a color column; final fills come from user_color_map + depth blend.
        color_col = hierarchy_cols[-1] if hierarchy_cols else None
        
        # Определяем режим суммирования значений
        # Используем total, так как значения заданы только для листьев
        branchvalues_mode = 'total'

        # Создание диаграммы
        df = _drop_non_leaf_hierarchy_rows(df, hierarchy_cols)
        if df.empty:
            return "<p style='color:red'>No data to display.</p>", 800

        # Reverse row order so Plotly's native CCW layout reads clockwise
        # from 12:00 in the same order as the table (top → bottom).
        df_plot = df.iloc[::-1].reset_index(drop=True)

        fig = px.sunburst(
            df_plot,
            path=hierarchy_cols,
            values=use_value_col,
            color=color_col,
            color_discrete_sequence=px.colors.qualitative.Pastel,
            color_discrete_map=None,
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
        
        # Количество уровней иерархии (колец)
        levels_count = max(1, len(hierarchy_cols))
        
        # Количество уникальных листовых узлов (конечных лепестков)
        leaf_count = df.drop_duplicates(subset=hierarchy_cols).shape[0] if hierarchy_cols else len(df)
        
        # Функция для разбиения длинного текста на строки с переносами
        def wrap_text(text, max_length=12):
            """Умный перенос текста с учетом слов"""
            if not text:
                return text
            text_str = str(text)
            if len(text_str) <= max_length:
                return text_str
            words = text_str.split()
            lines = []
            current_line = ""
            for word in words:
                if len(word) > max_length:
                    if current_line:
                        lines.append(current_line)
                        current_line = ""
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
            return "<br>".join(lines) if len(lines) > 1 else text_str
        
        def count_lines(text):
            """Считает количество строк в тексте с <br>"""
            if not text:
                return 1
            return text.count("<br>") + 1
        
        def truncate_text(text, max_lines):
            """Обрезает текст до max_lines строк, добавляя '...' если обрезано"""
            if not text or max_lines < 1:
                return text
            lines = text.split("<br>")
            if len(lines) <= max_lines:
                return text
            # Берём первые max_lines-1 строк и добавляем последнюю обрезанную с "..."
            truncated_lines = lines[:max_lines]
            # Укорачиваем последнюю строку и добавляем "..."
            last_line = truncated_lines[-1]
            if len(last_line) > 3:
                truncated_lines[-1] = last_line[:-3] + "..."
            else:
                truncated_lines[-1] = "..."
            return "<br>".join(truncated_lines)
        
        # === НАСТРОЙКА ШРИФТА ===
        FONT_SIZE_BASE = 22                 # Базовый размер шрифта
        LINE_HEIGHT_RATIO = 1.3             # Межстрочный интервал
        
        # Ширина символа относительно размера шрифта
        # Для кириллицы в Arial средняя ширина ~0.35-0.4 от размера шрифта
        CHAR_WIDTH_RATIO = 0.35
        
        # Текст занимает 98% ширины лепестка (по 1% отступ с каждой стороны)
        # Plotly сам добавит небольшие отступы при рендеринге
        TEXT_FILL_RATIO = 0.85  # leave margin so labels sit nearer slice center
        
        text_font_size = FONT_SIZE_BASE
        char_px = text_font_size * CHAR_WIDTH_RATIO  # Ширина одного символа в пикселях
        
        # Для обычного режима используем горизонтальную ориентацию.
        # Для режима "по окружности" включаем tangential.
        text_orientation = 'tangential' if text_along_circumference else 'horizontal'

        # === ШАГ 1: Определяем базовый размер диаграммы ===
        # Минимальная толщина кольца в пикселях
        MIN_RING_THICKNESS = 80
        
        # Базовый размер = количество колец * минимальная толщина * 2 (диаметр)
        base_chart_size = (levels_count + 1) * MIN_RING_THICKNESS * 2
        
        # Добавляем размер в зависимости от количества лепестков (больше лепестков = нужны длиннее дуги)
        extra_for_leaves = min(960, leaf_count * 12)
        
        chart_size = max(800, base_chart_size + extra_for_leaves)
        
        # Толщина одного кольца
        ring_thickness = chart_size / 2 / (levels_count + 1)

        # === ШАГ 2: Получаем данные из графика и рассчитываем переносы ===
        wrapped_labels = None
        raw_labels = None
        node_colors = None
        max_lines_per_level = {}  # {level: max_lines}
        
        if fig.data and len(fig.data) > 0:
            trace = fig.data[0]
            original_labels = list(trace.labels)
            original_parents = list(trace.parents)
            original_ids = list(trace.ids) if getattr(trace, "ids", None) is not None else None
            original_values = list(trace.values) if getattr(trace, "values", None) is not None else None
            raw_labels = original_labels

            # Строим карты для навигации по дереву
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

                def get_node_value(node_id):
                    return value_cache.get(node_id, 1.0)
            else:
                id_to_index = {idx: idx for idx in range(len(original_labels))}
                root_total = sum(original_values) if original_values else len(original_labels) or 1.0

                def get_depth(_):
                    return 0

                def get_node_value(idx):
                    if original_values and idx < len(original_values):
                        return float(original_values[idx]) or 1.0
                    return 1.0

            # Рассчитываем переносы для каждого узла на основе длины дуги в пикселях
            wrapped_labels = []
            node_depths = []
            
            for idx, (label, parent) in enumerate(zip(original_labels, original_parents)):
                label_str = str(label)
                
                if parent == '' or parent is None:
                    # Корневой узел (центр) - диаметр центра примерно = ring_thickness
                    # Keep center title balanced (e.g. long Russian root labels).
                    center_width = ring_thickness * 1.6 * TEXT_FILL_RATIO
                    max_chars = max(10, min(22, int(center_width / char_px)))
                    depth = 0
                else:
                    # Рассчитываем длину дуги для этого сектора
                    if original_ids:
                        node_value = get_node_value(original_ids[idx])
                        depth = get_depth(original_ids[idx])
                    else:
                        node_value = get_node_value(idx)
                        depth = 0
                    
                    # Доля сектора от полного круга
                    sector_fraction = node_value / max(1.0, root_total)
                    
                    # Угол сектора в радианах
                    sector_angle = sector_fraction * 2 * math.pi
                    
                    # Радиус до середины кольца на этой глубине
                    radius_to_middle = ring_thickness * (depth + 0.5)
                    
                    # Длина дуги в пикселях (на середине кольца)
                    arc_length = sector_angle * radius_to_middle * TEXT_FILL_RATIO
                    
                    # Максимальное количество символов в строке
                    # Минимум 12 символов, чтобы короткие слова не разбивались
                    max_chars = max(12, int(arc_length / char_px))
                
                wrapped = wrap_text(label_str, max_length=max_chars)
                wrapped_labels.append(wrapped)
                node_depths.append(depth)
                
                # Считаем максимальное количество строк на каждом уровне
                lines = count_lines(wrapped)
                if depth not in max_lines_per_level:
                    max_lines_per_level[depth] = lines
                else:
                    max_lines_per_level[depth] = max(max_lines_per_level[depth], lines)

        # === ШАГ 3: Обработка текста в зависимости от режима ===
        RING_PADDING = 10  # Отступ сверху и снизу от текста в пикселях
        FONT_SIZE_MIN = 12  # Минимальный размер шрифта
        FONT_SIZE_MAX = 28  # Cap so short labels (N/A, Участники) do not blow up
        
        # Массив размеров шрифта для каждого сектора (динамический размер)
        font_sizes = []
        
        # Always keep labels readable: truncate/ellipsis when text cannot fit the sector.
        # "show_full_text" only allows a bit more room / more lines — never unlimited overflow.
        min_line_height = FONT_SIZE_MIN * LINE_HEIGHT_RATIO
        if show_full_text:
            MAX_FULL_TEXT_SIZE = 2200
            max_lines_any_level = max(max_lines_per_level.values()) if max_lines_per_level else 1
            line_height_px = text_font_size * LINE_HEIGHT_RATIO
            # Cap how many lines we try to honor so one long label cannot explode the chart.
            capped_lines = min(max_lines_any_level, 4)
            needed_thickness = capped_lines * line_height_px + RING_PADDING * 2
            needed_chart_size = int(needed_thickness * (levels_count + 1) * 2 + 40)
            chart_size = min(max(chart_size, needed_chart_size), MAX_FULL_TEXT_SIZE)
            ring_thickness = chart_size / 2 / (levels_count + 1)
            available_height = ring_thickness - RING_PADDING * 2
            if capped_lines * line_height_px > available_height > 0:
                needed_line_height = available_height / capped_lines
                text_font_size = max(FONT_SIZE_MIN, int(needed_line_height / LINE_HEIGHT_RATIO))
            max_lines_fit = max(2, min(4, int((ring_thickness - RING_PADDING * 2) / min_line_height)))
        else:
            max_lines_fit = int((ring_thickness - RING_PADDING * 2) / min_line_height)
            max_lines_fit = max(2, max_lines_fit)

        if wrapped_labels:
            for idx in range(len(wrapped_labels)):
                lines = count_lines(wrapped_labels[idx])
                if lines > max_lines_fit:
                    wrapped_labels[idx] = truncate_text(wrapped_labels[idx], max_lines_fit)

        # === ШАГ 4: Рассчитываем динамический размер шрифта для каждого сектора ===
        if dynamic_font_size:
            # Коэффициент для расчёта размера шрифта (меньше чем LINE_HEIGHT_RATIO, 
            # т.к. Plotly эффективнее использует пространство)
            FONT_CALC_RATIO = 1.1
            
            if wrapped_labels and node_depths:
                for idx, wrapped in enumerate(wrapped_labels):
                    lines = count_lines(wrapped)
                    depth = node_depths[idx] if idx < len(node_depths) else 0
                    
                    # Доступная высота зависит от глубины узла
                    # Внутренние кольца (ближе к центру) имеют больше вертикального пространства
                    if depth == 0:
                        # Центральный круг - используем всю высоту
                        available_height = ring_thickness * 2
                    elif depth == 1:
                        # Первое кольцо - больше пространства
                        available_height = ring_thickness * 1.5
                    else:
                        # Внешние кольца
                        available_height = ring_thickness
                    
                    available_height -= RING_PADDING * 2
                    
                    # Рассчитываем максимальный размер шрифта который влезет по высоте
                    if lines > 0:
                        max_line_height = available_height / lines
                        max_font_by_height = max_line_height / FONT_CALC_RATIO
                    else:
                        max_font_by_height = FONT_SIZE_MAX
                    
                    # Ограничиваем размер шрифта
                    font_size = min(FONT_SIZE_MAX, max(FONT_SIZE_MIN, int(max_font_by_height)))
                    font_sizes.append(font_size)
        
        # Если font_sizes пустой или dynamic_font_size выключен, используем базовый размер
        if not font_sizes:
            font_sizes = None

        # Wrap long hover labels so tooltip is not one endless line.
        # Never show "undefined" / "N/A" in hover text.
        if raw_labels:
            def _clean_hover_label(lbl):
                text = "" if lbl is None else str(lbl).strip()
                if text.lower() in ("", "undefined", "null", "n/a", "na", "none", "nan", "<na>"):
                    return ""
                return _wrap_hover_text(text, max_chars=42)
            raw_labels = [_clean_hover_label(lbl) for lbl in raw_labels]

        fig.update_layout(
            hovermode='closest',
            hoverlabel=dict(
                bgcolor="white",
                font_size=12,
                font_family="Arial",
                namelength=-1,
                bordercolor="black",
                align="left",
            ),
            margin=dict(t=20, l=20, r=20, b=20),
            font=dict(family="Arial, sans-serif", size=text_font_size),
            paper_bgcolor='white',
            plot_bgcolor='white',
            width=chart_size,
            height=chart_size,
            autosize=False,
            annotations=[],
        )

        # === ШАГ 3: Назначаем цвета для узлов ===
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

        if fig.data and len(fig.data) > 0:
            trace = fig.data[0]
            original_ids_for_colors = list(trace.ids) if getattr(trace, "ids", None) is not None else None
            original_parents_for_colors = list(trace.parents)
            original_labels_for_colors = list(trace.labels)
            
            if original_ids_for_colors:
                id_to_parent_c = {node_id: original_parents_for_colors[idx] for idx, node_id in enumerate(original_ids_for_colors)}
                id_to_index_c = {node_id: idx for idx, node_id in enumerate(original_ids_for_colors)}

                def get_depth_c(node_id):
                    depth = 0
                    parent_id = id_to_parent_c.get(node_id, '')
                    while parent_id:
                        depth += 1
                        parent_id = id_to_parent_c.get(parent_id, '')
                    return depth

                # Уникальные цвета для всех узлов первого уровня (depth == 1)
                level_one_nodes = [node_id for node_id in original_ids_for_colors if get_depth_c(node_id) == 1]
                # Prefer manual L1 overrides (by sector label); fall back to palette.
                overrides = user_color_map
                root_color_map = {}
                for i, node_id in enumerate(level_one_nodes):
                    label = str(original_labels_for_colors[id_to_index_c[node_id]])
                    root_color_map[node_id] = overrides.get(label, palette[i % len(palette)])
                node_colors = [None] * len(original_ids_for_colors)

                def assign_color(node_id):
                    idx = id_to_index_c[node_id]
                    if node_colors[idx]:
                        return node_colors[idx]
                    parent_id = id_to_parent_c.get(node_id, '')
                    if node_id in root_color_map:
                        color = root_color_map[node_id]
                    elif parent_id in root_color_map:
                        base = root_color_map[parent_id]
                        color = blend_with_white(base, min(0.55, 0.22 * max(1, get_depth_c(node_id) - 1))) if depth_gradient else base
                    elif parent_id in ('', None):
                        color = root_color_map.get(node_id, palette[0])
                    else:
                        parent_color = assign_color(parent_id)
                        depth = get_depth_c(node_id)
                        color = blend_with_white(parent_color, min(0.55, 0.22)) if depth_gradient else parent_color
                    node_colors[idx] = color
                    return color

                for node_id in original_ids_for_colors:
                    assign_color(node_id)
            else:
                node_colors = [palette[i % len(palette)] for i in range(len(original_labels_for_colors))]
        
        # Используем динамический размер шрифта если рассчитан, иначе фиксированный
        if font_sizes:
            text_font_config = dict(size=font_sizes, family="Arial, sans-serif", color="black")
        else:
            text_font_config = dict(size=text_font_size, family="Arial, sans-serif", color="black")
        
        # Переносы строк через text + textinfo="text"; центровка — скриптом в HTML
        text_for_plot = wrapped_labels if wrapped_labels else None

        fig.update_traces(
            text=text_for_plot if text_for_plot else None,
            textinfo="text",
            hovertext=raw_labels if raw_labels else None,
            hovertemplate=hover_template.replace('%{label}', '%{hovertext}') if raw_labels else hover_template,
            textfont=text_font_config,
            insidetextorientation=text_orientation,
            branchvalues=branchvalues_mode,
            sort=False,
            # Plotly places the first sector at 3:00 and advances CCW.
            # rotation=90 moves the start to 12:00; combined with reversed row
            # order above, table top→bottom reads clockwise from 12:00.
            rotation=90,
            maxdepth=len(hierarchy_cols),
        )
        if node_colors:
            fig.update_traces(marker=dict(colors=node_colors))
        
        # Если используем динамические размеры - не применяем uniformtext 
        # (он нормализует все размеры и конфликтует с массивом font_sizes)
        if not font_sizes:
            # Hide labels that still cannot fit — avoids bleeding into neighbor sectors.
            # Full text remains available via hovertext.
            fig.update_layout(
                font=dict(family="Arial, sans-serif", size=text_font_size),
                uniformtext=dict(mode="hide", minsize=FONT_SIZE_MIN),
            )
        
        html = fig.to_html(include_plotlyjs="inline", full_html=True)
        hover_css = (
            "<style>"
            ".hovertext, .hoverlayer path + text, g.hovertext text {"
            "white-space: normal !important;}"
            ".hovertext {"
            "max-width: 280px;}"
            "</style>"
        )
        html = html.replace(
            "</head>",
            f'{hover_css}<meta name="plotly-chart-size" content="{chart_size},{chart_size}"></head>',
        )
        logger.info(f"HTML графика сгенерирован, длина: {len(html)} символов, размер: {chart_size}")
        return html, chart_size

    except Exception as e:
        logger.exception("Ошибка построения диаграммы")
        return ("<!DOCTYPE html><html><head><meta charset='utf-8'><style>body{font:16px/1.4 Arial,sans-serif;padding:24px;color:#b00020;}pre{white-space:pre-wrap;font:14px/1.4 Consolas,monospace;}</style></head><body><p><b>Chart error</b></p><pre>" + str(e) + "</pre></body></html>"), 800


def build_d3_payload(
    data: List[Dict],
    columns: List[str],
    hierarchy_cols: List[str],
    value_col: Optional[str] = None,
    use_gradient: bool = True,
    uniform_size: bool = False,
    show_zero_values: bool = True,
    text_along_circumference: bool = False,
    show_full_text: bool = False,
    dynamic_font_size: bool = False,
    column_mapping: Optional[Dict[str, str]] = None,
    color_map: Optional[Dict[str, str]] = None,
) -> Dict:
    """Готовит данные для D3 sunburst (дерево + настройки)."""
    if not data:
        raise ValueError("Нет данных.")

    df = pd.DataFrame(data)
    if column_mapping:
        rename = {actual: canonical for canonical, actual in column_mapping.items() if actual in df.columns}
        if rename:
            df = df.rename(columns=rename)

    # Terminate blank hierarchy cells early (parity with Plotly path cleaning).
    df = _truncate_hierarchy_paths(df, hierarchy_cols)
    # Drop prefix rows that would only duplicate a parent that already has children.
    df = _drop_non_leaf_hierarchy_rows(df, hierarchy_cols)

    use_value_col = None
    if value_col and value_col in df.columns:
        df[value_col] = pd.to_numeric(df[value_col], errors="coerce").fillna(0)
        if not show_zero_values:
            df = df[df[value_col] > 0]
        df[value_col] = df[value_col].replace(0, 1)
        use_value_col = value_col

    if uniform_size and hierarchy_cols:
        df_for_weights = df.drop_duplicates(subset=hierarchy_cols).copy()
        children_map = {}
        for _, row in df_for_weights.iterrows():
            path = []
            for level in range(len(hierarchy_cols)):
                raw = row[hierarchy_cols[level]]
                child = _clean_hierarchy_cell(raw)
                if child is None:
                    break
                parent_key = tuple(path)
                children_map.setdefault(parent_key, set()).add(child)
                path.append(child)

        def compute_weight(row):
            weight = 1.0
            path = []
            for level in range(len(hierarchy_cols)):
                raw = row[hierarchy_cols[level]]
                child = _clean_hierarchy_cell(raw)
                if child is None:
                    break
                parent_key = tuple(path)
                child_count = len(children_map.get(parent_key, [])) or 1
                weight *= 1.0 / child_count
                path.append(child)
            return weight

        df_for_weights["_uniform_weight"] = df_for_weights.apply(compute_weight, axis=1)
        df = df_for_weights
        use_value_col = "_uniform_weight"

    if df.empty:
        raise ValueError("Нет данных для отображения (все значения нулевые).")

    # Children are appended in first-seen order while iterating df rows,
    # so sibling order matches the table (no value-based reordering).
    # Blank hierarchy cells terminate the path (no synthetic N/A nodes).
    root = {"name": "root", "children": [], "value": 0}

    def get_or_create_child(node, name):
        children_map = node.setdefault("_children_map", {})
        child = children_map.get(name)
        if not child:
            child = {"name": name, "children": [], "value": 0}
            children_map[name] = child
            node["children"].append(child)
        return child

    for _, row in df.iterrows():
        node = root
        descended = False
        for col in hierarchy_cols:
            label = _clean_hierarchy_cell(row[col])
            if label is None:
                break
            node = get_or_create_child(node, label)
            descended = True
        if not descended:
            continue
        leaf_value = float(row[use_value_col]) if use_value_col else 1.0
        node["value"] = (node.get("value") or 0) + leaf_value

    def finalize(node):
        children = node.get("children") or []
        if children:
            total = 0
            for child in children:
                finalize(child)
                total += child.get("value", 0) or 0
            if not node.get("value"):
                node["value"] = total
        # Drop empty children lists so D3 treats node as a leaf.
        if not node.get("children"):
            node.pop("children", None)
        node.pop("_children_map", None)

    finalize(root)

    # If there is only one top-level value, make it the visual root.
    # This matches Plotly behavior where the center shows the first hierarchy value,
    # not the column name.
    if isinstance(root.get("children"), list) and len(root["children"]) == 1:
        root = root["children"][0]
    else:
        # Do not show a synthetic root label; keep center neutral.
        root["name"] = ""

    palette = [
        "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728",
        "#9467bd", "#8c564b", "#e377c2", "#7f7f7f",
        "#17becf", "#2e91e5", "#e15f99", "#1ca71c",
        "#fb0d0d", "#da16ff", "#b68100"
    ]

    # Match Plotly sizing logic (see create_sunburst_chart).
    levels_count = max(1, len(hierarchy_cols or []))
    if hierarchy_cols:
        leaf_count = df.drop_duplicates(subset=hierarchy_cols).shape[0]
    else:
        leaf_count = len(df)
    MIN_RING_THICKNESS = 80
    base_chart_size = (levels_count + 1) * MIN_RING_THICKNESS * 2
    extra_for_leaves = min(960, leaf_count * 12)
    chart_size = max(800, int(base_chart_size + extra_for_leaves))

    settings = {
        "textAlongCircumference": text_along_circumference,
        "showFullText": show_full_text,
        "dynamicFontSize": dynamic_font_size,
        "useGradient": use_gradient,
        "uniformSize": uniform_size,
        "palette": palette,
        # L1 sector name -> hex; D3 applies and lightens by depth when useGradient.
        "colorMap": color_map or {},
        # Use the same diameter as Plotly for visual parity.
        "baseSize": chart_size,
        "maxSize": 5000,
    }

    return {"tree": root, "settings": settings}
