import React, { useState, useEffect } from 'react'
import apiClient from '../api/client'
import './ProjectsTab.css'

function ProjectsTab({ onFileSelect, onDiagramSelect, currentFileId, isFileModified }) {
  const [files, setFiles] = useState([])
  const [diagrams, setDiagrams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeView, setActiveView] = useState('files') // 'files' или 'diagrams'

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [filesResponse, diagramsResponse] = await Promise.all([
        apiClient.get('/files/'),
        apiClient.get('/diagrams/')
      ])
      setFiles(filesResponse.data || [])
      setDiagrams(diagramsResponse.data || [])
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка загрузки данных')
      console.error('Ошибка загрузки проектов:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteFile = async (fileId) => {
    if (!confirm('Удалить этот файл?')) return
    
    try {
      await apiClient.delete(`/files/${fileId}`)
      setFiles(files.filter(f => f.id !== fileId))
      alert('Файл удален')
    } catch (err) {
      alert('Ошибка удаления файла: ' + (err.response?.data?.detail || err.message))
    }
  }

  const handleDeleteDiagram = async (diagramId) => {
    if (!confirm('Удалить эту диаграмму?')) return
    
    try {
      await apiClient.delete(`/diagrams/${diagramId}`)
      setDiagrams(diagrams.filter(d => d.id !== diagramId))
      alert('Диаграмма удалена')
    } catch (err) {
      alert('Ошибка удаления диаграммы: ' + (err.response?.data?.detail || err.message))
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleString('ru-RU')
  }

  const getFileStatus = (file) => {
    const isOpen = currentFileId === file.id
    const isModified = isOpen && isFileModified
    
    if (isModified) {
      return { text: 'Изменен', class: 'status-modified', tooltip: 'Файл был изменен, но не сохранен' }
    } else if (isOpen) {
      return { text: 'Открыт', class: 'status-open', tooltip: 'Файл открыт в редакторе' }
    }
    return null
  }

  if (loading) {
    return (
      <div className="projects-tab">
        <p>Загрузка...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="projects-tab">
        <div className="error">{error}</div>
        <button onClick={loadData}>Попробовать снова</button>
      </div>
    )
  }

  return (
    <div className="projects-tab">
      <div className="projects-header">
        <div className="view-switcher">
          <button
            className={activeView === 'files' ? 'active' : ''}
            onClick={() => setActiveView('files')}
          >
            📁 Файлы ({files.length})
          </button>
          <button
            className={activeView === 'diagrams' ? 'active' : ''}
            onClick={() => setActiveView('diagrams')}
          >
            📈 Диаграммы ({diagrams.length})
          </button>
        </div>
        <button onClick={loadData} className="refresh-btn">🔄 Обновить</button>
      </div>

      {activeView === 'files' && (
        <div className="projects-list">
          {files.length === 0 ? (
            <div className="empty-state">
              <p>Нет сохраненных файлов</p>
              <p className="hint">Загрузите файл на вкладке "Файл"</p>
            </div>
          ) : (
            files.map(file => {
              const status = getFileStatus(file)
              return (
                <div 
                  key={file.id} 
                  className={`project-item ${currentFileId === file.id ? 'active-file' : ''}`}
                >
                  <div className="project-info">
                    <h4>{file.original_filename}</h4>
                    <p className="project-meta">
                      Тип: {file.file_type.toUpperCase()} | 
                      Столбцов: {file.columns.length} | 
                      Строк: {file.data.length} | 
                      Создан: {formatDate(file.created_at)}
                    </p>
                  </div>
                  <div className="project-status">
                    {status && (
                      <span 
                        className={`status-badge ${status.class}`}
                        title={status.tooltip}
                      >
                        {status.text}
                      </span>
                    )}
                  </div>
                  <div className="project-actions">
                    <button
                      className="primary"
                      onClick={() => onFileSelect(file.data, file.columns, file.id)}
                    >
                      Открыть
                    </button>
                    <button
                      className="danger"
                      onClick={() => handleDeleteFile(file.id)}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {activeView === 'diagrams' && (
        <div className="projects-list">
          {diagrams.length === 0 ? (
            <div className="empty-state">
              <p>Нет сохраненных диаграмм</p>
              <p className="hint">Создайте диаграмму на вкладке "Диаграмма"</p>
            </div>
          ) : (
            diagrams.map(diagram => (
              <div key={diagram.id} className="project-item">
                <div className="project-info">
                  <h4>{diagram.name || `Диаграмма #${diagram.id}`}</h4>
                  <p className="project-meta">
                    Иерархия: {diagram.hierarchy_columns.join(' → ')} | 
                    {diagram.value_column && ` Значение: ${diagram.value_column} |`}
                    Создана: {formatDate(diagram.created_at)}
                  </p>
                </div>
                <div className="project-actions">
                  <button
                    className="primary"
                    onClick={() => onDiagramSelect(diagram)}
                  >
                    Открыть
                  </button>
                  <button
                    className="danger"
                    onClick={() => handleDeleteDiagram(diagram.id)}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default ProjectsTab
