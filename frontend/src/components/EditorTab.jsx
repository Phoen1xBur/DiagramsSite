import React, { useState, useEffect, useRef } from 'react'
import apiClient from '../api/client'
import { useNotification } from '../contexts/NotificationContext'
import AddColumnModal from './AddColumnModal'
import './EditorTab.css'

function EditorTab({ data, columns, onDataUpdated, fileId, user, onFileSaved, onFileIdUpdate, projectId, fileName, onFileNameChange, onColumnsUpdated }) {
  const { showNotification } = useNotification()
  const [localData, setLocalData] = useState(data || [])
  const [localColumns, setLocalColumns] = useState(columns || [])
  const [hoveredColumn, setHoveredColumn] = useState(null)
  const [hoveredRow, setHoveredRow] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isModified, setIsModified] = useState(false)
  const [editingColumn, setEditingColumn] = useState(null)
  const [editColumnValue, setEditColumnValue] = useState('')
  const [showAddColumnModal, setShowAddColumnModal] = useState(false)
  const [currentFileName, setCurrentFileName] = useState(fileName || '')
  const [editingFileName, setEditingFileName] = useState(false)
  const isInitialMount = useRef(true)
  const tableWrapperRef = useRef(null)
  const [rowMenu, setRowMenu] = useState({ isOpen: false, rowIdx: null, x: 0, y: 0 })

  const prevFileIdRef = useRef(fileId)
  
  useEffect(() => {
    // Если fileId изменился, значит загружен новый файл - сбрасываем isModified
    if (prevFileIdRef.current !== fileId) {
      prevFileIdRef.current = fileId
      setLocalData(data || [])
      setLocalColumns(columns || [])
      setIsModified(false)
    } else {
      // Обновляем данные при изменении извне, но не сбрасываем isModified
      // если пользователь уже внес изменения
      setLocalData(data || [])
      setLocalColumns(columns || [])
    }
  }, [data, columns, fileId])

  useEffect(() => {
    if (!rowMenu.isOpen) return

    const handleClickOutside = (event) => {
      if (!tableWrapperRef.current) return
      if (!tableWrapperRef.current.contains(event.target)) {
        setRowMenu({ isOpen: false, rowIdx: null, x: 0, y: 0 })
      }
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setRowMenu({ isOpen: false, rowIdx: null, x: 0, y: 0 })
      }
    }

    const handleScroll = () => {
      setRowMenu({ isOpen: false, rowIdx: null, x: 0, y: 0 })
    }

    document.addEventListener('click', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('scroll', handleScroll, true)
    if (tableWrapperRef.current) {
      tableWrapperRef.current.addEventListener('scroll', handleScroll)
    }

    return () => {
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('scroll', handleScroll, true)
      if (tableWrapperRef.current) {
        tableWrapperRef.current.removeEventListener('scroll', handleScroll)
      }
    }
  }, [rowMenu.isOpen])

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

  const handleAddColumn = (colName) => {
    if (!colName || !colName.trim()) return

    // Проверяем уникальность названия
    if (localColumns.includes(colName.trim())) {
      showNotification('Столбец с таким названием уже существует', 'warning')
      return
    }

    const newColumns = [...localColumns, colName.trim()]
    const newData = localData.map(row => ({
      ...row,
      [colName.trim()]: ''
    }))

    setLocalColumns(newColumns)
    setLocalData(newData)
    setIsModified(true)
    onDataUpdated(newData)
    if (onColumnsUpdated) {
      onColumnsUpdated(newColumns)
    }
    showNotification(`Столбец "${colName.trim()}" добавлен!`, 'success')
  }

  const handleDeleteRow = (rowIdx) => {
    if (localData.length <= 1) return
    const newData = localData.filter((_, idx) => idx !== rowIdx)
    setLocalData(newData)
    setIsModified(true)
    onDataUpdated(newData)
  }

  const handleMoveRowUp = (rowIdx) => {
    if (rowIdx === 0) return
    const newData = [...localData]
    const temp = newData[rowIdx]
    newData[rowIdx] = newData[rowIdx - 1]
    newData[rowIdx - 1] = temp
    setLocalData(newData)
    setIsModified(true)
    onDataUpdated(newData)
  }

  const handleMoveRowDown = (rowIdx) => {
    if (rowIdx === localData.length - 1) return
    const newData = [...localData]
    const temp = newData[rowIdx]
    newData[rowIdx] = newData[rowIdx + 1]
    newData[rowIdx + 1] = temp
    setLocalData(newData)
    setIsModified(true)
    onDataUpdated(newData)
  }

  const handleDuplicateRow = (rowIdx) => {
    const newRow = { ...localData[rowIdx] }
    const newData = [
      ...localData.slice(0, rowIdx + 1),
      newRow,
      ...localData.slice(rowIdx + 1)
    ]
    setLocalData(newData)
    setIsModified(true)
    onDataUpdated(newData)
    showNotification('Строка скопирована!', 'success')
  }

  const openRowMenu = (rowIdx, clientX, clientY) => {
    if (!tableWrapperRef.current) return
    const wrapper = tableWrapperRef.current
    const rect = wrapper.getBoundingClientRect()

    const x = clientX - rect.left + wrapper.scrollLeft
    const y = clientY - rect.top + wrapper.scrollTop

    setRowMenu({ isOpen: true, rowIdx, x, y })
  }

  // Получить уникальные значения для столбца (для автозаполнения)
  // Возвращаем ВСЕ уникальные значения, браузер сам фильтрует и показывает топ-10
  const getUniqueValuesForColumn = (colName) => {
    if (!Array.isArray(localData) || localData.length === 0) {
      return []
    }
    const values = new Set()
    localData.forEach(row => {
      if (row && row[colName] && typeof row[colName] === 'string' && row[colName].trim()) {
        values.add(row[colName].trim())
      }
    })
    
    // Возвращаем ВСЕ уникальные значения, отсортированные
    // Браузер автоматически фильтрует их по введенному тексту и показывает первые ~10 совпадений
    return Array.from(values).sort()
  }

  const handleDeleteColumn = (colName) => {
    if (localColumns.length <= 2) {
      showNotification('В таблице должно быть минимум 2 столбца', 'warning')
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
    if (onColumnsUpdated) {
      onColumnsUpdated(newColumns)
    }
  }

  const handleColumnNameEdit = (oldName, newName) => {
    if (!newName || !newName.trim() || newName === oldName) {
      return
    }
    
    const newColumns = localColumns.map(col => col === oldName ? newName.trim() : col)
    const newData = localData.map(row => {
      const newRow = { ...row }
      if (oldName in newRow) {
        newRow[newName.trim()] = newRow[oldName]
        delete newRow[oldName]
      }
      return newRow
    })
    
    setLocalColumns(newColumns)
    setLocalData(newData)
    setIsModified(true)
    onDataUpdated(newData)
    if (onColumnsUpdated) {
      onColumnsUpdated(newColumns)
    }
  }

  const handleColumnNameDoubleClick = (colName) => {
    setEditingColumn(colName)
    setEditColumnValue(colName)
  }

  const handleColumnNameBlur = (oldName) => {
    if (editColumnValue.trim() && editColumnValue.trim() !== oldName) {
      handleColumnNameEdit(oldName, editColumnValue.trim())
    }
    setEditingColumn(null)
  }

  const handleColumnNameKeyDown = (e, oldName) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleColumnNameBlur(oldName)
    } else if (e.key === 'Escape') {
      setEditingColumn(null)
    }
  }

  const handleSave = async () => {
    if (!user) {
      showNotification('Для сохранения необходимо быть авторизованным пользователем', 'warning')
      return
    }

    setIsSaving(true)
    try {
      let savedFileId = fileId
      
      if (!fileId) {
        // Создаем новый файл - создаем временный CSV файл и загружаем его
        const csvContent = [
          localColumns.join(','),
          ...localData.map(row => 
            localColumns.map(col => {
              const value = row[col] || ''
              if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                return `"${value.replace(/"/g, '""')}"`
              }
              return value
            }).join(',')
          )
        ].join('\n')
        
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
        const formData = new FormData()
        const fileNameToUse = currentFileName || 'new_table.csv'
        formData.append('file', blob, fileNameToUse.endsWith('.csv') ? fileNameToUse : `${fileNameToUse}.csv`)
        
        // Если указан projectId, добавляем его в запрос
        const url = projectId 
          ? `/files/upload?project_id=${projectId}`
          : '/files/upload'
        
        const createResponse = await apiClient.post(url, formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        })
        
        savedFileId = createResponse.data.id
      } else {
        // Обновляем существующий файл
        const updateData = {
          data: localData,
          columns: localColumns
        }
        // Если имя файла изменилось, добавляем его в обновление
        if (currentFileName && currentFileName !== fileName) {
          updateData.original_filename = currentFileName
        }
        await apiClient.put(`/files/${fileId}`, updateData)
      }
      
      setIsModified(false)
      // Обновляем fileId если файл был создан
      if (savedFileId && savedFileId !== fileId && onFileIdUpdate) {
        onFileIdUpdate(savedFileId)
      }
      // Вызываем callback для обновления состояния в родительском компоненте
      if (onFileSaved) {
        onFileSaved(savedFileId)
      }
      showNotification('Файл успешно сохранен!', 'success')
    } catch (err) {
      showNotification('Ошибка сохранения: ' + (err.userMessage || err.response?.data?.detail || err.message), 'error')
    } finally {
      setIsSaving(false)
    }
  }

  if (!Array.isArray(localData) || localData.length === 0 || !Array.isArray(localColumns) || localColumns.length === 0) {
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
        {user && fileId && (
          <div className="file-name-editor" style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {editingFileName ? (
              <input
                type="text"
                value={currentFileName}
                onChange={(e) => setCurrentFileName(e.target.value)}
                onBlur={() => {
                  setEditingFileName(false)
                  if (currentFileName.trim() && currentFileName !== fileName) {
                    setIsModified(true)
                    if (onFileNameChange) {
                      onFileNameChange(currentFileName.trim())
                    }
                  } else if (!currentFileName.trim()) {
                    setCurrentFileName(fileName || '')
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.target.blur()
                  } else if (e.key === 'Escape') {
                    setCurrentFileName(fileName || '')
                    setEditingFileName(false)
                  }
                }}
                style={{ 
                  padding: '8px 12px', 
                  border: '2px solid #4CAF50', 
                  borderRadius: '6px', 
                  fontSize: '16px',
                  fontWeight: '600',
                  flex: 1,
                  maxWidth: '400px'
                }}
                autoFocus
              />
            ) : (
              <h3 
                style={{ 
                  margin: 0, 
                  fontSize: '20px', 
                  fontWeight: '600', 
                  cursor: 'pointer',
                  color: '#212529'
                }}
                onDoubleClick={() => setEditingFileName(true)}
                title="Двойной клик для переименования"
              >
                {currentFileName || fileName || 'Без названия'}
              </h3>
            )}
          </div>
        )}
        <div className="editor-controls">
          <button type="button" onClick={handleAddRow}>➕ Добавить строку</button>
          <button type="button" onClick={() => setShowAddColumnModal(true)}>➕ Добавить столбец</button>
          {user && (
            <div className="editor-controls-right">
              {isModified && (
                <span className="modified-indicator">Изменено</span>
              )}
              <button 
                type="button" 
                onClick={handleSave}
                disabled={isSaving}
                className="save-btn"
              >
                {isSaving ? 'Сохранение...' : '💾 Сохранить'}
              </button>
            </div>
          )}
        </div>
        <AddColumnModal
          isOpen={showAddColumnModal}
          onClose={() => setShowAddColumnModal(false)}
          onAdd={handleAddColumn}
        />
        <div className="table-wrapper" ref={tableWrapperRef}>
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
                      {editingColumn === col ? (
                        <input
                          type="text"
                          value={editColumnValue}
                          onChange={(e) => setEditColumnValue(e.target.value)}
                          onBlur={() => handleColumnNameBlur(col)}
                          onKeyDown={(e) => handleColumnNameKeyDown(e, col)}
                          className="column-name-edit-input"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span
                          onDoubleClick={() => handleColumnNameDoubleClick(col)}
                          title="Двойной клик для редактирования"
                          className="column-name-editable"
                        >
                          {col}
                        </span>
                      )}
                      {localColumns.length > 2 && (
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
                  onContextMenu={(e) => {
                    e.preventDefault()
                    openRowMenu(rowIdx, e.clientX, e.clientY)
                  }}
                >
                  <td className="row-header-cell">
                    <button
                      type="button"
                      className="row-actions-btn"
                      title="Действия со строкой"
                      onClick={(e) => {
                        e.stopPropagation()
                        openRowMenu(rowIdx, e.clientX, e.clientY)
                      }}
                    >
                      ⋯
                    </button>
                  </td>
                  {localColumns.map(col => (
                    <td key={col}>
                      <input
                        type="text"
                        value={row[col] || ''}
                        onChange={(e) => handleCellChange(rowIdx, col, e.target.value)}
                        list={`datalist-${col}`}
                        autoComplete="off"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rowMenu.isOpen && rowMenu.rowIdx !== null && (
            <div
              className="row-menu"
              style={{ left: rowMenu.x, top: rowMenu.y }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className={`row-menu-item ${rowMenu.rowIdx === 0 ? 'disabled' : ''}`}
                onClick={() => {
                  handleMoveRowUp(rowMenu.rowIdx)
                  setRowMenu({ isOpen: false, rowIdx: null, x: 0, y: 0 })
                }}
                disabled={rowMenu.rowIdx === 0}
              >
                🔼 Вверх
              </button>
              <button
                type="button"
                className={`row-menu-item ${rowMenu.rowIdx === localData.length - 1 ? 'disabled' : ''}`}
                onClick={() => {
                  handleMoveRowDown(rowMenu.rowIdx)
                  setRowMenu({ isOpen: false, rowIdx: null, x: 0, y: 0 })
                }}
                disabled={rowMenu.rowIdx === localData.length - 1}
              >
                🔽 Вниз
              </button>
              <button
                type="button"
                className="row-menu-item"
                onClick={() => {
                  handleDuplicateRow(rowMenu.rowIdx)
                  setRowMenu({ isOpen: false, rowIdx: null, x: 0, y: 0 })
                }}
              >
                📋 Копировать
              </button>
              {localData.length > 1 && (
                <button
                  type="button"
                  className="row-menu-item danger"
                  onClick={() => {
                    handleDeleteRow(rowMenu.rowIdx)
                    setRowMenu({ isOpen: false, rowIdx: null, x: 0, y: 0 })
                  }}
                >
                  ✕ Удалить
                </button>
              )}
            </div>
          )}
          {/* Datalists для автозаполнения */}
          {localColumns.map(col => (
            <datalist key={`datalist-${col}`} id={`datalist-${col}`}>
              {getUniqueValuesForColumn(col).map((value, idx) => (
                <option key={idx} value={value} />
              ))}
            </datalist>
          ))}
        </div>
      </div>
    </div>
  )
}

export default EditorTab
