import React, { useState, useEffect } from 'react'
import { useNotification } from '../contexts/NotificationContext'
import './AddColumnModal.css'

function AddColumnModal({ isOpen, onClose, onAdd }) {
  const { showNotification } = useNotification()
  const [columnName, setColumnName] = useState('')

  useEffect(() => {
    if (isOpen) {
      setColumnName('')
    }
  }, [isOpen])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!columnName.trim()) {
      showNotification('Введите название столбца', 'warning')
      return
    }
    onAdd(columnName.trim())
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="add-column-modal-overlay" onClick={onClose}>
      <div className="add-column-modal" onClick={(e) => e.stopPropagation()}>
        <button className="add-column-modal-close" onClick={onClose}>×</button>
        <h3>Добавить столбец</h3>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={columnName}
            onChange={(e) => setColumnName(e.target.value)}
            placeholder="Название столбца"
            autoFocus
            className="add-column-input"
          />
          <div className="add-column-modal-actions">
            <button type="button" onClick={onClose} className="cancel-btn">
              Отмена
            </button>
            <button type="submit" className="primary">
              Добавить
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AddColumnModal
