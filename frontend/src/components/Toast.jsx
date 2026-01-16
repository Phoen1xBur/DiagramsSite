import React, { useEffect, useState, useRef } from 'react'
import './Toast.css'

/**
 * Компонент для отображения toast-уведомлений
 * 
 * ПРАВИЛО: НЕ ИСПОЛЬЗУЙТЕ alert() или confirm() в коде!
 * Все уведомления должны использовать систему Toast через NotificationContext.
 * 
 * @param {Object} props
 * @param {string} props.message - Текст сообщения
 * @param {string} props.type - Тип уведомления: 'success', 'error', 'warning', 'info'
 * @param {Function} props.onClose - Callback при закрытии уведомления
 * @param {number} props.duration - Длительность отображения в миллисекундах (по умолчанию 6000)
 */
function Toast({ message, type = 'info', onClose, duration = 6000 }) {
  const [progress, setProgress] = useState(100)
  const [isPaused, setIsPaused] = useState(false)
  const timerRef = useRef(null)
  const progressIntervalRef = useRef(null)
  const startTimeRef = useRef(null)
  const totalElapsedRef = useRef(0) // Общее прошедшее время (включая паузы)
  const isMountedRef = useRef(true)
  const isPausedRef = useRef(false)
  const onCloseRef = useRef(onClose)
  const durationRef = useRef(duration)
  const hasInitializedRef = useRef(false) // Флаг инициализации
  const toastIdRef = useRef(Math.random()) // Уникальный ID для отладки

  // Синхронизируем refs с props (но не перезапускаем таймеры)
  useEffect(() => {
    onCloseRef.current = onClose
    // duration не меняется после инициализации, но на всякий случай
    if (!hasInitializedRef.current) {
      durationRef.current = duration
    }
  }, [onClose, duration])

  // Синхронизируем ref с state
  useEffect(() => {
    isPausedRef.current = isPaused
  }, [isPaused])

  // Основной эффект - запускается один раз при монтировании
  useEffect(() => {
    // Защита от повторной инициализации
    if (hasInitializedRef.current) {
      return
    }
    
    hasInitializedRef.current = true
    isMountedRef.current = true
    const mountTime = Date.now()
    startTimeRef.current = mountTime
    totalElapsedRef.current = 0
    setProgress(100)
    setIsPaused(false)
    isPausedRef.current = false
    
    const initialDuration = durationRef.current
    
    // Обновляем прогресс каждые 50мс для плавной анимации
    progressIntervalRef.current = setInterval(() => {
      if (!isMountedRef.current) {
        return
      }
      
      // Проверяем паузу через ref
      if (isPausedRef.current) {
        return
      }
      
      // Вычисляем прошедшее время: общее прошедшее время + время с последнего старта
      const now = Date.now()
      if (startTimeRef.current !== null) {
        const currentSessionElapsed = now - startTimeRef.current
        const totalElapsed = totalElapsedRef.current + currentSessionElapsed
        const remaining = Math.max(0, durationRef.current - totalElapsed)
        const progressPercent = (remaining / durationRef.current) * 100
        
        setProgress(progressPercent)
        
        if (remaining <= 0) {
          if (isMountedRef.current) {
            onCloseRef.current()
          }
        }
      }
    }, 50)
    
    // Запускаем таймер для закрытия
    timerRef.current = setTimeout(() => {
      if (!isPausedRef.current && isMountedRef.current) {
        onCloseRef.current()
      }
    }, initialDuration)
    
    return () => {
      isMountedRef.current = false
      hasInitializedRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    }
  }, []) // Пустой массив зависимостей - запускается только при монтировании

  // Эффект для обработки паузы/возобновления
  useEffect(() => {
    if (!isMountedRef.current || !hasInitializedRef.current) return
    
    if (isPaused) {
      // Пауза - сохраняем прошедшее время и останавливаем таймер
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      // Сохраняем прошедшее время текущей сессии в общее прошедшее время
      // Только если таймер еще не был запущен (startTimeRef существует)
      if (startTimeRef.current !== null) {
        const pauseTime = Date.now()
        const currentSessionElapsed = pauseTime - startTimeRef.current
        totalElapsedRef.current += currentSessionElapsed
        startTimeRef.current = null // Сбрасываем, чтобы не учитывать дважды
      }
    } else {
      // Возобновление - проверяем, не истекло ли время
      // Используем локальные переменные для безопасности
      const currentTotalElapsed = totalElapsedRef.current
      const currentDuration = durationRef.current
      
      if (currentTotalElapsed >= currentDuration) {
        onCloseRef.current()
        return
      }
      
      // Перезапускаем отсчет с текущего момента
      const resumeTime = Date.now()
      startTimeRef.current = resumeTime
      
      const remaining = currentDuration - currentTotalElapsed
      if (remaining > 0) {
        // Очищаем старый таймер, если он есть
        if (timerRef.current) {
          clearTimeout(timerRef.current)
        }
        timerRef.current = setTimeout(() => {
          if (!isPausedRef.current && isMountedRef.current) {
            onCloseRef.current()
          }
        }, remaining)
      } else {
        onCloseRef.current()
      }
    }
  }, [isPaused])

  const handleMouseEnter = (e) => {
    e.stopPropagation()
    setIsPaused(true)
  }

  const handleMouseLeave = (e) => {
    e.stopPropagation()
    setIsPaused(false)
  }

  const handleClose = () => {
    if (isMountedRef.current) {
      onCloseRef.current()
    }
  }

  return (
    <div 
      className={`toast toast-${type}`} 
      onClick={handleClose}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="toast-content">
        <span className="toast-icon">
          {type === 'success' && '✓'}
          {type === 'error' && '✕'}
          {type === 'warning' && '⚠'}
          {type === 'info' && 'ℹ'}
        </span>
        <span className="toast-message">{message}</span>
      </div>
      <button className="toast-close" onClick={handleClose}>×</button>
      <div className="toast-progress-container">
        <div 
          className={`toast-progress ${isPaused ? 'paused' : ''}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

export default Toast
