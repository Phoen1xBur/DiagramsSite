import { useState, useEffect } from 'react'
import './RenameFileModal.css'

function RenameFileModal({ isOpen, onClose, onRename, currentName, isLoading }) {
  const [newName, setNewName] = useState(currentName || '')

  // Обновляем имя при открытии модалки
  useEffect(() => {
    if (isOpen) {
      setNewName(currentName || '')
    }
  }, [isOpen, currentName])

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    if (newName.trim() && !isLoading) {
      onRename(newName.trim())
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Переименовать файл</h3>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Введите новое название файла"
            autoFocus
            className="rename-input"
            disabled={isLoading}
          />
          <div className="modal-actions">
            <button type="submit" className="primary" disabled={!newName.trim() || isLoading || newName === currentName}>
              {isLoading ? 'Переименование...' : 'Переименовать'}
            </button>
            <button type="button" className="secondary" onClick={onClose} disabled={isLoading}>
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default RenameFileModal
