import React, { useState, useEffect } from 'react'
import apiClient from '../api/client'
import './EditorTab.css'

function EditorTab({ data, columns, onDataUpdated, fileId, user, onFileSaved }) {
  const [localData, setLocalData] = useState(data || [])
  const [localColumns, setLocalColumns] = useState(columns || [])
  const [hoveredColumn, setHoveredColumn] = useState(null)
  const [hoveredRow, setHoveredRow] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isModified, setIsModified] = useState(false)

  useEffect(() => {
    setLocalData(data || [])
    setLocalColumns(columns || [])
    setIsModified(false)
  }, [data, columns])

  const handleCellChange = (rowIdx, col, value) => {
    const newData = [...localData]
    if (!newData[rowIdx]) {
      newData[rowIdx] = {}
    }
    newData[rowIdx][col] = value
    setLocalData(newData)
    setIsModified(true)
    onDataUpdated(newData)
  }

  const handleAddRow = () => {
    const row = {}
    localColumns.forEach(col => row[col] = '')
    const newData = [...localData, row]
    setLocalData(newData)
    setIsModified(true)
    onDataUpdated(newData)
  }

  const handleAddColumn = () => {
    const colName = prompt('Введите название нового столбца:')
    if (!colName || !colName.trim()) return

    const newColumns = [...localColumns, colName.trim()]
    const newData = localData.map(row => ({
      ...row,
      [colName.trim()]: ''
    }))

    setLocalColumns(newColumns)
    setLocalData(newData)
    setIsModified(true)
    onDataUpdated(newData)
  }

  const handleDeleteRow = (rowIdx) => {
    if (localData.length <= 1) return
    const newData = localData.filter((_, idx) => idx !== rowIdx)
    setLocalData(newData)
    setIsModified(true)
    onDataUpdated(newData)
  }

  const handleDeleteColumn = (colName) => {
    if (localColumns.length <= 1) {
      return
    }
    const newColumns = localColumns.filter(c => c !== colName)
    const newData = localData.map(row => {
      const newRow = { ...row }
      delete newRow[colName]
      return newRow
    })

    setLocalColumns(newColumns)
    setLocalData(newData)
    setIsModified(true)
    onDataUpdated(newData)
  }

  const handleSave = async () => {
    if (!fileId || !user) {
      alert('Для сохранения необходимо быть авторизованным пользователем')
      return
    }

    setIsSaving(true)
    try {
      await apiClient.put(`/files/${fileId}`, {
        data: localData,
        columns: localColumns
      })
      setIsModified(false)
      // Вызываем callback для обновления состояния в родительском компоненте
      if (onFileSaved) {
        onFileSaved()
      }
      alert('Файл успешно сохранен!')
    } catch (err) {
      alert('Ошибка сохранения: ' + (err.response?.data?.detail || err.message))
    } finally {
      setIsSaving(false)
    }
  }

  if (!localData || localData.length === 0) {
    return (
      <div className="editor-tab">
        <div className="editor-container">
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <h3>Нет данных для редактирования</h3>
            <p>Загрузите файл Excel/CSV или создайте новую таблицу, чтобы начать работу</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="editor-tab">
      <div className="editor-container">
        <div className="editor-header">
          <h3>Редактор данных</h3>
          {user && (
            <div className="editor-actions">
              {isModified && (
                <span className="modified-indicator">● Изменено</span>
              )}
              <button 
                type="button" 
                onClick={handleSave}
                disabled={isSaving || !isModified}
                className="save-btn"
              >
                {isSaving ? 'Сохранение...' : '💾 Сохранить'}
              </button>
            </div>
          )}
        </div>
        <div className="editor-controls">
          <button type="button" onClick={handleAddRow}>➕ Добавить строку</button>
          <button type="button" onClick={handleAddColumn}>➕ Добавить столбец</button>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th className="row-header"></th>
                {localColumns.map(col => (
                  <th 
                    key={col}
                    className="column-header"
                  >
                    <div className="column-header-content">
                      <span>{col}</span>
                      {localColumns.length > 1 && (
                        <div className="delete-column-btn-wrapper" onMouseEnter={() => setHoveredColumn(col)} onMouseLeave={() => setHoveredColumn(null)}>
                          <button
                            className="delete-column-btn"
                            onClick={() => handleDeleteColumn(col)}
                            title="Удалить столбец"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {localData.map((row, rowIdx) => (
                <tr 
                  key={rowIdx}
                >
                  <td className="row-header-cell">
                    {localData.length > 1 && (
                      <div className="delete-row-btn-wrapper" onMouseEnter={() => setHoveredRow(rowIdx)} onMouseLeave={() => setHoveredRow(null)}>
                        <button
                          className="delete-row-btn"
                          onClick={() => handleDeleteRow(rowIdx)}
                          title="Удалить строку"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </td>
                  {localColumns.map(col => (
                    <td key={col}>
                      <input
                        type="text"
                        value={row[col] || ''}
                        onChange={(e) => handleCellChange(rowIdx, col, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default EditorTab
