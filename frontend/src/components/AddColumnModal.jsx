import React, { useState, useEffect } from 'react'
import { useNotification } from '../contexts/NotificationContext'
import { useModalDialog } from '../hooks/useModalDialog'
import './AddColumnModal.css'

function AddColumnModal({ isOpen, onClose, onAdd }) {
  const { showNotification } = useNotification()
  const [columnName, setColumnName] = useState('')
  const dialogRef = useModalDialog({ isOpen, onClose })

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

  return (
    <dialog ref={dialogRef} className="app-dialog-overlay add-column-modal-overlay">
      <div className="add-column-modal">
        <button type="button" className="add-column-modal-close" onClick={onClose}>×</button>
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
    </dialog>
  )
}

export default AddColumnModal
