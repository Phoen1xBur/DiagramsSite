import React, { useState, useRef, useEffect } from 'react'
import { useNotification } from '../contexts/NotificationContext'
import './CreateTableModal.css'

function CreateTableModal({ isOpen, onClose, onCreate }) {
  const { showNotification } = useNotification()
  const [columns, setColumns] = useState(['Категория', 'Подкатегория', 'Значение'])
  const [editingColumn, setEditingColumn] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [fileName, setFileName] = useState('Новая таблица')
  const inputRefs = useRef({})

  useEffect(() => {
    if (isOpen) {
      setColumns(['Категория', 'Подкатегория', 'Значение'])
      setEditingColumn(null)
      setFileName('Новая таблица')
    }
  }, [isOpen])

  const handleDoubleClick = (index) => {
    setEditingColumn(index)
    setEditValue(columns[index])
    setTimeout(() => {
      if (inputRefs.current[index]) {
        inputRefs.current[index].focus()
        inputRefs.current[index].select()
      }
    }, 0)
  }

  const handleBlur = (index) => {
    if (editValue.trim()) {
      const newColumns = [...columns]
      newColumns[index] = editValue.trim()
      setColumns(newColumns)
    }
    setEditingColumn(null)
  }

  const handleKeyDown = (e, index) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleBlur(index)
    } else if (e.key === 'Escape') {
      setEditingColumn(null)
    }
  }

  const handleAddColumn = () => {
    setColumns([...columns, `Столбец ${columns.length + 1}`])
  }

  const handleDeleteColumn = (index) => {
    if (columns.length <= 2) {
      showNotification('В таблице должно быть минимум 2 столбца', 'warning')
      return
    }
    const newColumns = columns.filter((_, i) => i !== index)
    setColumns(newColumns)
  }

  const handleCreate = () => {
    const validColumns = columns.filter(col => col.trim())
    if (validColumns.length < 2) {
      showNotification('В таблице должно быть минимум 2 столбца!', 'warning')
      return
    }
    
    if (!fileName.trim()) {
      showNotification('Введите название файла', 'warning')
      return
    }

    onCreate(validColumns, fileName.trim())
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="create-table-modal-overlay" onClick={onClose}>
      <div className="create-table-modal" onClick={(e) => e.stopPropagation()}>
        <button className="create-table-modal-close" onClick={onClose}>×</button>
        <h2>Создать новую таблицу</h2>
        <p>Укажите названия столбцов. Двойной клик по названию для редактирования.</p>
        
        <div className="form-group" style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#212529' }}>Название файла *</label>
          <input
            type="text"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="Название файла"
            className="column-edit-input"
            style={{ width: '100%' }}
          />
        </div>
        
        <div className="columns-list">
          {columns.map((col, index) => (
            <div key={index} className="column-item">
              {editingColumn === index ? (
                <input
                  ref={el => inputRefs.current[index] = el}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => handleBlur(index)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  className="column-edit-input"
                  autoFocus
                />
              ) : (
                <span
                  className="column-name"
                  onDoubleClick={() => handleDoubleClick(index)}
                  title="Двойной клик для редактирования"
                >
                  {col}
                </span>
              )}
              {columns.length > 2 && (
                <button
                  type="button"
                  className="delete-column-btn"
                  onClick={() => handleDeleteColumn(index)}
                  title="Удалить столбец"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button type="button" onClick={handleAddColumn} className="add-column-btn">
            ➕ Добавить столбец
          </button>
          <div className="modal-buttons">
            <button type="button" onClick={onClose} className="cancel-btn">
              Отмена
            </button>
            <button type="button" onClick={handleCreate} className="create-btn">
              Создать
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CreateTableModal
