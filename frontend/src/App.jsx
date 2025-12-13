import React, { useState, useEffect, useRef } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import FileTab from './components/FileTab'
import EditorTab from './components/EditorTab'
import ChartTab from './components/ChartTab'
import ProjectsTab from './components/ProjectsTab'
import ProjectDetail from './components/ProjectDetail'
import AuthModal from './components/AuthModal'
import { loadAnonymousData, saveAnonymousData, getUserToken, getUserData, clearUserToken, clearAnonymousData, loadUserCurrentFile, saveUserCurrentFile, saveUserData } from './utils/storage'
import apiClient from './api/client'
import './App.css'

function AppContent() {
  const [activeTab, setActiveTab] = useState('file')
  const [currentData, setCurrentData] = useState(null)
  const [columns, setColumns] = useState([])
  const [fileId, setFileId] = useState(null)
  const [user, setUser] = useState(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [isFileModified, setIsFileModified] = useState(false)
  const navigate = useNavigate()

  // Загружаем сохраненные данные и пользователя при монтировании
  useEffect(() => {
    loadUserAndData()
  }, [])

  const loadUserAndData = async () => {
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
          // Сохраняем обновленные данные
          saveUserData(updatedUserData)
          
          // Пытаемся загрузить последний файл пользователя из localStorage или БД
          try {
            const savedFile = loadUserCurrentFile()
            if (savedFile) {
              setCurrentData(savedFile.data)
              setColumns(savedFile.columns)
              setFileId(savedFile.fileId)
              return
            }
            
            // Если нет в localStorage, загружаем из БД
            const filesResponse = await apiClient.get('/files/')
            if (filesResponse.data && filesResponse.data.length > 0) {
              const lastFile = filesResponse.data[0] // Самый последний файл
              setCurrentData(lastFile.data)
              setColumns(lastFile.columns)
              setFileId(lastFile.id)
            }
          } catch (err) {
            console.error('Ошибка загрузки файлов пользователя:', err)
          }
        }
      } catch (err) {
        // Токен невалидный или пользователь не найден - очищаем данные
        console.error('Токен невалидный или пользователь не найден:', err)
        // Очищаем токен и данные пользователя
        setUser(null)
        clearUserToken()
        clearAnonymousData()
        delete apiClient.defaults.headers.common['Authorization']
        // Очищаем данные
        setCurrentData(null)
        setColumns([])
        setFileId(null)
        // Загружаем анонимные данные
        const saved = loadAnonymousData()
        if (saved) {
          setCurrentData(saved.data)
          setColumns(saved.columns)
          setFileId(saved.fileId)
        }
        return
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
  }

  // Используем ref для хранения предыдущих значений
  const prevDataRef = useRef({ data: null, columns: null, fileId: null, user: null })
  
  // Сохраняем данные при изменении (с debounce и проверкой на реальные изменения)
  useEffect(() => {
    if (!currentData || !columns) return
    
    // Проверяем, действительно ли данные изменились
    const dataChanged = JSON.stringify(currentData) !== JSON.stringify(prevDataRef.current.data)
    const columnsChanged = JSON.stringify(columns) !== JSON.stringify(prevDataRef.current.columns)
    const fileIdChanged = fileId !== prevDataRef.current.fileId
    const userChanged = (user?.id || null) !== (prevDataRef.current.user?.id || null)
    
    if (!dataChanged && !columnsChanged && !fileIdChanged && !userChanged) {
      return // Данные не изменились, не сохраняем
    }
    
    // Обновляем ref
    prevDataRef.current = { data: currentData, columns: columns, fileId: fileId, user: user }
    
    // Используем таймер для debounce сохранения
    const saveTimer = setTimeout(() => {
      if (user) {
        // Для авторизованных пользователей сохраняем в localStorage для быстрого восстановления
        // Основные данные уже в БД
        saveUserCurrentFile({
          data: currentData,
          columns: columns,
          fileId: fileId
        })
      } else {
        // Для анонимных пользователей сохраняем в специальное хранилище
        saveAnonymousData({
          data: currentData,
          columns: columns,
          fileId: fileId
        })
      }
    }, 500) // Задержка 500мс для debounce

    return () => clearTimeout(saveTimer)
  }, [currentData, columns, fileId, user])

  const handleLogin = async (userData) => {
    try {
      if (!userData) {
        console.error('handleLogin: userData is null or undefined')
        throw new Error('Данные пользователя не получены')
      }

      // Сначала устанавливаем пользователя, чтобы UI обновился
      setUser(userData)
      
      const token = getUserToken()
      if (!token) {
        console.error('handleLogin: token not found in localStorage')
        throw new Error('Токен не найден')
      }
      
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`
      
      // Переносим анонимные данные в аккаунт пользователя (необязательно, не блокируем вход)
      const anonymousData = loadAnonymousData()
      if (anonymousData && anonymousData.fileId) {
        try {
          const transferResponse = await apiClient.post('/auth/transfer-anonymous-data', {
            anonymous_file_id: anonymousData.fileId
          })
          
          if (transferResponse.data && transferResponse.data.file_id) {
            // Загружаем перенесенный файл
            const fileResponse = await apiClient.get(`/files/${transferResponse.data.file_id}`)
            if (fileResponse.data) {
              setCurrentData(fileResponse.data.data)
              setColumns(fileResponse.data.columns)
              setFileId(fileResponse.data.id)
              // Сохраняем в localStorage пользователя
              saveUserCurrentFile({
                data: fileResponse.data.data,
                columns: fileResponse.data.columns,
                fileId: fileResponse.data.id
              })
            }
          }
          
          // Очищаем анонимные данные
          clearAnonymousData()
        } catch (err) {
          console.error('Ошибка переноса анонимных данных:', err)
          // Если перенос не удался, просто продолжаем без переноса - это не критично
        }
      }
      
      // Успешно вошли - пользователь уже установлен выше
    } catch (err) {
      console.error('Ошибка в handleLogin:', err)
      // В случае ошибки очищаем состояние
      setUser(null)
      clearUserToken()
      // Пробрасываем ошибку дальше, чтобы AuthModal мог её обработать
      throw err
    }
  }

  const handleLogout = () => {
    setUser(null)
    clearUserToken()
    clearAnonymousData()
    delete apiClient.defaults.headers.common['Authorization']
    // Очищаем данные при выходе
    setCurrentData(null)
    setColumns([])
    setFileId(null)
    navigate('/')
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
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>Привет, {user.first_name || user.username || user.email}!</span>
              <button type="button" onClick={handleLogout} className="danger">
                Выйти
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setShowAuthModal(true)} className="primary">
              Войти / Зарегистрироваться
            </button>
          )}
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
        {user && (
          <button
            type="button"
            className={`tab-button ${activeTab === 'projects' ? 'active' : ''}`}
            onClick={() => setActiveTab('projects')}
          >
            💾 Мои проекты
          </button>
        )}
      </div>

      {activeTab === 'file' && (
        <FileTab
          onFileLoaded={handleFileLoaded}
          currentData={currentData}
          columns={columns}
          fileId={fileId}
          onFileLoadedCallback={() => setIsFileModified(false)}
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
          onChartSaved={() => {
            // Обновляем список диаграмм при сохранении
          }}
        />
      )}

      {activeTab === 'projects' && user && (
        <ProjectsTab
          onFileSelect={(data, cols, id) => {
            setCurrentData(data)
            setColumns(cols)
            setFileId(id)
            setIsFileModified(false)
            setActiveTab('editor')
          }}
          onDiagramSelect={(diagram) => {
            // Загружаем файл диаграммы
            apiClient.get(`/files/${diagram.data_file_id}`).then(response => {
              setCurrentData(response.data.data)
              setColumns(response.data.columns)
              setFileId(response.data.id)
              setIsFileModified(false)
              setActiveTab('chart')
            }).catch(err => {
              alert('Ошибка загрузки файла диаграммы: ' + (err.response?.data?.detail || err.message))
            })
          }}
          currentFileId={fileId}
          isFileModified={isFileModified}
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
    <Router>
      <Routes>
        <Route path="/" element={<AppContent />} />
        <Route path="/project/:projectId" element={<ProjectDetailRoute />} />
      </Routes>
    </Router>
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
