import './ConfirmDeleteModal.css'

function ConfirmDeleteModal({ isOpen, onClose, onConfirm, diagramName }) {
  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Подтвердите удаление</h3>
        <p>
          Вы уверены, что хотите удалить диаграмму <strong>"{diagramName}"</strong>?
        </p>
        <p style={{ color: '#f44336', fontSize: '14px' }}>
          Это действие нельзя отменить.
        </p>
          <div className="modal-actions">
            <button type="button" className="delete" onClick={onConfirm}>
              Удалить
            </button>
            <button type="button" className="secondary" onClick={onClose}>
              Отмена
            </button>
          </div>
      </div>
    </div>
  )
}

export default ConfirmDeleteModal
