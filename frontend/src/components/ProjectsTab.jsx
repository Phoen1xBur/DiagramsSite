import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../api/client'
import { useNotification } from '../contexts/NotificationContext'
import './ProjectsTab.css'

function ProjectsTab({ onFileSelect, onDiagramSelect, currentFileId, isFileModified }) {
  const { showNotification } = useNotification()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
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
      const projectsResponse = await apiClient.get('/projects/')
      setProjects(projectsResponse.data || [])
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
      showNotification('Введите название проекта', 'warning')
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
      showNotification('Ошибка создания проекта: ' + (err.response?.data?.detail || err.message), 'error')
    }
  }

  const handleDeleteProject = async (projectId) => {
    if (!confirm('Удалить этот проект? Все файлы и диаграммы будут удалены.')) return
    
    try {
      await apiClient.delete(`/projects/${projectId}`)
      loadData()
      showNotification('Проект удален', 'success')
    } catch (err) {
      showNotification('Ошибка удаления проекта: ' + (err.response?.data?.detail || err.message), 'error')
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleString('ru-RU')
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
      <div className="projects-header" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
        <button className="primary" onClick={() => setShowCreateModal(true)}>
          ➕ Создать проект
        </button>
      </div>

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
