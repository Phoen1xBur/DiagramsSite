import React, { useState, useRef } from 'react'
import apiClient from '../api/client'
import './FileTab.css'

function FileTab({ onFileLoaded, currentData, columns, fileId, onFileLoadedCallback, projectId }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleFileUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      
      // Если указан projectId, добавляем его в запрос
      const url = projectId 
        ? `/files/upload?project_id=${projectId}`
        : '/files/upload'

      const response = await apiClient.post(url, formData)

      onFileLoaded(response.data.data, response.data.columns, response.data.id)
      if (onFileLoadedCallback) {
        onFileLoadedCallback()
      }
      alert('Файл успешно загружен и сохранен!')
    } catch (err) {
      setError(err.response?.data?.detail || 'Ошибка загрузки файла')
      alert('Ошибка загрузки файла: ' + (err.response?.data?.detail || err.message))
    } finally {
      setLoading(false)
      event.target.value = '' // Сброс input
    }
  }

  const handleCreateNewTable = () => {
    const cols = prompt('Введите названия столбцов через запятую:', 'Категория,Подкатегория,Значение')
    if (!cols) return

    const columnNames = cols.split(',').map(c => c.trim()).filter(c => c)
    if (columnNames.length === 0) {
      alert('Нужно указать хотя бы один столбец!')
      return
    }

    const data = []
    for (let i = 0; i < 5; i++) {
      const row = {}
      columnNames.forEach(col => row[col] = '')
      data.push(row)
    }

    onFileLoaded(data, columnNames, null)
    if (onFileLoadedCallback) {
      onFileLoadedCallback()
    }
  }

  const handleExportToExcel = async () => {
    if (!currentData || currentData.length === 0) {
      alert('Нет данных для экспорта!')
      return
    }

    try {
      // Создаем CSV для экспорта (можно улучшить, используя библиотеку для Excel)
      const csvContent = [
        columns.join(','),
        ...currentData.map(row => 
          columns.map(col => {
            const value = row[col] || ''
            // Экранируем запятые и кавычки
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
              return `"${value.replace(/"/g, '""')}"`
            }
            return value
          }).join(',')
        )
      ].join('\n')

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', 'data.csv')
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      alert('Данные экспортированы!')
    } catch (err) {
      alert('Ошибка экспорта: ' + err.message)
    }
  }

  const fileInputRef = useRef(null)

  const handleButtonClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  return (
    <div className="file-tab">
      <div className="controls">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileUpload}
          disabled={loading}
          style={{ display: 'none' }}
        />
        <button 
          type="button" 
          className="primary" 
          disabled={loading}
          onClick={handleButtonClick}
        >
          {loading ? 'Загрузка...' : 'Загрузить Excel/CSV'}
        </button>

        {currentData && (
          <>
            <button type="button" onClick={handleExportToExcel} className="primary">
              💾 Экспорт в Excel
            </button>
            <button type="button" onClick={handleCreateNewTable}>
              ➕ Создать новую таблицу
            </button>
          </>
        )}

        {!currentData && (
          <button type="button" onClick={handleCreateNewTable}>
            ➕ Создать новую таблицу
          </button>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {currentData && (
        <div className="file-info">
          <p>Загружено строк: {currentData.length}</p>
          <p>Столбцов: {columns.length}</p>
          {fileId && <p>ID файла: {fileId}</p>}
        </div>
      )}
    </div>
  )
}

export default FileTab

