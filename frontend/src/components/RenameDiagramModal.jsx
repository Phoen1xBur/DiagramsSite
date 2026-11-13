import { useState, useEffect } from 'react'
import { useModalDialog } from '../hooks/useModalDialog'
import './RenameDiagramModal.css'

function RenameDiagramModal({ isOpen, onClose, onRename, currentName, isLoading }) {
  const [newName, setNewName] = useState(currentName || '')
  const dialogRef = useModalDialog({ isOpen, onClose, closeDisabled: Boolean(isLoading) })

  useEffect(() => {
    if (isOpen) {
      setNewName(currentName || '')
    }
  }, [isOpen, currentName])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (newName.trim() && !isLoading) {
      onRename(newName.trim())
    }
  }

  return (
    <dialog ref={dialogRef} className="app-dialog-overlay modal-overlay">
      <div className="modal-content">
        <h3>Переименовать диаграмму</h3>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Введите новое название"
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
    </dialog>
  )
}

export default RenameDiagramModal
