// Утилиты для работы с localStorage и sessionStorage

const STORAGE_KEYS = {
  ANONYMOUS_DATA: 'sunburst_anonymous_data',
  ANONYMOUS_SESSION: 'sunburst_anonymous_session',
  USER_TOKEN: 'sunburst_user_token',
  USER_DATA: 'sunburst_user_data'
}

// Работа с анонимными данными (localStorage - сохраняются между сессиями)
export const saveAnonymousData = (data) => {
  try {
    const dataToSave = {
      data: data.data,
      columns: data.columns,
      fileId: data.fileId,
      timestamp: Date.now()
    }
    localStorage.setItem(STORAGE_KEYS.ANONYMOUS_DATA, JSON.stringify(dataToSave))
    return true
  } catch (error) {
    console.error('Ошибка сохранения анонимных данных:', error)
    return false
  }
}

export const loadAnonymousData = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.ANONYMOUS_DATA)
    if (!saved) return null
    
    const data = JSON.parse(saved)
    // Проверяем, не старше ли данные 24 часов
    const oneDay = 24 * 60 * 60 * 1000
    if (Date.now() - data.timestamp > oneDay) {
      localStorage.removeItem(STORAGE_KEYS.ANONYMOUS_DATA)
      return null
    }
    
    return {
      data: data.data,
      columns: data.columns,
      fileId: data.fileId
    }
  } catch (error) {
    console.error('Ошибка загрузки анонимных данных:', error)
    return null
  }
}

export const clearAnonymousData = () => {
  localStorage.removeItem(STORAGE_KEYS.ANONYMOUS_DATA)
  sessionStorage.removeItem(STORAGE_KEYS.ANONYMOUS_SESSION)
}

// Работа с токеном пользователя
export const saveUserToken = (token) => {
  try {
    localStorage.setItem(STORAGE_KEYS.USER_TOKEN, token)
    return true
  } catch (error) {
    console.error('Ошибка сохранения токена:', error)
    return false
  }
}

export const getUserToken = () => {
  return localStorage.getItem(STORAGE_KEYS.USER_TOKEN)
}

export const clearUserToken = () => {
  localStorage.removeItem(STORAGE_KEYS.USER_TOKEN)
  localStorage.removeItem(STORAGE_KEYS.USER_DATA)
}

// Работа с данными пользователя
export const saveUserData = (userData) => {
  try {
    localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData))
    return true
  } catch (error) {
    console.error('Ошибка сохранения данных пользователя:', error)
    return false
  }
}

export const getUserData = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.USER_DATA)
    return saved ? JSON.parse(saved) : null
  } catch (error) {
    console.error('Ошибка загрузки данных пользователя:', error)
    return null
  }
}

// Alias для getUserData (для обратной совместимости)
export const getUser = getUserData

// Работа с текущим файлом пользователя (для быстрого восстановления)
export const saveUserCurrentFile = (data) => {
  try {
    const dataToSave = {
      data: data.data,
      columns: data.columns,
      fileId: data.fileId,
      timestamp: Date.now()
    }
    localStorage.setItem('sunburst_user_current_file', JSON.stringify(dataToSave))
    return true
  } catch (error) {
    console.error('Ошибка сохранения текущего файла пользователя:', error)
    return false
  }
}

export const loadUserCurrentFile = () => {
  try {
    const saved = localStorage.getItem('sunburst_user_current_file')
    if (!saved) return null
    
    const data = JSON.parse(saved)
    // Проверяем, не старше ли данные 7 дней
    const oneWeek = 7 * 24 * 60 * 60 * 1000
    if (Date.now() - data.timestamp > oneWeek) {
      localStorage.removeItem('sunburst_user_current_file')
      return null
    }
    
    return {
      data: data.data,
      columns: data.columns,
      fileId: data.fileId
    }
  } catch (error) {
    console.error('Ошибка загрузки текущего файла пользователя:', error)
    return null
  }
}

