import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1'

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

export default apiClient

