import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../api/client'
import { useNotification } from '../contexts/NotificationContext'
import { getUser } from '../utils/storage'
import './AdminPanel.css'

function AdminPanel() {
  const { showNotification } = useNotification()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState(null)
  const [subscriptionConfigs, setSubscriptionConfigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState(null)
  const [isChangingSubscription, setIsChangingSubscription] = useState(false)
  const [activeSection, setActiveSection] = useState('users') // 'users' or 'subscriptions'
  const [editingConfig, setEditingConfig] = useState(null)

  useEffect(() => {
    const user = getUser()
    if (!user || !user.is_admin) {
      showNotification('Доступ запрещен. Требуются права администратора.', 'error')
      navigate('/')
      return
    }

    loadData()
  }, [navigate])

  const loadData = async () => {
    try {
      setLoading(true)
      const [usersRes, statsRes, configsRes] = await Promise.all([
        apiClient.get('/admin/users'),
        apiClient.get('/admin/stats'),
        apiClient.get('/admin/subscription-configs')
      ])
      setUsers(usersRes.data)
      setStats(statsRes.data)
      setSubscriptionConfigs(configsRes.data)
    } catch (err) {
      showNotification('Ошибка загрузки данных: ' + (err.response?.data?.detail || err.message), 'error')
      if (err.response?.status === 403) {
        navigate('/')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleChangeSubscription = async (userId, newSubscription) => {
    try {
      setIsChangingSubscription(true)
      await apiClient.put(`/admin/users/${userId}/subscription`, {
        subscription_type: newSubscription
      })
      showNotification('Подписка обновлена!', 'success')
      loadData()
      setSelectedUser(null)
    } catch (err) {
      showNotification('Ошибка: ' + (err.response?.data?.detail || err.message), 'error')
    } finally {
      setIsChangingSubscription(false)
    }
  }

  const handleToggleActive = async (userId, isActive) => {
    try {
      await apiClient.put(`/admin/users/${userId}/activate?is_active=${!isActive}`)
      showNotification(`Пользователь ${!isActive ? 'активирован' : 'деактивирован'}!`, 'success')
      loadData()
    } catch (err) {
      showNotification('Ошибка: ' + (err.response?.data?.detail || err.message), 'error')
    }
  }

  const handleUpdateConfig = async (configId, updates) => {
    try {
      await apiClient.put(`/admin/subscription-configs/${configId}`, updates)
      showNotification('Конфигурация обновлена!', 'success')
      loadData()
      setEditingConfig(null)
    } catch (err) {
      showNotification('Ошибка: ' + (err.response?.data?.detail || err.message), 'error')
    }
  }

  const handleCreateConfig = async (newConfig) => {
    try {
      await apiClient.post('/admin/subscription-configs', newConfig)
      showNotification('Конфигурация создана!', 'success')
      loadData()
    } catch (err) {
      showNotification('Ошибка: ' + (err.response?.data?.detail || err.message), 'error')
    }
  }

  const handleDeleteConfig = async (configId) => {
    if (!confirm('Удалить эту конфигурацию подписки?')) return
    
    try {
      await apiClient.delete(`/admin/subscription-configs/${configId}`)
      showNotification('Конфигурация удалена!', 'success')
      loadData()
    } catch (err) {
      showNotification('Ошибка: ' + (err.response?.data?.detail || err.message), 'error')
    }
  }

  if (loading) {
    return (
      <div className="admin-panel">
        <div className="loading">Загрузка...</div>
      </div>
    )
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h1>Панель администратора</h1>
        <button className="back-btn" onClick={() => navigate('/')}>
          Вернуться на главную
        </button>
      </div>

      <div className="admin-tabs">
        <button 
          className={activeSection === 'users' ? 'active' : ''}
          onClick={() => setActiveSection('users')}
        >
          👥 Пользователи
        </button>
        <button 
          className={activeSection === 'subscriptions' ? 'active' : ''}
          onClick={() => setActiveSection('subscriptions')}
        >
          💎 Подписки
        </button>
      </div>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <h3>Всего пользователей</h3>
            <div className="stat-value">{stats.total_users}</div>
            <div className="stat-details">
              Активных: {stats.active_users} | Неактивных: {stats.inactive_users}
            </div>
          </div>
          <div className="stat-card">
            <h3>Проекты</h3>
            <div className="stat-value">{stats.total_projects}</div>
          </div>
          <div className="stat-card">
            <h3>Файлы</h3>
            <div className="stat-value">{stats.total_files}</div>
          </div>
          <div className="stat-card">
            <h3>Диаграммы</h3>
            <div className="stat-value">{stats.total_diagrams}</div>
          </div>
        </div>
      )}

      {stats && (
        <div className="subscriptions-overview">
          <h3>Распределение подписок</h3>
          <div className="subs-grid">
            <div className="sub-item">
              <span className="sub-label">Basic:</span>
              <span className="sub-count">{stats.subscriptions.basic || 0}</span>
            </div>
            <div className="sub-item">
              <span className="sub-label">Premium:</span>
              <span className="sub-count">{stats.subscriptions.premium || 0}</span>
            </div>
            <div className="sub-item">
              <span className="sub-label">Enterprise:</span>
              <span className="sub-count">{stats.subscriptions.enterprise || 0}</span>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'users' && (
      <div className="users-section">
        <h2>Пользователи ({users.length})</h2>
        <div className="users-table-container">
          <table className="users-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Email</th>
                <th>Имя</th>
                <th>Username</th>
                <th>Подписка</th>
                <th>Проекты</th>
                <th>Файлы</th>
                <th>Диаграммы</th>
                <th>Статус</th>
                <th>Админ</th>
                <th>Дата регистрации</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} className={!user.is_active ? 'inactive-user' : ''}>
                  <td>{user.id}</td>
                  <td>{user.email}</td>
                  <td>{user.first_name}</td>
                  <td>{user.username || '-'}</td>
                  <td>
                    <select
                      value={user.subscription_type}
                      onChange={(e) => handleChangeSubscription(user.id, e.target.value)}
                      disabled={isChangingSubscription}
                      className="subscription-select"
                    >
                      <option value="basic">Basic</option>
                      <option value="premium">Premium</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </td>
                  <td>{user.stats.projects_count}</td>
                  <td>{user.stats.files_count}</td>
                  <td>{user.stats.diagrams_count}</td>
                  <td>
                    <span className={`status-badge ${user.is_active ? 'active' : 'inactive'}`}>
                      {user.is_active ? 'Активен' : 'Неактивен'}
                    </span>
                  </td>
                  <td>
                    <span className={`admin-badge ${user.is_admin ? 'is-admin' : ''}`}>
                      {user.is_admin ? 'Да' : 'Нет'}
                    </span>
                  </td>
                  <td>{new Date(user.created_at).toLocaleDateString('ru-RU')}</td>
                  <td>
                    <button
                      className={`toggle-active-btn ${user.is_active ? 'deactivate' : 'activate'}`}
                      onClick={() => handleToggleActive(user.id, user.is_active)}
                    >
                      {user.is_active ? '🔒 Деактивировать' : '✓ Активировать'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {activeSection === 'subscriptions' && (
      <div className="subscriptions-section">
        <h2>Управление подписками</h2>
        
        <div className="configs-grid">
          {subscriptionConfigs.map(config => (
            <div key={config.id} className="config-card">
              <div className="config-header">
                <h3>{config.display_name}</h3>
                <span className="config-type">{config.subscription_type}</span>
              </div>
              
              {editingConfig?.id === config.id ? (
                <div className="config-edit">
                  <label>
                    Название:
                    <input 
                      type="text" 
                      value={editingConfig.display_name}
                      onChange={(e) => setEditingConfig({...editingConfig, display_name: e.target.value})}
                    />
                  </label>
                  
                  <label>
                    Макс. проектов (-1 = безлимит):
                    <input 
                      type="number" 
                      value={editingConfig.max_projects}
                      onChange={(e) => setEditingConfig({...editingConfig, max_projects: parseInt(e.target.value)})}
                    />
                  </label>
                  
                  <label>
                    Макс. файлов на проект (-1 = безлимит):
                    <input 
                      type="number" 
                      value={editingConfig.max_files_per_project}
                      onChange={(e) => setEditingConfig({...editingConfig, max_files_per_project: parseInt(e.target.value)})}
                    />
                  </label>
                  
                  <label>
                    Макс. диаграмм на проект (-1 = безлимит):
                    <input 
                      type="number" 
                      value={editingConfig.max_diagrams_per_project}
                      onChange={(e) => setEditingConfig({...editingConfig, max_diagrams_per_project: parseInt(e.target.value)})}
                    />
                  </label>
                  
                  <div className="config-actions">
                    <button 
                      className="primary"
                      onClick={() => handleUpdateConfig(config.id, {
                        display_name: editingConfig.display_name,
                        max_projects: editingConfig.max_projects,
                        max_files_per_project: editingConfig.max_files_per_project,
                        max_diagrams_per_project: editingConfig.max_diagrams_per_project
                      })}
                    >
                      💾 Сохранить
                    </button>
                    <button 
                      className="secondary"
                      onClick={() => setEditingConfig(null)}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <div className="config-info">
                  <div className="config-limits">
                    <div className="limit-item">
                      <span className="limit-label">Проекты:</span>
                      <span className="limit-value">{config.max_projects === -1 ? '∞' : config.max_projects}</span>
                    </div>
                    <div className="limit-item">
                      <span className="limit-label">Файлов/проект:</span>
                      <span className="limit-value">{config.max_files_per_project === -1 ? '∞' : config.max_files_per_project}</span>
                    </div>
                    <div className="limit-item">
                      <span className="limit-label">Диаграмм/проект:</span>
                      <span className="limit-value">{config.max_diagrams_per_project === -1 ? '∞' : config.max_diagrams_per_project}</span>
                    </div>
                  </div>
                  
                  <div className="config-actions">
                    <button 
                      className="primary"
                      onClick={() => setEditingConfig({...config})}
                    >
                      ✏️ Редактировать
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  )
}

export default AdminPanel
