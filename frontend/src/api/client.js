import axios from 'axios'

// Определяем режим работы
// Поддерживаем строковые значения 'True', 'true', 'False', 'false' и булевы значения
const debugValue = import.meta.env.VITE_DEBUG
const isDebug = debugValue === 'True' || debugValue === 'true' || debugValue === true || debugValue === '1'

// Получаем порт backend из переменной окружения (по умолчанию 18000)
const backendPort = import.meta.env.VITE_BACKEND_PORT || '18000'

// Автоматически определяем API URL на основе режима работы
// В DEBUG режиме: прямой доступ к backend на localhost
// В PROD режиме: относительный путь через nginx прокси
const API_BASE_URL = isDebug 
  ? `http://localhost:${backendPort}/api/v1` // DEBUG: прямой доступ к backend
  : '/api/v1' // PROD: относительный путь через nginx прокси

const apiClient = axios.create({
  baseURL: API_BASE_URL,
})

// Добавляем interceptor для установки Content-Type только для JSON запросов
apiClient.interceptors.request.use((config) => {
  // Если это FormData или URLSearchParams, не устанавливаем Content-Type
  if (!(config.data instanceof FormData) && !(config.data instanceof URLSearchParams)) {
    if (!config.headers['Content-Type']) {
      config.headers['Content-Type'] = 'application/json'
    }
  }
  
  // Добавляем токен авторизации если есть
  const token = localStorage.getItem('sunburst_user_token')
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  
  return config
})

// Добавляем interceptor для обработки ошибок авторизации
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Обрабатываем только 401 (Unauthorized) для автоматического разлогина
    // Ошибки валидации (422, 400) и другие ошибки не должны вызывать перезагрузку
    if (error.response?.status === 401) {
      const requestUrl = error.config?.url || ''
      
      // Исключаем из автоматического разлогина:
      // - /auth/login - это нормальная ошибка при неверном пароле, нужно показать пользователю
      // - /auth/register - это нормальная ошибка при регистрации (невалидный email и т.д.)
      // - /auth/me - уже обрабатывается в loadUserAndData
      const isAuthEndpoint = requestUrl.includes('/auth/login') || 
                            requestUrl.includes('/auth/register') ||
                            requestUrl.includes('/auth/me')
      
      if (!isAuthEndpoint) {
        // Очищаем токен и данные пользователя только для других запросов
        localStorage.removeItem('sunburst_user_token')
        localStorage.removeItem('sunburst_user_data')
        localStorage.removeItem('sunburst_user_current_file')
        
        // Перезагружаем страницу для сброса состояния
        // Но только если мы не на странице логина/регистрации и не на главной
        const currentPath = window.location.pathname
        if (currentPath !== '/' && !currentPath.includes('/login') && !currentPath.includes('/register')) {
          window.location.href = '/'
        } else if (currentPath === '/') {
          // Если уже на главной, просто перезагружаем страницу
          window.location.reload()
        }
      }
    }
    // Для всех остальных ошибок (422, 400, 500 и т.д.) просто пробрасываем ошибку дальше
    // Они должны обрабатываться в компонентах
    return Promise.reject(error)
  }
)

export default apiClient

