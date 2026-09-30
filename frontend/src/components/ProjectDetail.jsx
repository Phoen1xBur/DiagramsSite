import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import FileTab from './FileTab'
import EditorTab from './EditorTab'
import ChartTab from './ChartTab'
import DeleteFileModal from './DeleteFileModal'
import RenameFileModal from './RenameFileModal'
import RenameDiagramModal from './RenameDiagramModal'
import ConfirmDeleteModal from './ConfirmDeleteModal'
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
  const [renameDiagramModal, setRenameDiagramModal] = useState({ isOpen: false, diagramId: null, currentName: '' })
  const [deleteDiagramModal, setDeleteDiagramModal] = useState({ isOpen: false, diagramId: null, diagramName: '' })
  const [renameFileModal, setRenameFileModal] = useState({ isOpen: false, fileId: null, currentName: '' })
  const [isRenamingFile, setIsRenamingFile] = useState(false)
  const [openedDiagramId, setOpenedDiagramId] = useState(null)
  const [isRenamingDiagram, setIsRenamingDiagram] = useState(false)
  const [projectName, setProjectName] = useState('')

  useEffect(() => {
    const userData = getUserData()
    if (userData) {
      setUser(userData)
    }
    loadProject()
  }, [projectId])

  // При смене файла (например после импорта) сбрасываем открытую диаграмму,
  // чтобы не подставлять столбцы от старого файла
  useEffect(() => {
    setOpenedDiagramId(null)
  }, [fileId])

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

  const handleColumnsUpdated = (newColumns) => {
    setColumns(newColumns)
    setIsFileModified(true)
  }

  const handleFileSaved = () => {
    setIsFileModified(false)
  }

  const currentFileName = (fileId || currentData) ? (projectFiles.find(f => f.id === fileId)?.original_filename || pendingFileName || '') : ''

  const buildExportMatrix = (cols, rows) => {
    // Same headers as the data-editor table; one cell per column (empty string for blanks).
    const headers = (cols || []).map(c => String(c ?? ''))
    const body = (rows || []).map(row => {
      if (Array.isArray(row)) {
        return headers.map((_, i) => {
          const raw = row[i]
          return raw === null || raw === undefined ? '' : String(raw)
        })
      }
      return headers.map(col => {
        const raw = row?.[col]
        return raw === null || raw === undefined ? '' : String(raw)
      })
    })
    return { headers, body }
  }

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const escapeCsv = (value) => {
    const s = value === null || value === undefined ? '' : String(value)
    if (/[",\n\r;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }

  /** Strip every trailing .xlsx/.xls/.csv so downloads never become name.xlsx.xlsx */
  const stripSpreadsheetExt = (filename) => {
    let stem = String(filename || 'data').replace(/\s+/g, '_').trim() || 'data'
    let prev
    do {
      prev = stem
      stem = stem.replace(/\.(xlsx|xls|csv)$/i, '')
    } while (stem !== prev)
    return stem || 'data'
  }

  const exportAsCsv = (cols, rows, filename) => {
    const { headers, body } = buildExportMatrix(cols, rows)
    const csv = [headers, ...body].map(line => line.map(escapeCsv).join(',')).join('\n')
    const outName = stripSpreadsheetExt(filename) + '.csv'
    downloadBlob(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }), outName)
  }

  const xmlEscape = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  // SpreadsheetML (.xls). ss:Index keeps blank cells from collapsing under wrong headers.
  const exportAsXlsx = async (cols, rows, filename) => {
    const { headers, body } = buildExportMatrix(cols, rows)
    const cell = (v, i) => '<Cell ss:Index="' + (i + 1) + '"><Data ss:Type="String">' + xmlEscape(v) + '</Data></Cell>'
    const rowXml = (vals) => '<Row>' + vals.map(cell).join('') + '</Row>'
    const xml = [
      '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>',
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
      ' xmlns:o="urn:schemas-microsoft-com:office:office"',
      ' xmlns:x="urn:schemas-microsoft-com:office:excel"',
      ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"',
      ' xmlns:html="http://www.w3.org/TR/REC-html40">',
      '<Worksheet ss:Name="Данные"><Table>',
      rowXml(headers),
      body.map(rowXml).join('\n'),
      '</Table></Worksheet></Workbook>'
    ].join('\n')
    const outName = stripSpreadsheetExt(filename) + '.xls'
    downloadBlob(
      new Blob(['\ufeff' + xml], { type: 'application/vnd.ms-excel;charset=utf-8;' }),
      outName
    )
  }

  const exportTable = async (cols, rows, filenameBase) => {
    if (!cols || !cols.length || !rows || !rows.length) {
      showNotification('Нет данных для экспорта', 'warning')
      return
    }
    const originalLower = String(filenameBase || '').toLowerCase()
    const stem = stripSpreadsheetExt(filenameBase || 'data')
    if (originalLower.endsWith('.csv')) {
      exportAsCsv(cols, rows, stem)
    } else {
      await exportAsXlsx(cols, rows, stem)
    }
  }


  const handleExportFile = async (fileIdToExport, fileNameForDownload) => {
    try {
      const fileResponse = await apiClient.get(`/files/${fileIdToExport}`)
      const data = fileResponse.data.data
      const cols = fileResponse.data.columns
      if (!data || data.length === 0) {
        showNotification('В файле нет данных для экспорта', 'warning')
        return
      }
      await exportTable(cols, data, fileNameForDownload || 'data')
      showNotification('Файл экспортирован', 'success')
    } catch (err) {
      showNotification('Ошибка экспорта: ' + (err.response?.data?.detail || err.message), 'error')
    }
  }

  const handleExportCurrentFile = async (colsArg, rowsArg) => {
    // Prefer columns/rows from the open data editor so headers match the UI table.
    const cols = (Array.isArray(colsArg) && colsArg.length) ? colsArg : columns
    const rows = (Array.isArray(rowsArg) && rowsArg.length) ? rowsArg : currentData
    if (!rows || rows.length === 0) {
      showNotification('Нет данных для экспорта!', 'warning')
      return
    }
    try {
      await exportTable(cols, rows, currentFileName || 'data')
      showNotification('Данные экспортированы!', 'success')
    } catch (err) {
      showNotification('Ошибка экспорта: ' + err.message, 'error')
    }
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
        name: projectName.trim(),
        description: null  // убираем надпись «Проект создан автоматически при регистрации» после переименования
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', maxWidth: '500px', justifyContent: 'center', margin: '0 auto' }}>
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
                  flex: 1,
                  maxWidth: '400px'
                }}
                autoFocus
              />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <div className="project-title-block">
                <h2 style={{ margin: 0 }}>{project.name}</h2>
                {(fileId || currentData) && currentFileName && (
                  <p className="project-open-filename">{currentFileName}</p>
                )}
              </div>
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
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <button
                            className="export-file-btn-small"
                            onClick={() => handleExportFile(file.id, file.original_filename || `Файл #${file.id}`)}
                            title="Экспорт в Excel"
                          >
                            💾
                          </button>
                          <button
                            className="rename-file-btn-small"
                            onClick={() => setRenameFileModal({
                              isOpen: true,
                              fileId: file.id,
                              currentName: file.original_filename || `Файл #${file.id}`
                            })}
                            title="Переименовать файл"
                          >
                            ✏️
                          </button>
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
                      </div>
                      <div className="file-card-info">
                        <span>📊 Столбцов: {file.columns?.length || 0}</span>
                        <span>📋 Строк: {file.data?.length || 0}</span>
                      </div>
                      <div className="file-card-actions file-card-actions-two">
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
                          Редактор
                        </button>
                        <button 
                          className="primary file-card-button" 
                          onClick={async () => {
                            try {
                              const fileResponse = await apiClient.get(`/files/${file.id}`)
                              setCurrentData(fileResponse.data.data)
                              setColumns(fileResponse.data.columns)
                              setFileId(fileResponse.data.id)
                              setIsFileModified(false)
                              setActiveTab('chart')
                            } catch (err) {
                              showNotification('Ошибка загрузки файла: ' + (err.response?.data?.detail || err.message), 'error')
                            }
                          }}
                        >
                          Диаграмма
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
            hasProjectFiles={projectFiles.length > 0}
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
              {projectDiagrams.map(diagram => {
                const diagramFile = projectFiles.find(f => f.id === diagram.data_file_id)
                const fileName = diagramFile?.original_filename || 'Файл не найден'
                const diagramName = diagram.name || `Диаграмма #${diagram.id}`
                const fullName = `${fileName}: ${diagramName}`
                
                return (
                <div key={diagram.id} className="diagram-item">
                  <div className="diagram-info">
                    <h4>{fullName}</h4>
                    <p>Иерархия: {diagram.hierarchy_columns?.join(' → ') || 'Нет данных'}</p>
                    {diagram.value_column && <p>Столбец значений: {diagram.value_column}</p>}
                    <p className="diagram-date">Создана: {new Date(diagram.created_at).toLocaleString('ru-RU')}</p>
                  </div>
                  <div className="diagram-actions">
                    <button 
                      className="primary" 
                      onClick={async () => {
                        try {
                          const fileResponse = await apiClient.get(`/files/${diagram.data_file_id}`)
                          setCurrentData(fileResponse.data.data)
                          setColumns(fileResponse.data.columns)
                          setFileId(fileResponse.data.id)
                          setIsFileModified(false)
                          setOpenedDiagramId(diagram.id)
                          setActiveTab('chart')
                        } catch (err) {
                          showNotification('Ошибка загрузки файла диаграммы: ' + (err.response?.data?.detail || err.message), 'error')
                        }
                      }}
                    >
                      📊 Открыть
                    </button>
                    <button 
                      className="secondary" 
                      onClick={() => {
                        setRenameDiagramModal({
                          isOpen: true,
                          diagramId: diagram.id,
                          currentName: diagramName
                        })
                      }}
                    >
                      ✏️ Переименовать
                    </button>
                    <button 
                      className="delete" 
                      onClick={() => {
                        setDeleteDiagramModal({
                          isOpen: true,
                          diagramId: diagram.id,
                          diagramName: fullName
                        })
                      }}
                    >
                      🗑️ Удалить
                    </button>
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'editor' && (fileId || currentData) && (
        <EditorTab
          data={currentData}
          columns={columns}
          onDataUpdated={handleDataUpdated}
          onColumnsUpdated={handleColumnsUpdated}
          onExportCurrentFile={handleExportCurrentFile}
          fileId={fileId}
          user={user}
          isModified={isFileModified}
          onModifiedChange={setIsFileModified}
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
          openedDiagramId={openedDiagramId}
          fileName={projectFiles.find(f => f.id === fileId)?.original_filename || 'Загрузка...'}
          onChartSaved={async (created) => {
            if (created?.id) {
              setProjectDiagrams(prev => prev.some(d => d.id === created.id) ? prev : [...prev, created])
            }
            await loadProject()
          }}
        />
      )}
      
      <DeleteFileModal
        isOpen={deleteFileModal.isOpen}
        onClose={() => setDeleteFileModal({ isOpen: false, fileId: null, fileName: '' })}
        onConfirm={handleDeleteFile}
        fileName={deleteFileModal.fileName}
      />

      <RenameDiagramModal
        isOpen={renameDiagramModal.isOpen}
        currentName={renameDiagramModal.currentName}
        isLoading={isRenamingDiagram}
        onClose={() => {
          if (!isRenamingDiagram) {
            setRenameDiagramModal({ isOpen: false, diagramId: null, currentName: '' })
          }
        }}
        onRename={async (newName) => {
          setIsRenamingDiagram(true)
          try {
            const diagram = projectDiagrams.find(d => d.id === renameDiagramModal.diagramId)
            if (!diagram) {
              throw new Error('Диаграмма не найдена')
            }
            
            // Обновляем только имя, остальные поля оставляем без изменений
            await apiClient.put(`/diagrams/${renameDiagramModal.diagramId}`, {
              data_file_id: diagram.data_file_id,
              name: newName,
              hierarchy_columns: diagram.hierarchy_columns,
              value_column: diagram.value_column,
              use_gradient: diagram.use_gradient,
              uniform_size: diagram.uniform_size,
              show_zero_values: diagram.show_zero_values
            })
            
            showNotification('Диаграмма переименована!', 'success')
            await loadProject()
            setRenameDiagramModal({ isOpen: false, diagramId: null, currentName: '' })
          } catch (err) {
            showNotification('Ошибка переименования: ' + (err.response?.data?.detail || err.message), 'error')
          } finally {
            setIsRenamingDiagram(false)
          }
        }}
      />

      <ConfirmDeleteModal
        isOpen={deleteDiagramModal.isOpen}
        diagramName={deleteDiagramModal.diagramName}
        onClose={() => setDeleteDiagramModal({ isOpen: false, diagramId: null, diagramName: '' })}
        onConfirm={async () => {
          try {
            await apiClient.delete(`/diagrams/${deleteDiagramModal.diagramId}`)
            showNotification('Диаграмма удалена!', 'success')
            loadProject()
            setDeleteDiagramModal({ isOpen: false, diagramId: null, diagramName: '' })
          } catch (err) {
            showNotification('Ошибка удаления: ' + (err.response?.data?.detail || err.message), 'error')
          }
        }}
      />

      <RenameFileModal
        isOpen={renameFileModal.isOpen}
        currentName={renameFileModal.currentName}
        isLoading={isRenamingFile}
        onClose={() => {
          if (!isRenamingFile) {
            setRenameFileModal({ isOpen: false, fileId: null, currentName: '' })
          }
        }}
        onRename={async (newName) => {
          setIsRenamingFile(true)
          try {
            await apiClient.put(`/files/${renameFileModal.fileId}`, {
              original_filename: newName
            })
            
            showNotification('Файл переименован!', 'success')
            
            // Обновляем имя файла в локальном состоянии
            setProjectFiles(prev => prev.map(f => 
              f.id === renameFileModal.fileId ? { ...f, original_filename: newName } : f
            ))
            
            setRenameFileModal({ isOpen: false, fileId: null, currentName: '' })
          } catch (err) {
            showNotification('Ошибка переименования: ' + (err.response?.data?.detail || err.message), 'error')
          } finally {
            setIsRenamingFile(false)
          }
        }}
      />
    </div>
  )
}

export default ProjectDetail

