import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import apiClient from '../api/client'
import { useNotification } from '../contexts/NotificationContext'
import SaveAsNewModal from './SaveAsNewModal'
import D3Sunburst from './D3Sunburst'
import './ChartTab.css'

const DEFAULT_SECTOR_PALETTE = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728',
  '#9467bd', '#8c564b', '#e377c2', '#7f7f7f',
  '#17becf', '#2e91e5', '#e15f99', '#1ca71c',
  '#fb0d0d', '#da16ff', '#b68100'
]


const normalizeHex = (value, fallback = '#1f77b4') => {
  if (value == null) return fallback
  let s = String(value).trim()
  if (!s) return fallback
  const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (rgb) {
    const toHex = (n) => Number(n).toString(16).padStart(2, '0')
    return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`
  }
  if (s[0] !== '#') s = `#${s}`
  const short = /^#([0-9a-fA-F]{3})$/.exec(s)
  if (short) {
    const [r, g, b] = short[1].split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase()
  return fallback
}

const sanitizeColumnLabel = (name) => String(name ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()


function ChartTab({ data, columns, fileId, user, onChartSaved, projectId, openedDiagramId, fileName }) {
  const { showNotification } = useNotification()
  const [selectedColumns, setSelectedColumns] = useState([])
  const [columnOrder, setColumnOrder] = useState([]) // Порядок всех столбцов
  const [valueColumn, setValueColumn] = useState('')
  const [useGradient, setUseGradient] = useState(true)
  const [colorMap, setColorMap] = useState({})
  const [uniformSize, setUniformSize] = useState(false)
  const [showZeroValues, setShowZeroValues] = useState(true)
  const [textAlongCircumference, setTextAlongCircumference] = useState(false)
  const [showFullText, setShowFullText] = useState(false)
  const [dynamicFontSize, setDynamicFontSize] = useState(false)
  const [chartHtml, setChartHtml] = useState('')
  const [d3Payload, setD3Payload] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveAsNewModal, setSaveAsNewModal] = useState(false)
  const [draggedColumn, setDraggedColumn] = useState(null)
  const [draggedFromIndex, setDraggedFromIndex] = useState(null) // ИСХОДНАЯ позиция при начале drag
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [showPreview, setShowPreview] = useState(false)
  const [zoomPercent, setZoomPercent] = useState(100)
  const [contentSize, setContentSize] = useState({ width: 0, height: 0 })
  const chartContainerRef = useRef(null)

  const handleD3SizeChange = useCallback((size) => {
    if (!size) return
    setContentSize(prev => (prev.width === size && prev.height === size)
      ? prev
      : { width: size, height: size })
  }, [])
  const plotAreaRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const columnsContainerRef = useRef(null)
  const autoScrollIntervalRef = useRef(null)

  // Порядок столбцов всегда как в редакторе (из props)
    useEffect(() => {
    const fromCols = Array.isArray(columns) ? columns.filter(c => c != null && String(c).length) : []
    const fromData = (data && data[0] && typeof data[0] === 'object')
      ? Object.keys(data[0]).filter(c => c != null && String(c).length)
      : []
    // Union: API columns first (spreadsheet order), then any extra keys present only in rows.
    const merged = []
    const seen = new Set()
    for (const c of [...fromCols, ...fromData]) {
      const key = String(c)
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(key)
    }
    if (!merged.length) return
    setColumnOrder(prev => {
      if (!prev?.length) return merged
      // Keep user reorder for columns that still exist; append newly appeared ones.
      const keep = prev.filter(c => seen.has(String(c)))
      const keepSet = new Set(keep.map(String))
      const added = merged.filter(c => !keepSet.has(String(c)))
      return keep.length ? [...keep, ...added] : merged
    })
    setSelectedColumns(prev => {
      const valid = (prev || []).filter(c => seen.has(String(c)))
      if (valid.length) return valid
      // Default: first up to 3 columns — include Цель/Ценности when present.
      return merged.slice(0, Math.min(3, merged.length))
    })
  }, [columns, data])

  // Восстанавливаем сохраненные настройки диаграммы из localStorage (по индексам, чтобы переименование столбцов не ломало выбор)
  useEffect(() => {
    if (fileId && columns && columns.length > 0) {
      const saved = localStorage.getItem(`chart_settings_${fileId}`)
      if (saved) {
        try {
          const chartData = JSON.parse(saved)
          // Восстановление по индексам (актуальные названия столбцов)
          if (Array.isArray(chartData.selectedColumnIndices)) {
            const restored = chartData.selectedColumnIndices.map(i => columns[i]).filter(Boolean)
            if (restored.length > 0) setSelectedColumns(restored)
          } else if (Array.isArray(chartData.selectedColumns)) {
            const byName = chartData.selectedColumns.filter(c => columns.includes(c))
            if (byName.length > 0) setSelectedColumns(byName)
          }
          if (chartData.valueColumnIndex != null && columns[chartData.valueColumnIndex] != null) {
            setValueColumn(columns[chartData.valueColumnIndex])
          } else if (chartData.valueColumn && columns.includes(chartData.valueColumn)) {
            setValueColumn(chartData.valueColumn)
          } else {
            setValueColumn('')
          }
          setUseGradient(chartData.useGradient !== undefined ? chartData.useGradient : true)
          if (chartData.colorMap && typeof chartData.colorMap === 'object') {
            setColorMap(chartData.colorMap)
          }
          setUniformSize(chartData.uniformSize || false)
          setShowZeroValues(chartData.showZeroValues !== undefined ? chartData.showZeroValues : true)
          setTextAlongCircumference(chartData.textAlongCircumference || false)
          setShowFullText(chartData.showFullText || false)
          setDynamicFontSize(chartData.dynamicFontSize || false)
          if (!chartData.selectedColumnIndices?.length && !chartData.selectedColumns?.length) {
            setSelectedColumns(columns.slice(0, Math.min(3, columns.length)))
          }
        } catch (e) {
          console.error('Ошибка восстановления настроек диаграммы:', e)
          setSelectedColumns(columns.slice(0, Math.min(3, columns.length)))
        }
      } else {
        setSelectedColumns(columns.slice(0, Math.min(3, columns.length)))
      }
    }
  }, [fileId, columns])

  // Сохраняем только настройки диаграммы в localStorage (по индексам — переименование столбцов не сломает выбор)
  useEffect(() => {
    if (fileId && columns && columns.length > 0) {
      try {
        const selectedColumnIndices = selectedColumns.map(c => columns.indexOf(c)).filter(i => i >= 0)
        const valueColumnIndex = valueColumn ? columns.indexOf(valueColumn) : -1
        localStorage.setItem(`chart_settings_${fileId}`, JSON.stringify({
          selectedColumns,
          selectedColumnIndices,
          valueColumn,
          valueColumnIndex: valueColumnIndex >= 0 ? valueColumnIndex : undefined,
          useGradient,
          colorMap,
          uniformSize,
          showZeroValues,
          textAlongCircumference,
          showFullText,
          dynamicFontSize
        }))
      } catch (e) {
        console.warn('Не удалось сохранить настройки диаграммы в localStorage:', e)
      }
    }
  }, [selectedColumns, valueColumn, useGradient, colorMap, uniformSize, showZeroValues, textAlongCircumference, showFullText, dynamicFontSize, fileId, columns])

  // Загружаем настройки сохраненной диаграммы при открытии (только если диаграмма привязана к текущему файлу)
  // Подставляем только те столбцы, которые есть в текущем файле (по имени)
  // Unique L1 sector names from first hierarchy column (table order).
  const uniqueNamesForColumn = (col) => {
    const seen = new Set()
    const names = []
    for (const row of data || []) {
      const raw = row?.[col]
      if (raw == null) continue
      const name = String(raw).trim()
      if (!name) continue
      if (!seen.has(name)) {
        seen.add(name)
        names.push(name)
      }
    }
    return names
  }

  // Color pickers target the first ring the user actually sees as multiple sectors
  // (skip constant root columns like a single «Цель проекта»).
  const l1Sectors = useMemo(() => {
    if (!data?.length || !selectedColumns?.length) return []
    for (const col of selectedColumns) {
      const names = uniqueNamesForColumn(col)
      if (names.length > 1) return names
    }
    return uniqueNamesForColumn(selectedColumns[0])
  }, [data, selectedColumns])

  // Prefer numeric columns for the value dropdown; fall back to all columns.
  // Sanitize labels so newline-in-header Excel quirks do not blank the <select>.
  const valueColumnOptions = useMemo(() => {
    const source = (columns && columns.length)
      ? columns
      : (columnOrder && columnOrder.length)
        ? columnOrder
        : (data?.[0] ? Object.keys(data[0]) : [])
    const unique = []
    const seen = new Set()
    for (const col of source) {
      if (col == null) continue
      const key = String(col)
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(key)
    }
    const isNumericCol = (col) => {
      let numeric = 0
      let total = 0
      const rows = data || []
      for (let i = 0; i < rows.length && i < 80; i++) {
        const raw = rows[i]?.[col]
        if (raw == null) continue
        const s = String(raw).trim()
        if (!s) continue
        total += 1
        const normalized = s.replace('%', '').replace(/\s/g, '').replace(',', '.')
        if (normalized !== '' && !Number.isNaN(Number(normalized))) numeric += 1
      }
      return total > 0 && numeric / total >= 0.5
    }
    const numeric = unique.filter(isNumericCol)
    let list = numeric.length ? numeric : unique
    // Always include the currently selected value so the controlled <select> is never blank.
    if (valueColumn && !list.includes(valueColumn) && unique.includes(valueColumn)) {
      list = [valueColumn, ...list]
    }
    return list.map(col => ({ value: col, label: sanitizeColumnLabel(col) || col }))
  }, [columns, columnOrder, data, valueColumn])

  // Ensure every L1 sector has a color (defaults from palette).
  useEffect(() => {
    if (!l1Sectors.length) return
    setColorMap(prev => {
      let changed = false
      const next = { ...prev }
      l1Sectors.forEach((name, i) => {
        if (!next[name] || !/^#[0-9a-fA-F]{6}$/.test(String(next[name]))) {
          next[name] = normalizeHex(next[name] || DEFAULT_SECTOR_PALETTE[i % DEFAULT_SECTOR_PALETTE.length])
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [l1Sectors])

  const handleSectorColorChange = (name, hex) => {
    setColorMap(prev => ({ ...prev, [name]: normalizeHex(hex) }))
  }

  const handleResetSectorColors = () => {
    if (!l1Sectors.length) return
    setColorMap(prev => {
      const next = { ...prev }
      l1Sectors.forEach((name, i) => {
        next[name] = normalizeHex(DEFAULT_SECTOR_PALETTE[i % DEFAULT_SECTOR_PALETTE.length])
      })
      return next
    })
  }

  useEffect(() => {
    if (openedDiagramId && fileId && columns && columns.length > 0) {
      const loadDiagramSettings = async () => {
        try {
          const diagramResponse = await apiClient.get(`/diagrams/${openedDiagramId}`)
          const diagram = diagramResponse.data
          if (diagram.data_file_id !== fileId) {
            return
          }
          const fileColumnsSet = new Set(columns)
          if (diagram.hierarchy_columns && diagram.hierarchy_columns.length > 0) {
            const validHierarchy = diagram.hierarchy_columns.filter(c => fileColumnsSet.has(c))
            const dropped = diagram.hierarchy_columns.length - validHierarchy.length
            if (dropped > 0) {
              showNotification(
                `В файле нет столбцов «${diagram.hierarchy_columns.filter(c => !fileColumnsSet.has(c)).join('», «')}» — выбраны только столбцы из текущей таблицы. При необходимости выберите столбцы вручную и нажмите «Построить».`,
                'info'
              )
            }
            setSelectedColumns(validHierarchy.length > 0 ? validHierarchy : columns.slice(0, Math.min(3, columns.length)))
          }
          if (diagram.value_column != null && fileColumnsSet.has(diagram.value_column)) {
            setValueColumn(diagram.value_column)
          } else {
            setValueColumn('')
          }
          setUseGradient(diagram.use_gradient !== undefined ? diagram.use_gradient : true)
          setUniformSize(diagram.uniform_size || false)
          setShowZeroValues(diagram.show_zero_values !== undefined ? diagram.show_zero_values : true)
          setTextAlongCircumference(diagram.text_along_circumference || false)
          setShowFullText(diagram.show_full_text || false)
          setDynamicFontSize(diagram.dynamic_font_size || false)
        } catch (err) {
          console.error('Ошибка загрузки настроек диаграммы:', err)
        }
      }
      loadDiagramSettings()
    }
  }, [openedDiagramId, fileId, columns])

  // Автопостроение диаграммы при открытии сохраненной
  useEffect(() => {
    if (openedDiagramId && selectedColumns.length > 0 && data && data.length > 0 && !chartHtml) {
      // Небольшая задержка чтобы убедиться что все данные загружены
      const timer = setTimeout(() => {
        handleRenderChart()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [openedDiagramId, selectedColumns, data])

  const handleColumnToggle = (col) => {
    setSelectedColumns(prev => {
      if (prev.includes(col)) {
        return prev.filter(c => c !== col)
      } else {
        return [...prev, col]
      }
    })
  }

  const handleMoveColumn = (col, direction) => {
    const idx = columnOrder.indexOf(col)
    if (idx === -1) return
    // Проверяем границы
    if ((direction < 0 && idx === 0) || (direction > 0 && idx === columnOrder.length - 1)) return
    
    const newOrder = [...columnOrder]
    const newIdx = idx + direction
    ;[newOrder[idx], newOrder[newIdx]] = [newOrder[newIdx], newOrder[idx]]
    setColumnOrder(newOrder)
  }

  const handleDragStart = (e, col) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', col)
    const startIdx = columnOrder.indexOf(col)
    setDraggedColumn(col)
    setDraggedFromIndex(startIdx) // Запоминаем ИСХОДНУЮ позицию
    setShowPreview(false)
    setDragOverIndex(null)
    console.log('DragStart:', { col, startIdx })
  }

  const handleDragEnd = (e) => {
    // Очищаем автоскролл
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current)
      autoScrollIntervalRef.current = null
    }
    
    // Применяем изменения, если есть валидный dragOverIndex
    if (draggedColumn && dragOverIndex !== null) {
      const draggedIdx = columnOrder.indexOf(draggedColumn)
      
      // ВАЖНО: применяем изменения только если действительно перемещаем на другую позицию
      if (draggedIdx !== -1 && draggedIdx !== dragOverIndex) {
        const newOrder = [...columnOrder]
        newOrder.splice(draggedIdx, 1)
        newOrder.splice(dragOverIndex, 0, draggedColumn)
        console.log('DragEnd: Applied new order', { 
          from: draggedIdx, 
          to: dragOverIndex, 
          draggedColumn, 
          newOrder 
        })
        setColumnOrder(newOrder)
      } else {
        console.log('DragEnd: No change needed', { draggedIdx, dragOverIndex })
      }
    }
    
    setDraggedColumn(null)
    setDraggedFromIndex(null)
    setDragOverIndex(null)
    setShowPreview(false)
  }

  // Вычисляем визуальный порядок при перетаскивании
  const getVisualOrder = () => {
    if (!draggedColumn) {
      return columnOrder.map((col, idx) => ({ col, idx, isDragged: false }))
    }
    
    const draggedIdx = columnOrder.indexOf(draggedColumn)
    if (draggedIdx === -1) {
      return columnOrder.map((col, idx) => ({ col, idx, isDragged: false }))
    }
    
    // ВАЖНО: Сравниваем с ИСХОДНОЙ позицией (draggedFromIndex), а не с текущей
    // Если dragOverIndex совпадает с исходной позицией - НЕ показываем preview
    if (!showPreview || dragOverIndex === null || dragOverIndex === draggedFromIndex) {
      return columnOrder.map((col, idx) => ({
        col,
        idx: idx,
        isDragged: col === draggedColumn
      }))
    }
    
    // Показываем preview только если действительно меняем позицию
    // Вычисляем новый порядок (как будет после drop)
    const newOrder = [...columnOrder]
    newOrder.splice(draggedIdx, 1)
    newOrder.splice(dragOverIndex, 0, draggedColumn)
    
    console.log('getVisualOrder preview:', { 
      draggedIdx, 
      dragOverIndex, 
      draggedFromIndex,
      currentOrder: columnOrder,
      newOrder 
    })
    
    // ВСЕ элементы показываем в ФИНАЛЬНОМ порядке
    const visualOrder = []
    for (let i = 0; i < columnOrder.length; i++) {
      const col = columnOrder[i]
      const newIdx = newOrder.indexOf(col)
      visualOrder.push({ 
        col, 
        idx: newIdx, 
        isDragged: col === draggedColumn 
      })
    }
    
    return visualOrder
  }

  const handleDragOver = (e, targetIdx) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    
    if (!draggedColumn || draggedFromIndex === null) return
    
    const draggedIdx = columnOrder.indexOf(draggedColumn)
    if (draggedIdx === -1) return
    
    // showPreview = true ТОЛЬКО если перетаскиваем НЕ на исходную позицию
    const shouldShowPreview = targetIdx !== draggedFromIndex
    
    if (dragOverIndex !== targetIdx || showPreview !== shouldShowPreview) {
      console.log('DragOver:', { 
        targetIdx, 
        draggedFromIndex, 
        shouldShowPreview,
        currentDraggedIdx: draggedIdx
      })
      setDragOverIndex(targetIdx)
      setShowPreview(shouldShowPreview)
    }

    // Автоскролл с постоянной скоростью
    if (columnsContainerRef.current) {
      const container = columnsContainerRef.current
      const rect = container.getBoundingClientRect()
      const scrollZone = 100 // Зона для автоскролла в пикселях
      const scrollSpeed = 5 // Постоянная скорость
      
      const mouseY = e.clientY
      const distanceFromTop = mouseY - rect.top
      const distanceFromBottom = rect.bottom - mouseY
      
      // Очищаем предыдущий интервал
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current)
        autoScrollIntervalRef.current = null
      }
      
      // Скролл вверх
      if (distanceFromTop < scrollZone && container.scrollTop > 0) {
        autoScrollIntervalRef.current = setInterval(() => {
          if (container.scrollTop > 0) {
            container.scrollTop -= scrollSpeed
          } else {
            clearInterval(autoScrollIntervalRef.current)
            autoScrollIntervalRef.current = null
          }
        }, 20)
      }
      // Скролл вниз
      else if (distanceFromBottom < scrollZone && 
               container.scrollTop < container.scrollHeight - container.clientHeight) {
        autoScrollIntervalRef.current = setInterval(() => {
          if (container.scrollTop < container.scrollHeight - container.clientHeight) {
            container.scrollTop += scrollSpeed
          } else {
            clearInterval(autoScrollIntervalRef.current)
            autoScrollIntervalRef.current = null
          }
        }, 20)
      }
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Применяем изменения из handleDragEnd
    // handleDragEnd уже будет вызван автоматически после drop
  }

  const clampZoom = (value) => Math.min(500, Math.max(25, value))

  const handleZoomChange = (value) => {
    const next = clampZoom(value)
    const plotEl = plotAreaRef.current?.querySelector?.('.plot')
    if (plotEl && contentSize.width && contentSize.height) {
      const prev = zoomPercent || 100
      const cx = plotEl.scrollLeft + plotEl.clientWidth / 2
      const cy = plotEl.scrollTop + plotEl.clientHeight / 2
      const ratio = next / prev
      setZoomPercent(next)
      requestAnimationFrame(() => {
        plotEl.scrollLeft = cx * ratio - plotEl.clientWidth / 2
        plotEl.scrollTop = cy * ratio - plotEl.clientHeight / 2
      })
      return
    }
    setZoomPercent(next)
  }

  useEffect(() => {
    const onFsChange = () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement
      setIsFullscreen(Boolean(fsEl && plotAreaRef.current && (fsEl === plotAreaRef.current || plotAreaRef.current.contains(fsEl))))
    }
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
    }
  }, [])

  const handleToggleFullscreen = async () => {
    const el = plotAreaRef.current
    if (!el) return
    try {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement
      if (fsEl) {
        if (document.exitFullscreen) await document.exitFullscreen()
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen()
      } else if (el.requestFullscreen) {
        await el.requestFullscreen()
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen()
      } else {
        showNotification('Полноэкранный режим не поддерживается в этом браузере', 'warning')
      }
    } catch (err) {
      console.error('Fullscreen error:', err)
      showNotification('Не удалось переключить полноэкранный режим', 'error')
    }
  }

  const getChartCaptureTarget = () => {
    // Prefer live D3 SVG; fall back to Plotly iframe document body.
    const d3Svg = document.querySelector('.d3-sunburst-container svg')
    if (d3Svg) return { kind: 'svg', el: d3Svg }
    const iframe = chartContainerRef.current?.querySelector('iframe')
    if (iframe?.contentDocument?.body) {
      const hasSvg = Boolean(iframe.contentDocument.querySelector('svg'))
      if (!hasSvg) return null
      return { kind: 'iframe', el: iframe }
    }
    return null
  }

  const chartLooksLikeError = Boolean(
    error ||
    (typeof chartHtml === 'string' && (
      chartHtml.includes('Chart error') ||
      chartHtml.includes("color:red") ||
      chartHtml.includes("color: red") ||
      chartHtml.includes('Non-leaves rows')
    ))
  )
  const canExportPdf = Boolean(d3Payload || (chartHtml && !chartLooksLikeError))


  const svgToDataUrl = (svgEl) => {
    const clone = svgEl.cloneNode(true)
    if (!clone.getAttribute('xmlns')) {
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    }
    // Prefer explicit chart diameter / viewBox over CSS-transformed getBoundingClientRect
    // (zoom scale + negative viewBox previously cropped PDF to the bottom-right quadrant).
    const diameterAttr = svgEl.getAttribute('data-chart-diameter')
    const vb = (svgEl.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number)
    let exportW = Number(diameterAttr) || Number(clone.getAttribute('width')) || 0
    let exportH = Number(diameterAttr) || Number(clone.getAttribute('height')) || 0
    if ((!exportW || !exportH) && vb.length === 4 && vb.every(n => Number.isFinite(n))) {
      exportW = Math.abs(vb[2]) || exportW
      exportH = Math.abs(vb[3]) || exportH
    }
    if (!exportW || !exportH) {
      const bbox = svgEl.getBoundingClientRect()
      exportW = Math.round(bbox.width) || contentSize.width || 800
      exportH = Math.round(bbox.height) || contentSize.height || 800
    }
    exportW = Math.max(1, Math.round(exportW))
    exportH = Math.max(1, Math.round(exportH))
    clone.setAttribute('width', String(exportW))
    clone.setAttribute('height', String(exportH))
    // Force a positive-origin viewBox so rasterizers never drop the negative quadrant.
    clone.setAttribute('viewBox', `0 0 ${exportW} ${exportH}`)
    const xml = new XMLSerializer().serializeToString(clone)
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`
  }

  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Не удалось растрировать изображение диаграммы'))
    img.src = src
  })

  const canvasToJpegBytes = (canvas, quality = 0.92) => new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('Не удалось создать изображение для PDF'))
        return
      }
      const buf = await blob.arrayBuffer()
      resolve(new Uint8Array(buf))
    }, 'image/jpeg', quality)
  })

  // Minimal single-page PDF with an embedded JPEG — no window.print / about:blank.
  const jpegToPdfBlob = (jpegBytes, imgWidthPx, imgHeightPx) => {
    const pxToPt = 72 / 96
    const pageW = Math.max(1, imgWidthPx * pxToPt)
    const pageH = Math.max(1, imgHeightPx * pxToPt)
    const encoder = new TextEncoder()
    const parts = []
    const offsets = [0]

    const add = (s) => {
      if (typeof s === 'string') parts.push(encoder.encode(s))
      else parts.push(s)
    }

    add('%PDF-1.4\n')
    const mark = () => {
      let n = 0
      for (const p of parts) n += p.length
      offsets.push(n)
    }

    mark()
    add('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n')
    mark()
    add('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n')
    mark()
    add(`3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>endobj\n`)
    mark()
    add(`4 0 obj<< /Type /XObject /Subtype /Image /Width ${imgWidthPx} /Height ${imgHeightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>stream\n`)
    add(jpegBytes)
    add('\nendstream\nendobj\n')
    mark()
    const content = `q ${pageW.toFixed(2)} 0 0 ${pageH.toFixed(2)} 0 0 cm /Im0 Do Q\n`
    add(`5 0 obj<< /Length ${content.length} >>stream\n${content}endstream\nendobj\n`)

    const bodyLen = parts.reduce((n, p) => n + p.length, 0)
    const xrefStart = bodyLen
    let xref = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`
    for (let i = 1; i < offsets.length; i++) {
      xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
    }
    add(xref)
    add(`trailer<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`)

    const total = parts.reduce((n, p) => n + p.length, 0)
    const out = new Uint8Array(total)
    let off = 0
    for (const part of parts) {
      out.set(part, off)
      off += part.length
    }
    return new Blob([out], { type: 'application/pdf' })
  }

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  const rasterizeSvgElement = async (svgEl, scale = 2) => {
    const diameterAttr = Number(svgEl.getAttribute('data-chart-diameter'))
    const attrW = Number(svgEl.getAttribute('width'))
    const attrH = Number(svgEl.getAttribute('height'))
    const width = Math.max(1, Math.round(diameterAttr || attrW || contentSize.width || 800))
    const height = Math.max(1, Math.round(diameterAttr || attrH || contentSize.height || 800))
    const dataUrl = svgToDataUrl(svgEl)
    const img = await loadImage(dataUrl)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // drawImage with natural size mapped to full canvas — viewBox already normalized
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const jpeg = await canvasToJpegBytes(canvas)
    return { jpeg, width: canvas.width, height: canvas.height }
  }

  const handleExportPdf = async () => {
    if (!canExportPdf) {
      showNotification('PDF unavailable: no chart SVG', 'warning')
      return
    }
    const target = getChartCaptureTarget()
    if (!target) {
      showNotification('Сначала постройте диаграмму', 'warning')
      return
    }
    try {
      showNotification('Готовим PDF…', 'info')
      let raster = null

      if (target.kind === 'svg') {
        raster = await rasterizeSvgElement(target.el, 2)
      } else {
        const iframe = target.el
        const idoc = iframe.contentDocument
        const iwin = iframe.contentWindow
        // Prefer Plotly.toImage when available (merges layered SVGs cleanly).
        const gd = idoc?.querySelector('.js-plotly-plot, .plotly-graph-div, [class*="plotly"]')
        if (iwin?.Plotly?.toImage && gd) {
          const w = Math.max(800, contentSize.width || 800)
          const h = Math.max(800, contentSize.height || 800)
          const pngUrl = await iwin.Plotly.toImage(gd, { format: 'png', width: w, height: h, scale: 2 })
          const img = await loadImage(pngUrl)
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth || w * 2
          canvas.height = img.naturalHeight || h * 2
          const ctx = canvas.getContext('2d')
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0)
          const jpeg = await canvasToJpegBytes(canvas)
          raster = { jpeg, width: canvas.width, height: canvas.height }
        } else {
          // Combine Plotly's stacked main-svg layers onto one canvas.
          const svgs = Array.from(idoc?.querySelectorAll('svg.main-svg, .plotly svg') || [])
          if (!svgs.length) {
            showNotification('Не найден SVG диаграммы для экспорта в PDF', 'error')
            return
          }
          const width = Math.max(...svgs.map(s => Math.round(s.getBoundingClientRect().width || 0)), contentSize.width || 800)
          const height = Math.max(...svgs.map(s => Math.round(s.getBoundingClientRect().height || 0)), contentSize.height || 800)
          const scale = 2
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(width * scale)
          canvas.height = Math.round(height * scale)
          const ctx = canvas.getContext('2d')
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          for (const svg of svgs) {
            const img = await loadImage(svgToDataUrl(svg))
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          }
          const jpeg = await canvasToJpegBytes(canvas)
          raster = { jpeg, width: canvas.width, height: canvas.height }
        }
      }

      const pdfBlob = jpegToPdfBlob(raster.jpeg, raster.width, raster.height)
      const pdfNameBase = (fileName || openedDiagramId && `diagram-${openedDiagramId}` || 'diagram')
        .toString()
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\.pdf$/i, '')
        .trim() || 'diagram'
      downloadBlob(pdfBlob, `${pdfNameBase}.pdf`)
      showNotification('PDF скачан', 'success')
    } catch (err) {
      console.error('PDF export error:', err)
      showNotification('Не удалось экспортировать PDF: ' + (err.message || err), 'error')
    }
  }

  const handleRenderChart = async () => {
    if (!fileId) {
      showNotification('Необходимо сохранить файл перед построением диаграммы!', 'warning')
      return
    }

    if (selectedColumns.length === 0) {
      showNotification('Выберите хотя бы один столбец для иерархии!', 'warning')
      return
    }

    setLoading(true)
    setError(null)
    setChartHtml('') // Очищаем предыдущую диаграмму
    setD3Payload(null)

    try {
      // Загружаем сохраненные данные с сервера
      const fileResponse = await apiClient.get(`/files/${fileId}`)
      const savedData = fileResponse.data.data
      const savedColumns = fileResponse.data.columns

      if (!savedData || savedData.length === 0) {
        showNotification('Нет данных для построения диаграммы!', 'warning')
        setLoading(false)
        return
      }

      // Отправляем только столбцы, которые реально есть в открытом файле (на случай устаревшего состояния)
      const savedColumnsSet = new Set(savedColumns)
      const hierarchyToSend = columnOrder.filter(c => selectedColumns.includes(c) && savedColumnsSet.has(c))
      if (hierarchyToSend.length === 0) {
        showNotification('Выберите столбцы из списка текущего файла. Часть выбранных столбцов в этом файле отсутствует.', 'warning')
        setLoading(false)
        return
      }

      const response = await apiClient.post('/charts/generate', {
        data: savedData,
        columns: savedColumns,
        hierarchy_columns: hierarchyToSend,
        value_column: (valueColumn && savedColumnsSet.has(valueColumn)) ? valueColumn : null,
        use_gradient: useGradient,
        uniform_size: uniformSize,
        show_zero_values: showZeroValues,
        text_along_circumference: textAlongCircumference,
        show_full_text: showFullText,
        dynamic_font_size: dynamicFontSize,
        color_map: colorMap
      })

      if (response.data && response.data.html) {
        setTimeout(() => {
          setChartHtml(response.data.html)
          setLoading(false)
        }, 100)
      } else {
        throw new Error('Неверный формат ответа от сервера')
      }
    } catch (err) {
      console.error('Ошибка генерации диаграммы:', err)
      let errorMessage = err.response?.data?.detail || err.message || 'Ошибка генерации диаграммы'
      
      // Обрабатываем специфические ошибки
      if (errorMessage.includes('between') || errorMessage.includes('integer') || errorMessage.includes('<=') || errorMessage.includes('str')) {
        errorMessage = `Ошибка при обработке столбца значений "${valueColumn}". Возможно, в данных есть пустые ячейки или нечисловые значения. Проверьте данные или выберите "Без значений".`
      }
      
      setError(errorMessage)
      setChartHtml('')
      setLoading(false)
      showNotification('Ошибка генерации диаграммы: ' + errorMessage, 'error')
    }
  }

  const handleRenderChartD3 = async () => {
    if (!fileId) {
      showNotification('Необходимо сохранить файл перед построением диаграммы!', 'warning')
      return
    }

    if (selectedColumns.length === 0) {
      showNotification('Выберите хотя бы один столбец для иерархии!', 'warning')
      return
    }

    setLoading(true)
    setError(null)
    setChartHtml('')
    setD3Payload(null)
    setContentSize({ width: 0, height: 0 })

    try {
      const fileResponse = await apiClient.get(`/files/${fileId}`)
      const savedData = fileResponse.data.data
      const savedColumns = fileResponse.data.columns

      if (!savedData || savedData.length === 0) {
        showNotification('Нет данных для построения диаграммы!', 'warning')
        setLoading(false)
        return
      }

      const savedColumnsSet = new Set(savedColumns)
      const hierarchyToSend = columnOrder.filter(c => selectedColumns.includes(c) && savedColumnsSet.has(c))
      if (hierarchyToSend.length === 0) {
        showNotification('Выберите столбцы из списка текущего файла. Часть выбранных столбцов в этом файле отсутствует.', 'warning')
        setLoading(false)
        return
      }

      const response = await apiClient.post('/charts/generate-d3', {
        data: savedData,
        columns: savedColumns,
        hierarchy_columns: hierarchyToSend,
        value_column: (valueColumn && savedColumnsSet.has(valueColumn)) ? valueColumn : null,
        use_gradient: useGradient,
        uniform_size: uniformSize,
        show_zero_values: showZeroValues,
        text_along_circumference: textAlongCircumference,
        show_full_text: showFullText,
        dynamic_font_size: dynamicFontSize,
        color_map: colorMap
      })

      if (response.data && response.data.tree) {
        setD3Payload(response.data)
        setLoading(false)
      } else {
        throw new Error('Неверный формат ответа от сервера')
      }
    } catch (err) {
      console.error('Ошибка генерации D3 диаграммы:', err)
      const errorMessage = err.response?.data?.detail || err.message || 'Ошибка генерации диаграммы'
      setError(errorMessage)
      setChartHtml('')
      setD3Payload(null)
      setLoading(false)
      showNotification('Ошибка генерации диаграммы: ' + errorMessage, 'error')
    }
  }

  const handleSaveDiagram = async () => {
    // Сохранение/обновление открытой диаграммы
    if (!fileId || !user || (!chartHtml && !d3Payload)) {
      showNotification('Для сохранения необходимо построить диаграмму и быть авторизованным пользователем', 'warning')
      return
    }

    if (!openedDiagramId) {
      showNotification('Используйте "Сохранить как новую" для создания новой диаграммы', 'warning')
      return
    }

    setIsSaving(true)
    try {
      // Получаем текущую диаграмму чтобы сохранить её имя
      const currentDiagram = await apiClient.get(`/diagrams/${openedDiagramId}`)
      
      const diagramData = {
        data_file_id: fileId,
        name: currentDiagram.data.name, // Сохраняем оригинальное имя
        hierarchy_columns: columnOrder.filter(c => selectedColumns.includes(c)),
        value_column: valueColumn || null,
        use_gradient: useGradient,
        uniform_size: uniformSize,
        show_zero_values: showZeroValues,
        text_along_circumference: textAlongCircumference,
        show_full_text: showFullText,
        dynamic_font_size: dynamicFontSize,
        color_map: colorMap
      }

      await apiClient.put(`/diagrams/${openedDiagramId}`, diagramData)

      if (onChartSaved) {
        onChartSaved()
      }
      showNotification('Диаграмма успешно обновлена!', 'success')
    } catch (err) {
      showNotification('Ошибка сохранения диаграммы: ' + (err.response?.data?.detail || err.message), 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveAsNew = async (diagramName) => {
    if (!diagramName || !String(diagramName).trim()) {
      showNotification('Укажите наименование диаграммы', 'warning')
      return
    }
    if (!fileId || !user || (!chartHtml && !d3Payload)) {
      showNotification('Для сохранения необходимо построить диаграмму и быть авторизованным пользователем', 'warning')
      return
    }

    setIsSaving(true)
    try {
      const diagramData = {
        data_file_id: fileId,
        name: diagramName,
        hierarchy_columns: columnOrder.filter(c => selectedColumns.includes(c)),
        value_column: valueColumn || null,
        use_gradient: useGradient,
        uniform_size: uniformSize,
        show_zero_values: showZeroValues,
        text_along_circumference: textAlongCircumference,
        show_full_text: showFullText,
        dynamic_font_size: dynamicFontSize,
        color_map: colorMap
      }

      const url = projectId 
        ? `/diagrams/?project_id=${projectId}`
        : '/diagrams/'
      
      const created = await apiClient.post(url, diagramData)

      if (onChartSaved) {
        await onChartSaved(created?.data)
      }
      showNotification('Новая диаграмма успешно сохранена!', 'success')
      setSaveAsNewModal(false)
    } catch (err) {
      showNotification('Ошибка сохранения диаграммы: ' + (err.response?.data?.detail || err.message), 'error')
    } finally {
      setIsSaving(false)
    }
  }

  // Render Plotly chart via iframe. Do not reset contentSize when chartHtml
  // is cleared — D3 mode owns sizing via onSizeChange.
  useEffect(() => {
    if (!chartHtml) {
      if (chartContainerRef.current) chartContainerRef.current.innerHTML = ''
      return
    }
    if (!chartContainerRef.current) return

    chartContainerRef.current.innerHTML = ''
    setContentSize({ width: 0, height: 0 })

    if (chartHtml) {
      try {
        const iframe = document.createElement('iframe')
        iframe.srcdoc = chartHtml
        iframe.style.width = '100%'
        iframe.style.height = '100%'
        iframe.style.border = 'none'
        iframe.style.overflow = 'hidden'
        iframe.style.display = 'block'
        iframe.style.background = 'white'
        iframe.setAttribute('scrolling', 'no')

        const updateContentSize = () => {
          try {
            const doc = iframe.contentDocument
            if (!doc) return
            const body = doc.body
            const html = doc.documentElement
            const width = Math.max(
              body?.scrollWidth || 0,
              body?.offsetWidth || 0,
              html?.clientWidth || 0,
              html?.scrollWidth || 0,
              html?.offsetWidth || 0
            )
            const height = Math.max(
              body?.scrollHeight || 0,
              body?.offsetHeight || 0,
              html?.clientHeight || 0,
              html?.scrollHeight || 0,
              html?.offsetHeight || 0
            )
            if (width && height) {
              iframe.style.width = `${width}px`
              iframe.style.height = `${height}px`
              setContentSize({ width, height })
            }
          } catch (sizeErr) {
            console.warn('Не удалось измерить размер диаграммы:', sizeErr)
          }
        }
        
        iframe.onerror = (e) => {
          console.error('Ошибка загрузки iframe:', e)
          setError('Ошибка отображения диаграммы')
        }

        iframe.onload = () => {
          updateContentSize()
          setTimeout(updateContentSize, 100)
        }
        
        chartContainerRef.current.appendChild(iframe)
      } catch (err) {
        console.error('Ошибка создания iframe:', err)
        setError('Ошибка отображения диаграммы: ' + err.message)
      }
    }
  }, [chartHtml])

  if (!data || data.length === 0) {
    return (
      <div className="chart-tab">
        <div className="chart-controls">
          <p>Нет данных для построения диаграммы. Загрузите файл или создайте новую таблицу.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="chart-tab">
      <div className="chart-controls">
        <p><strong>Столбцы для иерархии (порядок важен):</strong></p>
        <div className="columns-list" ref={columnsContainerRef}>
          {/* Показываем все столбцы в визуальном порядке при перетаскивании */}
          {getVisualOrder()
            .sort((a, b) => a.idx - b.idx)
            .map(({ col, isDragged }) => {
              const originalIdx = columnOrder.indexOf(col)
              const visualOrder = getVisualOrder()
              const item = visualOrder.find(v => v.col === col)
              const visualIdx = item ? item.idx : originalIdx
              
              // Определяем, изменилась ли позиция элемента (но НЕ для перетаскиваемого)
              const positionChanged = showPreview && !isDragged && visualIdx !== originalIdx
              
              return (
                <div 
                  key={col} 
                  className={`column-label ${isDragged ? 'dragging' : ''} ${positionChanged ? 'preview' : ''}`}
                  style={{
                    order: visualIdx,
                    transition: showPreview ? 'all 0.3s ease' : 'all 0.15s ease'
                  }}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, col)}
                  onDragEnd={(e) => handleDragEnd(e)}
                  onDragOver={(e) => {
                    if (draggedColumn && !isDragged) {
                      e.preventDefault()
                      e.stopPropagation()
                      // ВАЖНО: передаем ВИЗУАЛЬНЫЙ индекс, а не originalIdx!
                      handleDragOver(e, visualIdx)
                    }
                  }}
                  onDrop={(e) => {
                    if (draggedColumn) {
                      handleDrop(e)
                    }
                  }}
                  onClick={(e) => {
                    // Если клик был по кнопке или drag handle, не переключаем
                    const target = e.target
                    if (target.tagName === 'BUTTON' || 
                        target.classList.contains('drag-handle') || 
                        target.closest('button') || 
                        target.closest('.drag-handle')) {
                      return
                    }
                    // Если клик был по label, input или span - переключаем чекбокс
                    handleColumnToggle(col)
                  }}
                >
                  <label 
                    style={{ display: 'flex', alignItems: 'center', flex: 1, cursor: 'pointer', userSelect: 'none', background: 'transparent' }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedColumns.includes(col)}
                      onChange={() => handleColumnToggle(col)}
                      disabled={isDragged}
                    />
                    <span title={col}>{sanitizeColumnLabel(col) || col}</span>
                  </label>
                  <div className="move-buttons">
                    <button
                      type="button"
                      className="move-btn move-btn-up"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleMoveColumn(col, -1)
                      }}
                      disabled={originalIdx === 0 || isDragged}
                      title="Переместить вверх"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="move-btn move-btn-down"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleMoveColumn(col, 1)
                      }}
                      disabled={originalIdx === columnOrder.length - 1 || isDragged}
                      title="Переместить вниз"
                    >
                      ↓
                    </button>
                  </div>
                  <div 
                    className="drag-handle"
                    onMouseDown={(e) => {
                      // Предотвращаем клик на родительский элемент
                      e.stopPropagation()
                    }}
                    title="Перетащите для изменения порядка"
                  >
                    <span>⋮⋮</span>
                  </div>
                </div>
              )
            })}
        </div>

        <p><strong>Столбец значений (процент выполнения):</strong></p>
        <select
          value={valueColumn}
          onChange={(e) => setValueColumn(e.target.value)}
          title="Опционально: выберите числовой столбец (например «Выполнено %») для размера секторов"
        >
          <option value="">Без значений</option>
          {valueColumnOptions.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <div style={{ marginTop: '15px' }}>
          <label style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <input
              type="checkbox"
              checked={uniformSize}
              onChange={(e) => setUniformSize(e.target.checked)}
              disabled={!valueColumn}
            />
            <span style={{ opacity: !valueColumn ? 0.5 : 1 }}>
              Равномерное распределение секторов {!valueColumn && '*'}
            </span>
            {!valueColumn && (
              <span 
                style={{ cursor: 'help', color: '#666', fontSize: '14px' }}
                title="Требуется выбрать столбец значений"
              >
                ℹ️
              </span>
            )}
            {valueColumn && (
              <span 
                style={{ cursor: 'help', color: '#666', fontSize: '14px' }}
                title="Все сектора будут одинакового размера независимо от значений"
              >
                ℹ️
              </span>
            )}
          </label>
          <br />
          <br />
                    <label style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <input
              type="checkbox"
              checked={useGradient}
              onChange={(e) => setUseGradient(e.target.checked)}
            />
            <span>
              Градиент по глубине (осветлять вложенные сектора)
            </span>
            <span 
              style={{ cursor: 'help', color: '#666', fontSize: '14px' }}
              title="При включении дочерние сектора осветляются относительно выбранного цвета сектора 1-го уровня"
            >
              ℹ️
            </span>
          </label>
          <br />
          <div className="sector-colors">
            <div className="sector-colors-header">
              <strong>
                {l1Sectors.length === 1 ? 'Цвет корневого сектора' : 'Цвета секторов (корень / 1-й уровень)'}
              </strong>
              <span 
                style={{ cursor: 'help', color: '#666', fontSize: '14px' }}
                title="Цвет корневого или первого уровня. При градиенте дочерние сектора осветляются от выбранного цвета."
              >
                ℹ️
              </span>
              {l1Sectors.length > 0 && (
                <button
                  type="button"
                  className="sector-colors-reset"
                  onClick={handleResetSectorColors}
                  title="Сбросить к палитре по умолчанию"
                >
                  Сбросить
                </button>
              )}
            </div>
            {l1Sectors.length === 0 ? (
              <div className="sector-colors-empty">
                Выберите столбцы иерархии — появятся сектора 1-го уровня
              </div>
            ) : (
              <div className="sector-colors-list">
                {l1Sectors.map(name => {
                  const hex = normalizeHex(colorMap[name] || '#1f77b4')
                  return (
                  <label key={name} className="sector-color-row">
                    <input
                      type="color"
                      value={hex}
                      onChange={(e) => handleSectorColorChange(name, e.target.value)}
                      title={name}
                    />
                    <input
                      type="text"
                      className="sector-color-hex"
                      defaultValue={hex.toUpperCase()}
                      key={`hex-${name}-${hex}`}
                      onBlur={(e) => handleSectorColorChange(name, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleSectorColorChange(name, e.currentTarget.value)
                          e.currentTarget.blur()
                        }
                      }}
                      maxLength={7}
                      spellCheck={false}
                      title="HEX"
                      aria-label={`HEX цвет для ${name}`}
                    />
                    <span className="sector-color-rgb" title="R / G / B">
                      <label>R<input
                        type="number" min={0} max={255}
                        value={parseInt(hex.slice(1,3),16)}
                        onChange={(e) => {
                          const r = Math.max(0, Math.min(255, Number(e.target.value)||0))
                          const g = parseInt(hex.slice(3,5),16)
                          const b = parseInt(hex.slice(5,7),16)
                          const to = (n) => n.toString(16).padStart(2,'0')
                          handleSectorColorChange(name, `#${to(r)}${to(g)}${to(b)}`)
                        }}
                      /></label>
                      <label>G<input
                        type="number" min={0} max={255}
                        value={parseInt(hex.slice(3,5),16)}
                        onChange={(e) => {
                          const r = parseInt(hex.slice(1,3),16)
                          const g = Math.max(0, Math.min(255, Number(e.target.value)||0))
                          const b = parseInt(hex.slice(5,7),16)
                          const to = (n) => n.toString(16).padStart(2,'0')
                          handleSectorColorChange(name, `#${to(r)}${to(g)}${to(b)}`)
                        }}
                      /></label>
                      <label>B<input
                        type="number" min={0} max={255}
                        value={parseInt(hex.slice(5,7),16)}
                        onChange={(e) => {
                          const r = parseInt(hex.slice(1,3),16)
                          const g = parseInt(hex.slice(3,5),16)
                          const b = Math.max(0, Math.min(255, Number(e.target.value)||0))
                          const to = (n) => n.toString(16).padStart(2,'0')
                          handleSectorColorChange(name, `#${to(r)}${to(g)}${to(b)}`)
                        }}
                      /></label>
                    </span>
                    <span className="sector-color-name" title={name}>{name}</span>
                  </label>
                  )
                })}
              </div>
            )}
          </div>
          <br />
<label style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <input
              type="checkbox"
              checked={textAlongCircumference}
              onChange={(e) => setTextAlongCircumference(e.target.checked)}
            />
            <span>
              Надпись по окружности
            </span>
            <span 
              style={{ cursor: 'help', color: '#666', fontSize: '14px' }}
              title="Отображает текст вдоль окружности с изгибом и переносами строк для лучшей читаемости длинных текстов"
            >
              ℹ️
            </span>
          </label>
          <br />
          <label style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <input
              type="checkbox"
              checked={showFullText}
              onChange={(e) => setShowFullText(e.target.checked)}
            />
            <span>
              Отображать весь текст
            </span>
            <span 
              style={{ cursor: 'help', color: '#666', fontSize: '14px' }}
              title="Показывает весь текст без обрезки. Внимание: может значительно увеличить размер диаграммы!"
            >
              ⚠️
            </span>
          </label>
          <br />
          <label style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <input
              type="checkbox"
              checked={dynamicFontSize}
              onChange={(e) => setDynamicFontSize(e.target.checked)}
            />
            <span>
              Динамический размер текста
            </span>
            <span 
              style={{ cursor: 'help', color: '#666', fontSize: '14px' }}
              title="Автоматически увеличивает размер шрифта там, где больше свободного пространства (внутренние сектора)"
            >
              ℹ️
            </span>
          </label>
          {!valueColumn && (
            <div style={{ 
              marginTop: '5px', 
              fontSize: '12px', 
              color: '#666', 
              fontStyle: 'italic',
              paddingLeft: '25px'
            }}>
              * Равномерное распределение секторов требует выбора столбца значений
            </div>
          )}
        </div>

        <div className="chart-actions">
          <button type="button" className="primary chart-build-btn" onClick={handleRenderChart} disabled={loading}>
            {loading ? 'Построение...' : 'Построить диаграмму'}
          </button>
          <button type="button" className="d3-btn chart-build-btn" onClick={handleRenderChartD3} disabled={loading}>
            {loading ? 'Построение...' : 'Диаграмма D3'}
          </button>
          {user && (chartHtml || d3Payload) && (
            <>
              <button 
                type="button" 
                className="save-btn" 
                onClick={handleSaveDiagram}
                disabled={isSaving || !openedDiagramId}
                title={!openedDiagramId ? 'Доступно только для открытых диаграмм' : 'Сохранить изменения в текущую диаграмму'}
              >
                {isSaving ? 'Сохранение...' : '💾 Сохранить диаграмму'}
              </button>
              <button 
                type="button" 
                className="save-as-new-btn" 
                onClick={() => setSaveAsNewModal(true)}
                disabled={isSaving}
              >
                {isSaving ? 'Сохранение...' : '📥 Сохранить как новую'}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="error">
          {error}
        </div>
      )}

      <SaveAsNewModal
        key={saveAsNewModal ? 'save-as-new-open' : 'save-as-new-closed'}
        isOpen={saveAsNewModal}
        onClose={() => setSaveAsNewModal(false)}
        onSave={handleSaveAsNew}
        onEmptyName={() => showNotification('Укажите наименование диаграммы', 'warning')}
      />

      <div
        className={`plot-area${isFullscreen ? ' plot-area--fullscreen' : ''}`}
        ref={plotAreaRef}
      >
      <div className="chart-zoom-bar">
        <span className="zoom-label">Масштаб</span>
        <button
          type="button"
          className="zoom-btn"
          onClick={() => handleZoomChange(zoomPercent - 25)}
          title="Уменьшить"
        >
          −
        </button>
        <input
          type="range"
          min="25"
          max="500"
          step="5"
          value={zoomPercent}
          onChange={(e) => handleZoomChange(Number(e.target.value))}
          className="zoom-slider"
          aria-label="Масштаб диаграммы"
        />
        <span className="zoom-value">{zoomPercent}%</span>
        <button
          type="button"
          className="zoom-btn"
          onClick={() => handleZoomChange(zoomPercent + 25)}
          title="Увеличить"
        >
          +
        </button>
        
        <span className="zoom-spacer" />
        <button
          type="button"
          className="zoom-btn"
          onClick={handleToggleFullscreen}
          disabled={!chartHtml && !d3Payload}
          title={isFullscreen ? "Выйти из полноэкранного режима" : "Полноэкранный режим"}
        >
          {isFullscreen ? "Выйти из полноэкранного" : "На весь экран"}
        </button>
        <button
          type="button"
          className="zoom-btn"
          onClick={handleExportPdf}
          disabled={!canExportPdf}
          title={canExportPdf ? "Export chart to PDF" : "PDF unavailable (no chart SVG)"}
        >
          PDF
        </button>
      </div>

      {loading && (
        <div className="plot" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>⏳ Построение диаграммы...</p>
        </div>
      )}

      {!loading && chartHtml && (
        <div className="plot">
          <div
            className="plot-scroll"
            style={
              contentSize.width && contentSize.height
                ? {
                    width: `${(contentSize.width * zoomPercent) / 100}px`,
                    height: `${(contentSize.height * zoomPercent) / 100}px`
                  }
                : { width: '100%', height: '100%' }
            }
          >
            <div
              className="plot-inner"
              ref={chartContainerRef}
              style={{
                width: contentSize.width ? `${contentSize.width}px` : '100%',
                height: contentSize.height ? `${contentSize.height}px` : '100%',
                transform: `scale(${zoomPercent / 100})`
              }}
            >
              {/* Диаграмма вставляется через iframe */}
            </div>
          </div>
        </div>
      )}

      {!loading && d3Payload && (
        <div className="plot">
          <div
            className="plot-scroll"
            style={
              contentSize.width && contentSize.height
                ? {
                    width: `${(contentSize.width * zoomPercent) / 100}px`,
                    height: `${(contentSize.height * zoomPercent) / 100}px`
                  }
                : { width: '100%', height: '100%' }
            }
          >
            <div
              className="plot-inner"
              style={{
                width: contentSize.width ? `${contentSize.width}px` : '100%',
                height: contentSize.height ? `${contentSize.height}px` : '100%',
                transform: `scale(${zoomPercent / 100})`
              }}
            >
              <D3Sunburst
                payload={d3Payload}
                showFullText={showFullText}
                textAlongCircumference={textAlongCircumference}
                dynamicFontSize={dynamicFontSize}
                onSizeChange={handleD3SizeChange}
              />
            </div>
          </div>
        </div>
      )}

      {!loading && !chartHtml && !d3Payload && !error && (
        <div className="plot" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
          <p>Диаграмма будет отображена здесь после построения</p>
        </div>
      )}
    </div>
    </div>
  )
}

export default ChartTab
