import { useModalDialog } from '../hooks/useModalDialog'
import './ConfirmDeleteModal.css'

function ConfirmDeleteModal({ isOpen, onClose, onConfirm, diagramName }) {
  const dialogRef = useModalDialog({ isOpen, onClose })

  return (
    <dialog ref={dialogRef} className="app-dialog-overlay modal-overlay">
      <div className="modal-content">
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
    </dialog>
  )
}

export default ConfirmDeleteModal
