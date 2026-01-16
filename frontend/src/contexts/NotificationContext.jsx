import React, { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react'
import Toast from '../components/Toast'

/**
 * Контекст для управления toast-уведомлениями
 * 
 * ПРАВИЛО ПРОЕКТА: НЕ ИСПОЛЬЗУЙТЕ alert(), confirm() или prompt() в коде!
 * Все уведомления должны использовать этот контекст через хук useNotification().
 * 
 * Пример использования:
 * ```jsx
 * const { showNotification } = useNotification()
 * 
 * // Показать успешное уведомление
 * showNotification('Операция выполнена успешно!', 'success')
 * 
 * // Показать ошибку
 * showNotification('Произошла ошибка', 'error')
 * 
 * // Показать предупреждение
 * showNotification('Внимание!', 'warning')
 * 
 * // Показать информационное сообщение
 * showNotification('Информация', 'info')
 * ```
 */

const NotificationContext = createContext(null)

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])
  const callbacksRef = useRef({}) // Храним стабильные callback'и

  const showNotification = useCallback((message, type = 'info', duration = 6000) => {
    const id = Date.now() + Math.random()
    const newNotification = {
      id,
      message,
      type,
      duration
    }
    
    // Создаем стабильный callback для закрытия
    callbacksRef.current[id] = () => {
      setNotifications(prev => prev.filter(notif => notif.id !== id))
      delete callbacksRef.current[id]
    }
    
    setNotifications(prev => [...prev, newNotification])
    
    return id
  }, [])

  // Мемоизируем список Toast компонентов, чтобы избежать лишних ре-рендеров
  const toastComponents = useMemo(() => {
    return notifications.map(notif => (
      <Toast
        key={notif.id}
        message={notif.message}
        type={notif.type}
        duration={notif.duration}
        onClose={callbacksRef.current[notif.id]}
      />
    ))
  }, [notifications])

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      <div className="toast-container">
        {toastComponents}
      </div>
    </NotificationContext.Provider>
  )
}

export function useNotification() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider')
  }
  return context
}
