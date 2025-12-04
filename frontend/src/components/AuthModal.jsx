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

        // После регистрации автоматически входим
        const loginParams = new URLSearchParams()
        loginParams.append('username', formData.email)
        loginParams.append('password', formData.password)
        
        const loginResponse = await apiClient.post('/auth/login', loginParams, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })

        saveUserToken(loginResponse.data.access_token)
        saveUserData(loginResponse.data.user)
        onLogin(loginResponse.data.user)
        onClose()
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка при выполнении операции')
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
