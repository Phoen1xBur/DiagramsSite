import { useState, useEffect, useRef } from 'react'
import { useModalDialog } from '../hooks/useModalDialog'
import './SaveAsNewModal.css'

function SaveAsNewModal({ isOpen, onClose, onSave, onEmptyName }) {
  const makeDefaultName = () =>
    `Диаграмма от ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU')}`
  const [name, setName] = useState(makeDefaultName)
  const inputRef = useRef(null)
  const dialogRef = useModalDialog({ isOpen, onClose })

  useEffect(() => {
    if (isOpen) {
      setName(makeDefaultName())
      const t = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          inputRef.current.select()
        }
      }, 50)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      if (onEmptyName) onEmptyName()
      if (inputRef.current) inputRef.current.focus()
      return
    }
    onSave(trimmed)
  }

  return (
    <dialog ref={dialogRef} className="app-dialog-overlay modal-overlay save-as-new-overlay">
      <div className="modal-content save-as-new-modal">
        <h3>Сохранить как новую диаграмму</h3>
        <form onSubmit={handleSubmit}>
          <label htmlFor="diagram-name">Наименование диаграммы:</label>
          <input
            id="diagram-name"
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Введите наименование диаграммы"
            autoFocus
            className="name-input"
            autoComplete="off"
          />
          <div className="modal-actions">
            <button type="submit" className="primary">
              💾 Сохранить
            </button>
            <button type="button" className="secondary" onClick={onClose}>
              Отмена
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}

export default SaveAsNewModal
