import React, { useState, useEffect, useRef } from 'react'
import apiClient from '../api/client'
import './ChartTab.css'

function ChartTab({ data, columns, fileId, user, onChartSaved, projectId }) {
  const [selectedColumns, setSelectedColumns] = useState([])
  const [valueColumn, setValueColumn] = useState('')
  const [showWhite, setShowWhite] = useState(true)
  const [useGradient, setUseGradient] = useState(true)
  const [chartHtml, setChartHtml] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [savedDiagramId, setSavedDiagramId] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const chartContainerRef = useRef(null)

  useEffect(() => {
    if (columns && columns.length > 0) {
      // По умолчанию выбираем первые 3 столбца
      setSelectedColumns(columns.slice(0, Math.min(3, columns.length)))
    }
  }, [columns])

  // Восстанавливаем сохраненные настройки диаграммы из localStorage (без HTML)
  useEffect(() => {
    if (fileId) {
      const saved = localStorage.getItem(`chart_settings_${fileId}`)
      if (saved) {
        try {
          const chartData = JSON.parse(saved)
          setSelectedColumns(chartData.selectedColumns || [])
          setValueColumn(chartData.valueColumn || '')
          setShowWhite(chartData.showWhite !== undefined ? chartData.showWhite : true)
          setUseGradient(chartData.useGradient !== undefined ? chartData.useGradient : true)
          setSavedDiagramId(chartData.diagramId || null)
          // HTML не сохраняем, он будет сгенерирован заново при необходимости
        } catch (e) {
          console.error('Ошибка восстановления настроек диаграммы:', e)
        }
      }
    }
  }, [fileId])

  // Сохраняем только настройки диаграммы в localStorage (без HTML, чтобы не превысить квоту)
  useEffect(() => {
    if (fileId) {
      try {
        localStorage.setItem(`chart_settings_${fileId}`, JSON.stringify({
          selectedColumns,
          valueColumn,
          showWhite,
          useGradient,
          diagramId: savedDiagramId
        }))
      } catch (e) {
        // Если не удалось сохранить (например, квота превышена), просто игнорируем
        console.warn('Не удалось сохранить настройки диаграммы в localStorage:', e)
      }
    }
  }, [selectedColumns, valueColumn, showWhite, useGradient, savedDiagramId, fileId])

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
    const idx = selectedColumns.indexOf(col)
    if ((direction < 0 && idx === 0) || (direction > 0 && idx === selectedColumns.length - 1)) return
    
    const newColumns = [...selectedColumns]
    ;[newColumns[idx], newColumns[idx + direction]] = [newColumns[idx + direction], newColumns[idx]]
    setSelectedColumns(newColumns)
  }

  const handleRenderChart = async () => {
    if (!data || data.length === 0) {
      alert('Нет данных для построения диаграммы!')
      return
    }

    if (selectedColumns.length === 0) {
      alert('Выберите хотя бы один столбец для иерархии!')
      return
    }

    setLoading(true)
    setError(null)
    setChartHtml('') // Очищаем предыдущую диаграмму

    try {
      const response = await apiClient.post('/charts/generate', {
        data: data,
        columns: columns,
        hierarchy_columns: selectedColumns,
        value_column: valueColumn || null,
        show_white: showWhite,
        use_gradient: useGradient
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
      const errorMessage = err.response?.data?.detail || err.message || 'Ошибка генерации диаграммы'
      setError(errorMessage)
      setChartHtml('')
      setLoading(false)
      alert('Ошибка генерации диаграммы: ' + errorMessage)
    }
  }

  const handleSaveDiagram = async () => {
    if (!fileId || !user || !chartHtml) {
      alert('Для сохранения необходимо построить диаграмму и быть авторизованным пользователем')
      return
    }

    setIsSaving(true)
    try {
      const diagramData = {
        data_file_id: fileId,
        name: `Диаграмма от ${new Date().toLocaleDateString('ru-RU')}`,
        hierarchy_columns: selectedColumns,
        value_column: valueColumn || null,
        show_white: showWhite,
        use_gradient: useGradient
      }

      let response
      const url = projectId 
        ? `/diagrams/?project_id=${projectId}`
        : '/diagrams/'
      
      if (savedDiagramId) {
        // Обновляем существующую диаграмму
        response = await apiClient.put(`/diagrams/${savedDiagramId}`, diagramData)
      } else {
        // Создаем новую диаграмму
        response = await apiClient.post(url, diagramData)
        setSavedDiagramId(response.data.id)
      }

      if (onChartSaved) {
        onChartSaved()
      }
      alert('Диаграмма успешно сохранена!')
    } catch (err) {
      alert('Ошибка сохранения диаграммы: ' + (err.response?.data?.detail || err.message))
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
      <div className="chart-controls">
        <p><strong>Столбцы для иерархии (порядок важен):</strong></p>
        <div className="columns-list">
          {columns.map((col, idx) => (
            <label key={col} className="column-label" onClick={() => handleColumnToggle(col)}>
              <input
                type="checkbox"
                checked={selectedColumns.includes(col)}
                onChange={() => handleColumnToggle(col)}
                onClick={(e) => e.stopPropagation()}
              />
              <span>{col}</span>
              {selectedColumns.includes(col) && (
                <>
                  <button
                    type="button"
                    className="move-btn"
                    onClick={() => handleMoveColumn(col, -1)}
                    disabled={selectedColumns.indexOf(col) === 0}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="move-btn"
                    onClick={() => handleMoveColumn(col, 1)}
                    disabled={selectedColumns.indexOf(col) === selectedColumns.length - 1}
                  >
                    ↓
                  </button>
                </>
              )}
            </label>
          ))}
        </div>

        <p><strong>Столбец значений (процент выполнения):</strong></p>
        <select
          value={valueColumn}
          onChange={(e) => setValueColumn(e.target.value)}
        >
          <option value="">Без значений</option>
          {columns.map(col => (
            <option key={col} value={col}>{col}</option>
          ))}
        </select>

        <div style={{ marginTop: '15px' }}>
          <label>
            <input
              type="checkbox"
              checked={showWhite}
              onChange={(e) => setShowWhite(e.target.checked)}
            />
            Показывать непроработанные сектора белым
          </label>
          <br />
          <label>
            <input
              type="checkbox"
              checked={useGradient}
              onChange={(e) => setUseGradient(e.target.checked)}
            />
            Использовать градиент (внешние сектора ярче)
          </label>
        </div>

        <div className="chart-actions">
          <button type="button" className="primary" onClick={handleRenderChart} disabled={loading}>
            {loading ? 'Построение...' : 'Построить диаграмму'}
          </button>
          {user && chartHtml && (
            <button 
              type="button" 
              className="save-btn" 
              onClick={handleSaveDiagram}
              disabled={isSaving}
            >
              {isSaving ? 'Сохранение...' : '💾 Сохранить диаграмму'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="error">
          {error}
        </div>
      )}

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
