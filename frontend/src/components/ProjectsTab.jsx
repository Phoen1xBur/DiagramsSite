import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../api/client'
import './ProjectsTab.css'

function ProjectsTab({ onFileSelect, onDiagramSelect, currentFileId, isFileModified }) {
  const [projects, setProjects] = useState([])
  const [files, setFiles] = useState([])
  const [diagrams, setDiagrams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeView, setActiveView] = useState('projects') // 'projects', 'files' или 'diagrams'
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDescription, setNewProjectDescription] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [projectsResponse, filesResponse, diagramsResponse] = await Promise.all([
        apiClient.get('/projects/'),
        apiClient.get('/files/'),
        apiClient.get('/diagrams/')
      ])
      setProjects(projectsResponse.data || [])
      setFiles(filesResponse.data || [])
      setDiagrams(diagramsResponse.data || [])
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка загрузки данных')
      console.error('Ошибка загрузки данных:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateProject = async (e) => {
    e.preventDefault()
    if (!newProjectName.trim()) {
      alert('Введите название проекта')
      return
    }

    try {
      const response = await apiClient.post('/projects/', {
        name: newProjectName,
        description: newProjectDescription || null
      })
      setShowCreateModal(false)
      setNewProjectName('')
      setNewProjectDescription('')
      loadData()
      // Переходим к созданному проекту
      navigate(`/project/${response.data.id}`)
    } catch (err) {
      alert('Ошибка создания проекта: ' + (err.response?.data?.detail || err.message))
    }
  }

  const handleDeleteProject = async (projectId) => {
    if (!confirm('Удалить этот проект? Все файлы и диаграммы будут удалены.')) return
    
    try {
      await apiClient.delete(`/projects/${projectId}`)
      loadData()
      alert('Проект удален')
    } catch (err) {
      alert('Ошибка удаления проекта: ' + (err.response?.data?.detail || err.message))
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
      <div className="projects-tab" style={{ padding: '20px', textAlign: 'center' }}>
        <p>Загрузка...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="projects-tab" style={{ padding: '20px' }}>
        <div className="error" style={{ color: 'red', marginBottom: '10px' }}>{error}</div>
        <button onClick={loadData} className="primary">Попробовать снова</button>
      </div>
    )
  }

  return (
    <div className="projects-tab">
      <div className="projects-header">
        <div className="view-switcher">
          <button
            className={activeView === 'projects' ? 'active' : ''}
            onClick={() => setActiveView('projects')}
          >
            📊 Проекты ({projects.length})
          </button>
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
        <div style={{ display: 'flex', gap: '10px' }}>
          {activeView === 'projects' && (
            <button className="primary" onClick={() => setShowCreateModal(true)}>
              ➕ Создать проект
            </button>
          )}
          <button onClick={loadData} className="refresh-btn">🔄 Обновить</button>
        </div>
      </div>

      {activeView === 'projects' && (
        <div className="projects-list">
          {projects.length === 0 ? (
            <div className="empty-state">
              <p>У вас пока нет проектов</p>
              <p className="hint">Создайте первый проект, чтобы начать работу</p>
              <button className="primary" onClick={() => setShowCreateModal(true)}>
                Создать проект
              </button>
            </div>
          ) : (
            <div className="projects-grid">
              {projects.map(project => (
                <div key={project.id} className="project-card">
                  <div className="project-card-header">
                    <h3>{project.name}</h3>
                    <button
                      className="danger small"
                      onClick={() => handleDeleteProject(project.id)}
                      title="Удалить проект"
                    >
                      ✕
                    </button>
                  </div>
                  {project.description && (
                    <p className="project-description">{project.description}</p>
                  )}
                  <div className="project-stats">
                    <span>📁 Файлов: {project.files_count || 0}</span>
                    <span>📈 Диаграмм: {project.diagrams_count || 0}</span>
                  </div>
                  <div className="project-meta">
                    <span>Создан: {formatDate(project.created_at)}</span>
                  </div>
                  <button
                    className="primary"
                    onClick={() => navigate(`/project/${project.id}`)}
                  >
                    Открыть проект
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            <h3>Создать проект</h3>
            <form onSubmit={handleCreateProject}>
              <div className="form-group">
                <label>Название проекта *</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  required
                  placeholder="Мой проект"
                />
              </div>
              <div className="form-group">
                <label>Описание</label>
                <textarea
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  placeholder="Описание проекта (необязательно)"
                  rows="3"
                />
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setShowCreateModal(false)}>
                  Отмена
                </button>
                <button type="submit" className="primary">
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProjectsTab
