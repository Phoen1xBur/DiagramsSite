import React, { useState, useEffect, useRef } from 'react'
import apiClient from '../api/client'
import { useNotification } from '../contexts/NotificationContext'
import SaveAsNewModal from './SaveAsNewModal'
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveAsNewModal, setSaveAsNewModal] = useState(false)
  const [draggedColumn, setDraggedColumn] = useState(null)
  const [draggedFromIndex, setDraggedFromIndex] = useState(null) // ИСХОДНАЯ позиция при начале drag
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [showPreview, setShowPreview] = useState(false)
  const chartContainerRef = useRef(null)
  const columnsContainerRef = useRef(null)
  const autoScrollIntervalRef = useRef(null)

  useEffect(() => {
    if (columns && columns.length > 0) {
      // Инициализируем порядок столбцов из исходного массива
      setColumnOrder([...columns])
      // По умолчанию выбираем первые 3 столбца
      setSelectedColumns(columns.slice(0, Math.min(3, columns.length)))
    }
  }, [columns])

  // Восстанавливаем сохраненные настройки диаграммы из localStorage (без HTML)
  useEffect(() => {
    if (fileId && columns && columns.length > 0) {
      const saved = localStorage.getItem(`chart_settings_${fileId}`)
      if (saved) {
        try {
          const chartData = JSON.parse(saved)
          setSelectedColumns(chartData.selectedColumns || [])
          setValueColumn(chartData.valueColumn || '')
          setUseGradient(chartData.useGradient !== undefined ? chartData.useGradient : true)
          setUniformSize(chartData.uniformSize || false)
          setShowZeroValues(chartData.showZeroValues !== undefined ? chartData.showZeroValues : true)
          setTextAlongCircumference(chartData.textAlongCircumference || false)
          setShowFullText(chartData.showFullText || false)
          setDynamicFontSize(chartData.dynamicFontSize || false)
          // Восстанавливаем порядок столбцов, если он сохранен
          if (chartData.columnOrder && chartData.columnOrder.length === columns.length) {
            setColumnOrder(chartData.columnOrder)
          }
          // HTML не сохраняем, он будет сгенерирован заново при необходимости
        } catch (e) {
          console.error('Ошибка восстановления настроек диаграммы:', e)
        }
      }
    }
  }, [fileId, columns])

  // Сохраняем только настройки диаграммы в localStorage (без HTML, чтобы не превысить квоту)
  useEffect(() => {
    if (fileId && columnOrder.length > 0) {
      try {
        localStorage.setItem(`chart_settings_${fileId}`, JSON.stringify({
          selectedColumns,
          columnOrder,
          valueColumn,
          useGradient,
          uniformSize,
          showZeroValues,
          textAlongCircumference,
          showFullText,
          dynamicFontSize
        }))
      } catch (e) {
        // Если не удалось сохранить (например, квота превышена), просто игнорируем
        console.warn('Не удалось сохранить настройки диаграммы в localStorage:', e)
      }
    }
  }, [selectedColumns, columnOrder, valueColumn, useGradient, uniformSize, showZeroValues, textAlongCircumference, showFullText, dynamicFontSize, fileId])

  // Загружаем настройки сохраненной диаграммы при открытии
  useEffect(() => {
    if (openedDiagramId) {
      const loadDiagramSettings = async () => {
        try {
          const diagramResponse = await apiClient.get(`/diagrams/${openedDiagramId}`)
          const diagram = diagramResponse.data
          
          // Восстанавливаем настройки из сохраненной диаграммы
          if (diagram.hierarchy_columns) {
            setSelectedColumns(diagram.hierarchy_columns)
          }
          if (diagram.value_column !== null && diagram.value_column !== undefined) {
            setValueColumn(diagram.value_column)
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
  }, [openedDiagramId])

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

      const response = await apiClient.post('/charts/generate', {
        data: savedData,
        columns: savedColumns,
        hierarchy_columns: selectedColumns,
        value_column: valueColumn || null,
        use_gradient: useGradient,
        uniform_size: uniformSize,
        show_zero_values: showZeroValues,
        text_along_circumference: textAlongCircumference,
        show_full_text: showFullText,
        dynamic_font_size: dynamicFontSize
      })

      if (response.data && response.data.html) {
        // Небольшая задержка для правильного рендеринга
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

    // Очищаем контейнер
    chartContainerRef.current.innerHTML = ''

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
        
        // Обработчик ошибок
        iframe.onerror = (e) => {
          console.error('Ошибка загрузки iframe:', e)
          setError('Ошибка отображения диаграммы')
        }
        
        // Обработчик загрузки
        iframe.onload = () => {
          console.log('Диаграмма успешно загружена')
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
      {fileName && (
        <div style={{ 
          marginBottom: '15px', 
          padding: '10px 15px', 
          background: '#f5f5f5', 
          borderRadius: '6px',
          borderLeft: '4px solid #4CAF50'
        }}>
          <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
            <strong>Открытый файл:</strong> {fileName}
          </p>
        </div>
      )}
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

      {loading && (
        <div className="plot" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>⏳ Построение диаграммы...</p>
        </div>
      )}

      {!loading && chartHtml && (
        <div className="plot" ref={chartContainerRef}>
          {/* Диаграмма будет вставлена через iframe */}
        </div>
      )}

      {!loading && !chartHtml && !error && (
        <div className="plot" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
          <p>Диаграмма будет отображена здесь после построения</p>
        </div>
      )}
    </div>
  )
}

export default ChartTab
