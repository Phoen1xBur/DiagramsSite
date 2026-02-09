import React, { useState, useEffect, useRef } from 'react'
import apiClient from '../api/client'
import { useNotification } from '../contexts/NotificationContext'
import SaveAsNewModal from './SaveAsNewModal'
import D3Sunburst from './D3Sunburst'
import './ChartTab.css'

function ChartTab({ data, columns, fileId, user, onChartSaved, projectId, openedDiagramId, fileName }) {
  const { showNotification } = useNotification()
  const [selectedColumns, setSelectedColumns] = useState([])
  const [columnOrder, setColumnOrder] = useState([]) // Порядок всех столбцов
  const [valueColumn, setValueColumn] = useState('')
  const [useGradient, setUseGradient] = useState(true)
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
  const columnsContainerRef = useRef(null)
  const autoScrollIntervalRef = useRef(null)

  // Порядок столбцов всегда как в редакторе (из props)
  useEffect(() => {
    if (columns && columns.length > 0) {
      setColumnOrder([...columns])
      // По умолчанию выбираем первые 3 столбца только при первой загрузке файла
      setSelectedColumns(prev => prev.length === 0 ? columns.slice(0, Math.min(3, columns.length)) : prev)
    }
  }, [columns])

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
  }, [selectedColumns, valueColumn, useGradient, uniformSize, showZeroValues, textAlongCircumference, showFullText, dynamicFontSize, fileId, columns])

  // Загружаем настройки сохраненной диаграммы при открытии (только если диаграмма привязана к текущему файлу)
  // Подставляем только те столбцы, которые есть в текущем файле (по имени)
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
    setZoomPercent(clampZoom(value))
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
      const hierarchyToSend = selectedColumns.filter(c => savedColumnsSet.has(c))
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
        dynamic_font_size: dynamicFontSize
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
      const hierarchyToSend = selectedColumns.filter(c => savedColumnsSet.has(c))
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
        dynamic_font_size: dynamicFontSize
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
    if (!fileId || !user || !chartHtml) {
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
        hierarchy_columns: selectedColumns,
        value_column: valueColumn || null,
        use_gradient: useGradient,
        uniform_size: uniformSize,
        show_zero_values: showZeroValues,
        text_along_circumference: textAlongCircumference,
        show_full_text: showFullText,
        dynamic_font_size: dynamicFontSize
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
    if (!fileId || !user || !chartHtml) {
      showNotification('Для сохранения необходимо построить диаграмму и быть авторизованным пользователем', 'warning')
      return
    }

    setIsSaving(true)
    try {
      const diagramData = {
        data_file_id: fileId,
        name: diagramName,
        hierarchy_columns: selectedColumns,
        value_column: valueColumn || null,
        use_gradient: useGradient,
        uniform_size: uniformSize,
        show_zero_values: showZeroValues,
        text_along_circumference: textAlongCircumference,
        show_full_text: showFullText,
        dynamic_font_size: dynamicFontSize
      }

      const url = projectId 
        ? `/diagrams/?project_id=${projectId}`
        : '/diagrams/'
      
      await apiClient.post(url, diagramData)

      if (onChartSaved) {
        onChartSaved()
      }
      showNotification('Новая диаграмма успешно сохранена!', 'success')
      setSaveAsNewModal(false)
    } catch (err) {
      showNotification('Ошибка сохранения диаграммы: ' + (err.response?.data?.detail || err.message), 'error')
    } finally {
      setIsSaving(false)
    }
  }

  // Рендерим диаграмму через iframe
  useEffect(() => {
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
                    <span>{col}</span>
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
          title="Опционально: выберите столбец с числовыми значениями от 0 до 100 для отображения процента заполнения секторов"
        >
          <option value="">Без значений</option>
          {columns.map(col => (
            <option key={col} value={col}>{col}</option>
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
              disabled={!valueColumn}
            />
            <span style={{ opacity: !valueColumn ? 0.5 : 1 }}>
              Использовать градиент (внешние сектора ярче) {!valueColumn && '*'}
            </span>
            {!valueColumn && (
              <span 
                style={{ cursor: 'help', color: '#666', fontSize: '14px' }}
                title="Требуется выбрать столбец значений для работы градиента"
              >
                ℹ️
              </span>
            )}
          </label>
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
              * Опции с градиентом требуют выбора столбца значений
            </div>
          )}
        </div>

        <div className="chart-actions">
          <button type="button" className="primary" onClick={handleRenderChart} disabled={loading}>
            {loading ? 'Построение...' : 'Построить диаграмму'}
          </button>
          <button type="button" className="d3-btn" onClick={handleRenderChartD3} disabled={loading}>
            {loading ? 'Построение...' : 'Диаграмма D3'}
          </button>
          {user && chartHtml && (
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
        isOpen={saveAsNewModal}
        onClose={() => setSaveAsNewModal(false)}
        onSave={handleSaveAsNew}
      />

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
        <button
          type="button"
          className="zoom-reset"
          onClick={() => handleZoomChange(100)}
          title="Сбросить масштаб"
        >
          100%
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
                onSizeChange={(size) => {
                  if (size && size !== contentSize.width) {
                    setContentSize({ width: size, height: size })
                  }
                }}
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
  )
}

export default ChartTab
