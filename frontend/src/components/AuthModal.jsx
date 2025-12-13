import React, { useState } from 'react'
import apiClient from '../api/client'
import { saveUserToken, saveUserData } from '../utils/storage'
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
      // Обрабатываем различные типы ошибок
      let errorMessage = 'Ошибка при выполнении операции'
      
      if (err.response) {
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
        } else {
          errorMessage = data.detail || `Ошибка ${status}`
        }
      } else if (err.message) {
        errorMessage = err.message
      }
      
      setError(errorMessage)
      console.error('Ошибка в AuthModal:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-modal-close" onClick={onClose}>×</button>
        <h2>{isLogin ? 'Вход' : 'Регистрация'}</h2>
        
        {error && <div className="auth-error">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email:</label>
            <input
              name="email"
              type={isLogin ? 'text' : 'email'}
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              disabled={loading}
              placeholder="Введите email"
            />
          </div>
          
          {!isLogin && (
            <div className="form-group">
              <label>Имя:</label>
              <input
                name="first_name"
                type="text"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                required
                disabled={loading}
                placeholder="Артём"
              />
            </div>
          )}
          
          <div className="form-group">
            <label>Пароль:</label>
            <input
              name="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              disabled={loading}
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
    </div>
  )
}

export default AuthModal
