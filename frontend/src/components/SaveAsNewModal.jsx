import { useState } from 'react'
import './SaveAsNewModal.css'

function SaveAsNewModal({ isOpen, onClose, onSave }) {
  const defaultName = `Диаграмма от ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU')}`
  const [name, setName] = useState(defaultName)

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    if (name.trim()) {
      onSave(name.trim())
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Сохранить как новую диаграмму</h3>
        <form onSubmit={handleSubmit}>
          <label htmlFor="diagram-name">Название диаграммы:</label>
          <input
            id="diagram-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Введите название диаграммы"
            autoFocus
            className="name-input"
          />
          <div className="modal-actions">
            <button type="submit" className="primary" disabled={!name.trim()}>
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
