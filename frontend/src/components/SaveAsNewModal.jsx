import { useState, useEffect, useRef } from 'react'
import './SaveAsNewModal.css'

function SaveAsNewModal({ isOpen, onClose, onSave, onEmptyName }) {
  const makeDefaultName = () =>
    `Диаграмма от ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU')}`
  const [name, setName] = useState(makeDefaultName)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setName(makeDefaultName())
      // Focus after paint so the field is visible and active.
      const t = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          inputRef.current.select()
        }
      }, 50)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  if (!isOpen) return null

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
    <div className="modal-overlay save-as-new-overlay" onClick={onClose}>
      <div className="modal-content save-as-new-modal" onClick={(e) => e.stopPropagation()}>
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
    </div>
  )
}

export default SaveAsNewModal
