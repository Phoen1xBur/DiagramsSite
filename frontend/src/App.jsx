import React, { useState, useEffect, useRef } from 'react'
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom'
import FileTab from './components/FileTab'
import EditorTab from './components/EditorTab'
import ChartTab from './components/ChartTab'
import ProjectsTab from './components/ProjectsTab'
import ProjectDetail from './components/ProjectDetail'
import AuthModal from './components/AuthModal'
import { NotificationProvider, useNotification } from './contexts/NotificationContext'
import { loadAnonymousData, saveAnonymousData, getUserToken, getUserData, clearUserToken, clearAnonymousData, loadUserCurrentFile, saveUserCurrentFile, saveUserData } from './utils/storage'
import apiClient from './api/client'
import './App.css'

function AppContent() {
  const { showNotification } = useNotification()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('file')
  const [currentData, setCurrentData] = useState(null)
  const [columns, setColumns] = useState([])
  const [fileId, setFileId] = useState(null)
  const [user, setUser] = useState(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [isFileModified, setIsFileModified] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const hasLoadedRef = useRef(false)

  // Загружаем сохраненные данные и пользователя при монтировании (только один раз)
  useEffect(() => {
    if (hasLoadedRef.current) {
      console.warn('loadUserAndData уже был вызван, пропускаем')
      return
    }
    hasLoadedRef.current = true
    console.log('Начало загрузки данных пользователя')
    
    const loadUserAndData = async () => {
      setIsLoading(true)
      try {
        // Загружаем пользователя
        const token = getUserToken()
        const userData = getUserData()
        
        if (token && userData) {
          // Устанавливаем токен в API клиент
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`
          
          // Проверяем валидность токена через API
          try {
            const meResponse = await apiClient.get('/auth/me')
            if (meResponse.data) {
              // Токен валидный, обновляем данные пользователя
              const updatedUserData = {
                id: meResponse.data.id,
                email: meResponse.data.email,
                first_name: meResponse.data.first_name,
                username: meResponse.data.username,
                is_active: meResponse.data.is_active,
                subscription_type: meResponse.data.subscription_type,
                created_at: meResponse.data.created_at
              }
              setUser(updatedUserData)
              saveUserData(updatedUserData)
              
              // Пытаемся загрузить последний файл пользователя из localStorage
              try {
                const savedFile = loadUserCurrentFile()
                if (savedFile) {
                  setCurrentData(savedFile.data)
                  setColumns(savedFile.columns)
                  setFileId(savedFile.fileId)
                } else {
                  // Если нет в localStorage, загружаем из БД (только если есть токен)
                  const filesResponse = await apiClient.get('/files/')
                  if (filesResponse.data && filesResponse.data.length > 0) {
                    const lastFile = filesResponse.data[0]
                    setCurrentData(lastFile.data)
                    setColumns(lastFile.columns)
                    setFileId(lastFile.id)
                  }
                }
              } catch (err) {
                // Игнорируем ошибки загрузки файлов - не критично
                console.error('Ошибка загрузки файлов пользователя:', err)
              }
            }
          } catch (err) {
            // Очищаем токен только при 401
            if (err.response?.status === 401) {
              setUser(null)
              clearUserToken()
              delete apiClient.defaults.headers.common['Authorization']
              
              // Загружаем анонимные данные
              const saved = loadAnonymousData()
              if (saved) {
                setCurrentData(saved.data)
                setColumns(saved.columns)
                setFileId(saved.fileId)
              }
            }
          }
        } else {
          // Загружаем анонимные данные только если не авторизован
          const saved = loadAnonymousData()
          if (saved) {
            setCurrentData(saved.data)
            setColumns(saved.columns)
            setFileId(saved.fileId)
          }
        }
      } catch (err) {
        console.error('Ошибка при загрузке данных:', err)
      } finally {
        setIsLoading(false)
        console.log('Загрузка данных завершена')
      }
    }
    
    loadUserAndData()
    
    // Защита от повторного вызова
    return () => {
      console.log('AppContent размонтирован')
    }
  }, []) // Пустой массив - выполняется только при монтировании

  // Используем ref для хранения предыдущих значений
  const prevDataRef = useRef({ data: null, columns: null, fileId: null, user: null })
  
  // Сохраняем данные при изменении (с debounce и проверкой на реальные изменения)
  // ВАЖНО: Этот useEffect НЕ должен вызывать изменения состояния, только сохранять в localStorage
  useEffect(() => {
    // Не сохраняем если еще идет загрузка
    if (isLoading) return
    if (!currentData || !columns) return
    
    // Проверяем, действительно ли данные изменились
    const dataChanged = JSON.stringify(currentData) !== JSON.stringify(prevDataRef.current.data)
    const columnsChanged = JSON.stringify(columns) !== JSON.stringify(prevDataRef.current.columns)
    const fileIdChanged = fileId !== prevDataRef.current.fileId
    const userChanged = (user?.id || null) !== (prevDataRef.current.user?.id || null)
    
    if (!dataChanged && !columnsChanged && !fileIdChanged && !userChanged) {
      return // Данные не изменились, не сохраняем
    }
    
    // Обновляем ref СНАЧАЛА, чтобы избежать циклов
    prevDataRef.current = { data: currentData, columns: columns, fileId: fileId, user: user }
    
    // Используем таймер для debounce сохранения
    const saveTimer = setTimeout(() => {
      // Только сохраняем в localStorage, НЕ изменяем состояние
      try {
        if (user) {
          saveUserCurrentFile({
            data: currentData,
            columns: columns,
            fileId: fileId
          })
        } else {
          saveAnonymousData({
            data: currentData,
            columns: columns,
            fileId: fileId
          })
        }
      } catch (err) {
        console.error('Ошибка сохранения данных:', err)
      }
    }, 1000) // Увеличиваем задержку до 1 секунды для debounce

    return () => clearTimeout(saveTimer)
  }, [currentData, columns, fileId, user, isLoading])

  const handleLogin = async (userData) => {
    try {
      if (!userData) {
        throw new Error('Данные пользователя не получены')
      }

      setUser(userData)
      
      const token = getUserToken()
      if (!token) {
        throw new Error('Токен не найден')
      }
      
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`
      
      // Переносим анонимные данные в аккаунт пользователя (необязательно)
      const anonymousData = loadAnonymousData()
      if (anonymousData && anonymousData.fileId) {
        try {
          const transferResponse = await apiClient.post('/auth/transfer-anonymous-data', {
            anonymous_file_id: anonymousData.fileId
          })
          
          if (transferResponse.data && transferResponse.data.file_id) {
            const fileResponse = await apiClient.get(`/files/${transferResponse.data.file_id}`)
            if (fileResponse.data) {
              setCurrentData(fileResponse.data.data)
              setColumns(fileResponse.data.columns)
              setFileId(fileResponse.data.id)
              saveUserCurrentFile({
                data: fileResponse.data.data,
                columns: fileResponse.data.columns,
                fileId: fileResponse.data.id
              })
            }
          }
          
          clearAnonymousData()
        } catch (err) {
          console.error('Ошибка переноса анонимных данных:', err)
          // Не критично, продолжаем
        }
      }
      showNotification('Вы успешно вошли в систему!', 'success')
    } catch (err) {
      console.error('Ошибка в handleLogin:', err)
      setUser(null)
      clearUserToken()
      throw err
    }
  }

  const handleLogout = () => {
    setUser(null)
    clearUserToken()
    clearAnonymousData()
    delete apiClient.defaults.headers.common['Authorization']
    setCurrentData(null)
    setColumns([])
    setFileId(null)
    showNotification('Вы успешно вышли из системы', 'info')
    navigate('/')
  }

  const handleFileLoaded = (data, cols, id) => {
    setCurrentData(data)
    setColumns(cols)
    setFileId(id)
    // Если файл новый (id = null), помечаем как измененный
    setIsFileModified(id === null)
  }

  const handleDataUpdated = (data) => {
    setCurrentData(data)
    setIsFileModified(true)
  }

  const handleFileSaved = (newFileId) => {
    setIsFileModified(false)
    // Если файл был создан (newFileId передан), обновляем fileId
    if (newFileId) {
      setFileId(newFileId)
    }
  }

  if (isLoading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Загрузка...</div>
  }

  // Для зарегистрированных пользователей показываем только проекты
  if (user) {
    return (
      <div className="app">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2>Мои проекты</h2>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>Привет, {user.first_name || user.username || user.email}!</span>
              <button type="button" onClick={handleLogout} className="danger">
                Выйти
              </button>
            </div>
          </div>
        </div>

        <ProjectsTab
          onFileSelect={(file) => {
            // При выборе файла переходим в проект
            if (file.project_id) {
              navigate(`/project/${file.project_id}`)
            }
          }}
          onDiagramSelect={(diagram) => {
            // При выборе диаграммы переходим в проект
            if (diagram.project_id) {
              navigate(`/project/${diagram.project_id}`)
            }
          }}
          currentFileId={fileId}
          isFileModified={isFileModified}
        />

        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onLogin={handleLogin}
        />
      </div>
    )
  }

  // Для незарегистрированных пользователей показываем обычный интерфейс
  return (
    <div className="app">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2>Диаграмма "Солнечные лучи"</h2>
          {fileId && currentData && (
            <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>
              Текущий файл: {columns.length > 0 ? `${columns.length} столбцов, ${currentData.length} строк` : 'Нет данных'}
            </p>
          )}
        </div>
        <div>
          <button type="button" onClick={() => setShowAuthModal(true)} className="primary">
            Войти / Зарегистрироваться
          </button>
        </div>
      </div>

      <div className="tab-container">
        <button
          type="button"
          className={`tab-button-guest ${activeTab === 'file' ? 'active' : ''}`}
          onClick={() => setActiveTab('file')}
        >
          📁 Файл
        </button>
        <button
          type="button"
          className={`tab-button-guest ${activeTab === 'editor' ? 'active' : ''}`}
          onClick={() => setActiveTab('editor')}
        >
          ✏️ Редактор
        </button>
        <button
          type="button"
          className={`tab-button-guest ${activeTab === 'chart' ? 'active' : ''}`}
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
          onSwitchToEditor={() => setActiveTab('editor')}
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
          onFileIdUpdate={setFileId}
        />
      )}

      {activeTab === 'chart' && (
        <ChartTab
          data={currentData}
          columns={columns}
          fileId={fileId}
          user={user}
          onChartSaved={() => {
            // Обновляем список диаграмм при сохранении
          }}
        />
      )}

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onLogin={handleLogin}
      />
    </div>
  )
}

function App() {
  return (
    <NotificationProvider>
      <Router>
        <Routes>
          <Route path="/" element={<AppContent />} />
          <Route path="/project/:projectId" element={<ProjectDetailRoute />} />
        </Routes>
      </Router>
    </NotificationProvider>
  )
}

function ProjectDetailRoute() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const token = getUserToken()
    const userData = getUserData()
    if (token && userData) {
      setUser(userData)
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`
    } else {
      navigate('/')
    }
    setLoading(false)
  }, [navigate])

  if (loading) return <div>Загрузка...</div>
  if (!user) return null

  return <ProjectDetail />
}

export default App
