import React, { useState, useRef } from 'react'
import apiClient from '../api/client'
import CreateTableModal from './CreateTableModal'
import { useNotification } from '../contexts/NotificationContext'
import './FileTab.css'

function FileTab({ onFileLoaded, currentData, columns, fileId, onFileLoadedCallback, projectId, onSwitchToEditor, hasProjectFiles = false }) {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const handleFileUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      
      // Если указан projectId, добавляем его в запрос
      const url = projectId 
        ? `/files/upload?project_id=${projectId}`
        : '/files/upload'

      const response = await apiClient.post(url, formData)

      onFileLoaded(response.data.data, response.data.columns, response.data.id, response.data.original_filename)
      if (onFileLoadedCallback) {
        onFileLoadedCallback()
      }
      showNotification('Файл успешно загружен и сохранен!', 'success')
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка загрузки файла')
      showNotification('Ошибка загрузки файла: ' + (err.response?.data?.detail || err.message), 'error')
    } finally {
      setLoading(false)
      event.target.value = '' // Сброс input
    }
  }

  const handleCreateNewTable = (columnNames, fileName) => {
    const data = []
    for (let i = 0; i < 5; i++) {
      const row = {}
      columnNames.forEach(col => row[col] = '')
      data.push(row)
    }

    onFileLoaded(data, columnNames, null, fileName, columnNames)
    if (onFileLoadedCallback) {
      onFileLoadedCallback()
    }
    
    // Переключаемся на вкладку редактора
    if (onSwitchToEditor) {
      onSwitchToEditor()
    }
  }

  const fileInputRef = useRef(null)

  const handleButtonClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  return (
    <div className="file-tab">
      {!currentData && !hasProjectFiles ? (
        <div className="empty-file-state">
          <div className="empty-file-icon">📁</div>
          <h3>Начните работу с данными</h3>
          <p>Загрузите файл Excel или CSV, или создайте новую таблицу с нуля</p>
          <div className="controls">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              disabled={loading}
              style={{ display: 'none' }}
            />
            <button 
              type="button" 
              className="primary" 
              disabled={loading}
              onClick={handleButtonClick}
            >
              {loading ? '⏳ Загрузка...' : '📤 Загрузить Excel/CSV'}
            </button>
            <button type="button" onClick={() => setShowCreateModal(true)}>
              ➕ Создать новую таблицу
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="controls">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              disabled={loading}
              style={{ display: 'none' }}
            />
            <button 
              type="button" 
              className="primary" 
              disabled={loading}
              onClick={handleButtonClick}
            >
              {loading ? '⏳ Загрузка...' : '📤 Загрузить Excel/CSV'}
            </button>
            <button type="button" onClick={() => setShowCreateModal(true)}>
              ➕ Создать новую таблицу
            </button>
          </div>

          {error && <div className="error">{error}</div>}
        </>
      )}
      
      <CreateTableModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateNewTable}
      />
    </div>
  )
}

export default FileTab

