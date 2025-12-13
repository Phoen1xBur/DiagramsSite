import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import FileTab from './FileTab'
import EditorTab from './EditorTab'
import ChartTab from './ChartTab'
import apiClient from '../api/client'
import { getUserData } from '../utils/storage'
import './ProjectDetail.css'

function ProjectDetail() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('file')
  const [currentData, setCurrentData] = useState(null)
  const [columns, setColumns] = useState([])
  const [fileId, setFileId] = useState(null)
  const [project, setProject] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isFileModified, setIsFileModified] = useState(false)

  useEffect(() => {
    const userData = getUserData()
    if (userData) {
      setUser(userData)
    }
    loadProject()
  }, [projectId])

  const loadProject = async () => {
    try {
      const response = await apiClient.get(`/projects/${projectId}`)
      setProject(response.data)
    } catch (err) {
      alert('Ошибка загрузки проекта: ' + (err.response?.data?.detail || err.message))
      navigate('/')
    } finally {
      setLoading(false)
    }
  }

  const handleFileLoaded = (data, cols, id) => {
    setCurrentData(data)
    setColumns(cols)
    setFileId(id)
    setIsFileModified(false)
  }

  const handleDataUpdated = (data) => {
    setCurrentData(data)
    setIsFileModified(true)
  }

  const handleFileSaved = () => {
    setIsFileModified(false)
  }

  if (loading) {
    return (
      <div className="project-detail">
        <p>Загрузка...</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="project-detail">
        <p>Проект не найден</p>
        <button onClick={() => navigate('/')}>Вернуться на главную</button>
      </div>
    )
  }

  return (
    <div className="project-detail">
      <div className="project-header">
        <div>
          <button className="back-btn" onClick={() => navigate('/')}>
            ← Назад на главную
          </button>
          <h2>{project.name}</h2>
          {project.description && <p className="project-description">{project.description}</p>}
        </div>
      </div>

      <div className="tab-container">
        <button
          type="button"
          className={`tab-button ${activeTab === 'file' ? 'active' : ''}`}
          onClick={() => setActiveTab('file')}
        >
          📁 Файл
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'editor' ? 'active' : ''}`}
          onClick={() => setActiveTab('editor')}
        >
          ✏️ Редактор
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'chart' ? 'active' : ''}`}
          onClick={() => setActiveTab('chart')}
        >
          📈 Диаграмма
        </button>
      </div>

      {activeTab === 'file' && (
        <FileTab
          onFileLoaded={handleFileLoaded}
          currentData={currentData}
          columns={columns}
          fileId={fileId}
          onFileLoadedCallback={() => setIsFileModified(false)}
          projectId={parseInt(projectId)}
        />
      )}

      {activeTab === 'editor' && (
        <EditorTab
          data={currentData}
          columns={columns}
          onDataUpdated={handleDataUpdated}
          fileId={fileId}
          user={user}
          onFileSaved={handleFileSaved}
        />
      )}

      {activeTab === 'chart' && (
        <ChartTab
          data={currentData}
          columns={columns}
          fileId={fileId}
          user={user}
          projectId={parseInt(projectId)}
          onChartSaved={() => {}}
        />
      )}
    </div>
  )
}

export default ProjectDetail

