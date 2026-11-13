import React, { useState, useEffect } from 'react'
import apiClient from '../api/client'
import { saveUserToken, saveUserData } from '../utils/storage'
import { useModalDialog } from '../hooks/useModalDialog'
import './AuthModal.css'

function AuthModal({ isOpen, onClose, onLogin }) {
  const [isLogin, setIsLogin] = useState(true)
  const [formData, setFormData] = useState({
    email: '',
    first_name: '',
    password: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const dialogRef = useModalDialog({ isOpen, onClose, closeDisabled: loading })

  // Сбрасываем форму при открытии модального окна
  useEffect(() => {
    if (isOpen) {
      setFormData({
        email: '',
        first_name: '',
        password: ''
      })
      setError('')
      setLoading(false)
      setIsLogin(true)
    }
  }, [isOpen])
  
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isLogin) {
        // Вход - OAuth2 требует URLSearchParams
        // Используем email как username для входа
        if (!formData.email) {
          setError('Введите email')
          setLoading(false)
          return
        }
        
        const params = new URLSearchParams()
        params.append('username', formData.email)  // Может быть email или username
        params.append('password', formData.password)
        
        const response = await apiClient.post('/auth/login', params, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })

        saveUserToken(response.data.access_token)
        saveUserData(response.data.user)
        onLogin(response.data.user)
        onClose()
      } else {
        // Регистрация
        const response = await apiClient.post('/auth/register', {
          email: formData.email,
          first_name: formData.first_name,
          password: formData.password
        })

        if (!response.data) {
          setError('Ошибка регистрации: не получены данные пользователя')
          setLoading(false)
          return
        }

        // После регистрации автоматически входим
        // Используем email или username из ответа регистрации для входа
        const loginIdentifier = response.data.username || formData.email
        const loginParams = new URLSearchParams()
        loginParams.append('username', loginIdentifier)
        loginParams.append('password', formData.password)
        
        try {
          const loginResponse = await apiClient.post('/auth/login', loginParams, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          })

          if (!loginResponse.data || !loginResponse.data.access_token || !loginResponse.data.user) {
            setError('Ошибка входа после регистрации: не получены данные')
            setLoading(false)
            return
          }

          saveUserToken(loginResponse.data.access_token)
          saveUserData(loginResponse.data.user)
          
          // Создаем проект по умолчанию для нового пользователя
          try {
            await apiClient.post('/projects/', {
              name: 'Мой первый проект',
              description: 'Проект создан автоматически при регистрации'
            })
          } catch (projectErr) {
            console.error('Ошибка создания проекта по умолчанию:', projectErr)
            // Не критично, продолжаем
          }
          
          // Вызываем onLogin с обработкой ошибок
          try {
            await onLogin(loginResponse.data.user)
            onClose()
          } catch (loginCallbackErr) {
            console.error('Ошибка в onLogin callback:', loginCallbackErr)
            setError('Ошибка при входе. Попробуйте войти вручную.')
            setLoading(false)
            // Не закрываем модальное окно
          }
        } catch (loginErr) {
          // Если автоматический вход не удался, показываем ошибку
          let loginErrorMessage = 'Ошибка автоматического входа после регистрации. Попробуйте войти вручную.'
          if (loginErr.response?.data?.detail) {
            if (Array.isArray(loginErr.response.data.detail)) {
              loginErrorMessage = loginErr.response.data.detail.map((e) => {
                if (typeof e === 'object' && e.msg) {
                  return `${e.loc?.join('.') || ''}: ${e.msg}`
                }
                return String(e)
              }).join(', ')
            } else {
              loginErrorMessage = String(loginErr.response.data.detail)
            }
          }
          setError(loginErrorMessage)
          setLoading(false)
          // Не закрываем модальное окно, чтобы пользователь мог попробовать войти вручную
        }
      }
    } catch (err) {
      // Используем userMessage из interceptor если есть, иначе обрабатываем вручную
      let errorMessage = err.userMessage || 'Ошибка при выполнении операции'
      
      if (!err.userMessage && err.response) {
        // Ошибка от сервера
        const status = err.response.status
        const data = err.response.data
        
        if (status === 422 || status === 400) {
          // Ошибка валидации
          if (data.detail) {
            // Pydantic может вернуть detail как строку или массив
            if (Array.isArray(data.detail)) {
              // Если это массив ошибок валидации
              errorMessage = data.detail.map((e) => {
                if (typeof e === 'object' && e.msg) {
                  return `${e.loc?.join('.') || ''}: ${e.msg}`
                }
                return String(e)
              }).join(', ')
            } else {
              errorMessage = String(data.detail)
            }
          } else if (data.message) {
            errorMessage = String(data.message)
          }
        } else if (status === 401) {
          errorMessage = data.detail || 'Неверный email/логин или пароль'
        } else if (status === 404) {
          // 404 на auth endpoints - неправильный логин/пароль
          errorMessage = 'Неверный email/логин или пароль'
        } else if (status >= 500 && status < 600) {
          errorMessage = 'Проблема на стороне сервера. Попробуйте позже.'
        } else {
          errorMessage = data.detail || `Ошибка ${status}`
        }
      } else if (!err.userMessage && err.message) {
        errorMessage = err.message
      }
      
      setError(errorMessage)
      console.error('Ошибка в AuthModal:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="app-dialog-overlay auth-modal-overlay">
      <div className="auth-modal">
        <button 
          type="button"
          className="auth-modal-close" 
          onClick={onClose}
          disabled={loading}
          style={{ opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          ×
        </button>
        <h2>{isLogin ? 'Вход' : 'Регистрация'}</h2>
        
        {error && (
          <div id="auth-error" className="auth-error" role="alert" aria-live="assertive">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="auth-email">Email:</label>
            <input
              id="auth-email"
              name="email"
              type="email"
              autoComplete="username"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              disabled={loading}
              placeholder="Введите email"
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? 'auth-error' : undefined}
            />
          </div>
          
          {!isLogin && (
            <div className="form-group">
              <label htmlFor="auth-first-name">Имя:</label>
              <input
                id="auth-first-name"
                name="first_name"
                type="text"
                autoComplete="given-name"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                required
                disabled={loading}
                placeholder="Артём"
              />
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="auth-password">Пароль:</label>
            <input
              id="auth-password"
              name="password"
              type="password"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              disabled={loading}
              aria-invalid={error ? 'true' : undefined}
            />
          </div>
          
          <button type="submit" className="primary" disabled={loading}>
            {loading ? 'Загрузка...' : (isLogin ? 'Войти' : 'Зарегистрироваться')}
          </button>
        </form>
        
        <p className="auth-switch">
          {isLogin ? (
            <>Нет аккаунта? <button type="button" onClick={() => setIsLogin(false)}>Зарегистрироваться</button></>
          ) : (
            <>Уже есть аккаунт? <button type="button" onClick={() => setIsLogin(true)}>Войти</button></>
          )}
        </p>
      </div>
    </dialog>
  )
}

export default AuthModal
