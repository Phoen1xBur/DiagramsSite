import axios from 'axios'

// VITE_API_BASE_URL - обязательный параметр с дефолтным значением
// По умолчанию: http://localhost:8000/api/v1 (для локальной разработки)
// В production через nginx: /api/v1
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'

console.log('API Base URL:', API_BASE_URL)

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

// Добавляем interceptor для обработки ошибок
// ВАЖНО: НЕ вызываем никаких перезагрузок страницы или навигации здесь
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const requestUrl = error.config?.url || ''
    const isAuthEndpoint = requestUrl.includes('/auth/login') || 
                          requestUrl.includes('/auth/register') ||
                          requestUrl.includes('/auth/me')
    
    // Обрабатываем 401 (Unauthorized)
    if (status === 401) {
      if (!isAuthEndpoint) {
        // Только очищаем токен, НЕ вызываем события и НЕ перезагружаем страницу
        // Компоненты сами обработают отсутствие токена
        const hadToken = !!localStorage.getItem('sunburst_user_token')
        
        if (hadToken) {
          localStorage.removeItem('sunburst_user_token')
          localStorage.removeItem('sunburst_user_data')
          localStorage.removeItem('sunburst_user_current_file')
          delete apiClient.defaults.headers.common['Authorization']
          console.warn('Токен авторизации истек. Очищены данные пользователя.')
        }
      }
    }
    
    // Улучшаем сообщения об ошибках для пользователя
    if (error.response) {
      // Для 404 на auth endpoints - это неправильный логин/пароль или пользователь не найден
      if (status === 404 && isAuthEndpoint) {
        error.userMessage = 'Неверный email/логин или пароль'
      }
      // Для 500-599 - проблема на сервере
      else if (status >= 500 && status < 600) {
        error.userMessage = 'Проблема на стороне сервера. Попробуйте позже.'
      }
      // Для других ошибок используем сообщение от сервера или стандартное
      else if (!error.userMessage) {
        error.userMessage = error.response.data?.detail || 
                           error.response.data?.message || 
                           `Ошибка ${status}`
      }
    } else if (error.request) {
      // Запрос был отправлен, но ответа не получено
      error.userMessage = 'Не удалось подключиться к серверу. Проверьте подключение к интернету.'
    } else {
      // Ошибка при настройке запроса
      error.userMessage = 'Ошибка при выполнении запроса'
    }
    
    // Для всех ошибок просто пробрасываем ошибку дальше
    return Promise.reject(error)
  }
)

export default apiClient
