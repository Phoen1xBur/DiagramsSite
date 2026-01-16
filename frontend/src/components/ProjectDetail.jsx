import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import FileTab from './FileTab'
import EditorTab from './EditorTab'
import ChartTab from './ChartTab'
import DeleteFileModal from './DeleteFileModal'
import apiClient from '../api/client'
import { getUserData } from '../utils/storage'
import { useNotification } from '../contexts/NotificationContext'
import './ProjectDetail.css'

function ProjectDetail() {
  const { showNotification } = useNotification()
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('files')
  const [currentData, setCurrentData] = useState(null)
  const [columns, setColumns] = useState([])
  const [fileId, setFileId] = useState(null)
  const [project, setProject] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isFileModified, setIsFileModified] = useState(false)
  const [projectFiles, setProjectFiles] = useState([])
  const [projectDiagrams, setProjectDiagrams] = useState([])
  const [filesPage, setFilesPage] = useState(1)
  const filesPerPage = 10
  const [pendingFileName, setPendingFileName] = useState(null)
  const [deleteFileModal, setDeleteFileModal] = useState({ isOpen: false, fileId: null, fileName: '' })
  const [editingProjectName, setEditingProjectName] = useState(false)
  const [projectName, setProjectName] = useState('')

  useEffect(() => {
    const userData = getUserData()
    if (userData) {
      setUser(userData)
    }
    loadProject()
  }, [projectId])

  const loadProject = async () => {
    try {
      const [projectResponse, filesResponse, diagramsResponse] = await Promise.all([
        apiClient.get(`/projects/${projectId}`),
        apiClient.get(`/files/?project_id=${projectId}`),
        apiClient.get(`/diagrams/?project_id=${projectId}`)
      ])
      setProject(projectResponse.data)
      setProjectName(projectResponse.data.name)
      setProjectFiles(filesResponse.data || [])
      setProjectDiagrams(diagramsResponse.data || [])
    } catch (err) {
      showNotification('Ошибка загрузки проекта: ' + (err.response?.data?.detail || err.message), 'error')
      navigate('/')
    } finally {
      setLoading(false)
    }
  }

  const handleFileLoaded = (data, cols, id, fileName) => {
    setCurrentData(data)
    setColumns(cols)
    setFileId(id)
    setIsFileModified(false)
    if (fileName && !id) {
      setPendingFileName(fileName)
    }
  }
  
  const handleDeleteFile = async () => {
    if (!deleteFileModal.fileId) return
    try {
      await apiClient.delete(`/files/${deleteFileModal.fileId}`)
      showNotification('Файл удален', 'success')
      if (deleteFileModal.fileId === fileId) {
        setCurrentData(null)
        setColumns([])
        setFileId(null)
        setIsFileModified(false)
        setActiveTab('files')
      }
      loadProject()
      setDeleteFileModal({ isOpen: false, fileId: null, fileName: '' })
    } catch (err) {
      showNotification('Ошибка удаления файла: ' + (err.response?.data?.detail || err.message), 'error')
    }
  }

  const handleDataUpdated = (data) => {
    setCurrentData(data)
    // Помечаем файл как измененный при любом изменении данных
    setIsFileModified(true)
  }

  const handleFileSaved = () => {
    setIsFileModified(false)
  }

  const handleProjectNameSave = async () => {
    if (!projectName.trim()) {
      showNotification('Название проекта не может быть пустым', 'warning')
      setProjectName(project?.name || '')
      setEditingProjectName(false)
      return
    }

    if (projectName.trim() === project?.name) {
      setEditingProjectName(false)
      return
    }

    try {
      const response = await apiClient.put(`/projects/${projectId}`, {
        name: projectName.trim()
      })
      setProject(response.data)
      showNotification('Название проекта обновлено', 'success')
      setEditingProjectName(false)
    } catch (err) {
      showNotification('Ошибка обновления проекта: ' + (err.response?.data?.detail || err.message), 'error')
      setProjectName(project?.name || '')
      setEditingProjectName(false)
    }
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
        <button className="back-btn-compact" onClick={() => navigate('/')} title="Назад на главную">
          ←
        </button>
        <div className="project-header-content">
          {editingProjectName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', maxWidth: '500px' }}>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onBlur={handleProjectNameSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.target.blur()
                  } else if (e.key === 'Escape') {
                    setProjectName(project?.name || '')
                    setEditingProjectName(false)
                  }
                }}
                style={{
                  padding: '8px 12px',
                  border: '2px solid #4CAF50',
                  borderRadius: '6px',
                  fontSize: '20px',
                  fontWeight: '600',
                  flex: 1
                }}
                autoFocus
              />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ margin: 0 }}>
                {project.name}
              </h2>
              <button
                type="button"
                onClick={() => setEditingProjectName(true)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: '16px',
                  color: '#666',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.color = '#4CAF50'}
                onMouseLeave={(e) => e.target.style.color = '#666'}
                title="Переименовать проект"
              >
                ✏️
              </button>
            </div>
          )}
          {project.description && <p className="project-description">{project.description}</p>}
        </div>
      </div>

      <div className="tab-container">
        <button
          type="button"
          className={`tab-button ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          📁 Файлы ({projectFiles.length})
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'diagrams' ? 'active' : ''}`}
          onClick={() => setActiveTab('diagrams')}
        >
          📈 Диаграммы ({projectDiagrams.length})
        </button>
        {(fileId || currentData) && (
          <>
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
              📊 Диаграмма
            </button>
          </>
        )}
      </div>

      {activeTab === 'files' && (
        <div className="project-files-list">
          {projectFiles.length > 0 && (
            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: '600' }}>Файлы проекта</h3>
              <div className="files-grid">
                {projectFiles
                  .slice((filesPage - 1) * filesPerPage, filesPage * filesPerPage)
                  .map(file => (
                    <div key={file.id} className="file-card">
                      <div className="file-card-header">
                        <h4>{file.original_filename || `Файл #${file.id}`}</h4>
                        <button
                          className="delete-file-btn-small"
                          onClick={() => setDeleteFileModal({ 
                            isOpen: true, 
                            fileId: file.id, 
                            fileName: file.original_filename || `Файл #${file.id}` 
                          })}
                          title="Удалить файл"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="file-card-info">
                        <span>📊 Столбцов: {file.columns?.length || 0}</span>
                        <span>📋 Строк: {file.data?.length || 0}</span>
                      </div>
                      <div className="file-card-actions">
                        <button 
                          className="primary file-card-button" 
                          onClick={async () => {
                            try {
                              const fileResponse = await apiClient.get(`/files/${file.id}`)
                              setCurrentData(fileResponse.data.data)
                              setColumns(fileResponse.data.columns)
                              setFileId(fileResponse.data.id)
                              setIsFileModified(false)
                              setActiveTab('editor')
                            } catch (err) {
                              showNotification('Ошибка загрузки файла: ' + (err.response?.data?.detail || err.message), 'error')
                            }
                          }}
                        >
                          Открыть в редакторе
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
              {projectFiles.length > filesPerPage && (
                <div className="pagination">
                  <button 
                    onClick={() => setFilesPage(p => Math.max(1, p - 1))}
                    disabled={filesPage === 1}
                    className="pagination-btn"
                  >
                    ← Назад
                  </button>
                  <span className="pagination-info">
                    Страница {filesPage} из {Math.ceil(projectFiles.length / filesPerPage)}
                  </span>
                  <button 
                    onClick={() => setFilesPage(p => Math.min(Math.ceil(projectFiles.length / filesPerPage), p + 1))}
                    disabled={filesPage >= Math.ceil(projectFiles.length / filesPerPage)}
                    className="pagination-btn"
                  >
                    Вперед →
                  </button>
                </div>
              )}
            </div>
          )}
          <FileTab
            onFileLoaded={handleFileLoaded}
            currentData={currentData}
            columns={columns}
            fileId={fileId}
            onFileLoadedCallback={() => {
              setIsFileModified(false)
              loadProject() // Обновляем список файлов
            }}
            projectId={parseInt(projectId)}
            onSwitchToEditor={() => setActiveTab('editor')}
          />
        </div>
      )}

      {activeTab === 'diagrams' && (
        <div className="project-diagrams-list">
          {projectDiagrams.length === 0 ? (
            <div className="empty-state">
              <p>В этом проекте пока нет диаграмм</p>
              <p className="hint">Создайте файл и постройте диаграмму</p>
            </div>
          ) : (
            <div>
              {projectDiagrams.map(diagram => (
                <div key={diagram.id} style={{ padding: '10px', border: '1px solid #ddd', marginBottom: '10px', borderRadius: '4px' }}>
                  <h4>{diagram.name || `Диаграмма #${diagram.id}`}</h4>
                  <p>Иерархия: {diagram.hierarchy_columns?.join(' → ') || 'Нет данных'}</p>
                  <button 
                    className="primary" 
                    onClick={async () => {
                      try {
                        const fileResponse = await apiClient.get(`/files/${diagram.data_file_id}`)
                        setCurrentData(fileResponse.data.data)
                        setColumns(fileResponse.data.columns)
                        setFileId(fileResponse.data.id)
                        setIsFileModified(false)
                        setActiveTab('chart')
                      } catch (err) {
                        showNotification('Ошибка загрузки файла диаграммы: ' + (err.response?.data?.detail || err.message), 'error')
                      }
                    }}
                  >
                    Открыть диаграмму
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'editor' && (fileId || currentData) && (
        <EditorTab
          data={currentData}
          columns={columns}
          onDataUpdated={handleDataUpdated}
          fileId={fileId}
          user={user}
          onFileSaved={(newFileId) => {
            handleFileSaved()
            if (newFileId) {
              setFileId(newFileId)
            }
            loadProject() // Обновляем список файлов после сохранения
          }}
          projectId={parseInt(projectId)}
          onFileIdUpdate={(id) => setFileId(id)}
          fileName={projectFiles.find(f => f.id === fileId)?.original_filename || pendingFileName}
          onFileNameChange={(newName) => {
            // Обновляем имя файла в списке
            setProjectFiles(prev => prev.map(f => 
              f.id === fileId ? { ...f, original_filename: newName } : f
            ))
          }}
        />
      )}

      {activeTab === 'chart' && fileId && (
        <ChartTab
          data={currentData}
          columns={columns}
          fileId={fileId}
          user={user}
          projectId={parseInt(projectId)}
          onChartSaved={() => {
            loadProject() // Обновляем список диаграмм после сохранения
          }}
        />
      )}
      
      <DeleteFileModal
        isOpen={deleteFileModal.isOpen}
        onClose={() => setDeleteFileModal({ isOpen: false, fileId: null, fileName: '' })}
        onConfirm={handleDeleteFile}
        fileName={deleteFileModal.fileName}
      />
    </div>
  )
}

export default ProjectDetail

