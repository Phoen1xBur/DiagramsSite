import React from 'react'
import './DeleteFileModal.css'

function DeleteFileModal({ isOpen, onClose, onConfirm, fileName }) {
  if (!isOpen) return null

  return (
    <div className="delete-file-modal-overlay" onClick={onClose}>
      <div className="delete-file-modal" onClick={(e) => e.stopPropagation()}>
        <button className="delete-file-modal-close" onClick={onClose}>×</button>
        <h3>Подтверждение удаления</h3>
        <p>Вы уверены, что хотите удалить файл <strong>"{fileName}"</strong>?</p>
        <p className="warning-text">Все связанные диаграммы также будут удалены. Это действие нельзя отменить.</p>
        <div className="delete-file-modal-actions">
          <button type="button" onClick={onClose} className="cancel-btn">
            Отмена
          </button>
          <button type="button" onClick={onConfirm} className="danger">
            Удалить
          </button>
        </div>
      </div>
    </div>
  )
}

export default DeleteFileModal
