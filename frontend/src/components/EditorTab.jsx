import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import apiClient from '../api/client'
import { useNotification } from '../contexts/NotificationContext'
import AddColumnModal from './AddColumnModal'
import './EditorTab.css'

function EditorTab({ data, columns, onDataUpdated, onExportCurrentFile, fileId, user, onFileSaved, onFileIdUpdate, projectId, fileName, onFileNameChange, onColumnsUpdated, isModified: externalIsModified, onModifiedChange }) {
  const { showNotification } = useNotification()
  const [localData, setLocalData] = useState(data || [])
  const [localColumns, setLocalColumns] = useState(columns || [])
  const [hoveredColumn, setHoveredColumn] = useState(null)
  const [hoveredRow, setHoveredRow] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isModified, setIsModified] = useState(externalIsModified || false)
  const [editingColumn, setEditingColumn] = useState(null)
  const [editColumnValue, setEditColumnValue] = useState('')
  const [showAddColumnModal, setShowAddColumnModal] = useState(false)
  const [currentFileName, setCurrentFileName] = useState(fileName || '')
  const [editingFileName, setEditingFileName] = useState(false)
  const isInitialMount = useRef(true)
  const tableWrapperRef = useRef(null)
  const [rowMenu, setRowMenu] = useState({ isOpen: false, rowIdx: null, x: 0, y: 0 })
  const rowMenuRef = useRef(null)
  const [columnWidths, setColumnWidths] = useState({})
  const [rowHeights, setRowHeights] = useState({})
  const [columnHeaderHeights, setColumnHeaderHeights] = useState({})
  const [globalHeaderHeight, setGlobalHeaderHeight] = useState(75) // Общая высота для всех заголовков
  const [resizingColumn, setResizingColumn] = useState(null)
  const [resizingRow, setResizingRow] = useState(null)
  const [resizingColumnHeader, setResizingColumnHeader] = useState(null)
  const [resizingGlobalHeader, setResizingGlobalHeader] = useState(false)
  const [resizeStartX, setResizeStartX] = useState(0)
  const [resizeStartY, setResizeStartY] = useState(0)
  const [resizeStartWidth, setResizeStartWidth] = useState(0)
  const [resizeStartHeight, setResizeStartHeight] = useState(0)
  const [resizeStartHeaderHeight, setResizeStartHeaderHeight] = useState(0)
  const [draggedColumn, setDraggedColumn] = useState(null)
  const [dragOverColumn, setDragOverColumn] = useState(null)
  const [autocomplete, setAutocomplete] = useState({ show: false, rowIdx: null, col: null, suggestions: [], selectedIndex: 0 })
  const [autocompletePosition, setAutocompletePosition] = useState(null)
  const autocompleteRef = useRef(null)
  const autocompleteRafRef = useRef(null)
  const cellRefs = useRef({})

  const prevFileIdRef = useRef(fileId)
  
  useEffect(() => {
    // Если fileId изменился, значит загружен новый файл - сбрасываем isModified
    if (prevFileIdRef.current !== fileId) {
      prevFileIdRef.current = fileId
      setLocalData(data || [])
      setLocalColumns(columns || [])
      setIsModified(false)
      if (onModifiedChange) onModifiedChange(false)
      // Сбрасываем ширины столбцов при загрузке нового файла
      setColumnWidths({})
    } else {
      setLocalData(data || [])
      setLocalColumns(columns || [])
    }
  }, [data, columns, fileId, onModifiedChange])

  // Синхронизируем внешнее состояние isModified
  useEffect(() => {
    if (externalIsModified !== undefined && externalIsModified !== isModified) {
      setIsModified(externalIsModified)
    }
  }, [externalIsModified])

  // Уведомляем родителя об изменении isModified
  useEffect(() => {
    if (onModifiedChange) {
      onModifiedChange(isModified)
    }
  }, [isModified, onModifiedChange])

  // Обработчики для изменения размера столбцов
  useEffect(() => {
    if (!resizingColumn) return

    const handleMouseMove = (e) => {
      const diff = e.clientX - resizeStartX
      const newWidth = Math.max(80, resizeStartWidth + diff) // Минимальная ширина 80px
      setColumnWidths(prev => ({
        ...prev,
        [resizingColumn]: newWidth
      }))
    }

    const handleMouseUp = () => {
      setResizingColumn(null)
      setResizeStartX(0)
      setResizeStartWidth(0)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingColumn, resizeStartX, resizeStartWidth])

  // Обработчики для изменения размера строк
  useEffect(() => {
    if (!resizingRow) return

    const handleMouseMove = (e) => {
      const diff = e.clientY - resizeStartY
      const newHeight = Math.max(40, resizeStartHeight + diff) // Минимальная высота 40px
      setRowHeights(prev => ({
        ...prev,
        [resizingRow]: newHeight
      }))
    }

    const handleMouseUp = () => {
      setResizingRow(null)
      setResizeStartY(0)
      setResizeStartHeight(0)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingRow, resizeStartY, resizeStartHeight])

  // Обработчики для изменения высоты заголовков столбцов (индивидуально)
  useEffect(() => {
    if (!resizingColumnHeader) return

    const handleMouseMove = (e) => {
      const diff = e.clientY - resizeStartY
      const newHeight = Math.max(25, resizeStartHeaderHeight + diff) // Минимальная высота 25px
      setColumnHeaderHeights(prev => ({
        ...prev,
        [resizingColumnHeader]: newHeight
      }))
    }

    const handleMouseUp = () => {
      setResizingColumnHeader(null)
      setResizeStartY(0)
      setResizeStartHeaderHeight(0)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingColumnHeader, resizeStartY, resizeStartHeaderHeight])

  // Обработчики для изменения высоты всех заголовков столбцов одновременно
  useEffect(() => {
    if (!resizingGlobalHeader) return

    const handleMouseMove = (e) => {
      const diff = e.clientY - resizeStartY
      const newHeight = Math.max(25, resizeStartHeaderHeight + diff) // Минимальная высота 25px
      setGlobalHeaderHeight(newHeight)
      // Обновляем все индивидуальные высоты
      setColumnHeaderHeights(prev => {
        const newHeights = {}
        localColumns.forEach(col => {
          newHeights[col] = newHeight
        })
        return newHeights
      })
    }

    const handleMouseUp = () => {
      setResizingGlobalHeader(false)
      setResizeStartY(0)
      setResizeStartHeaderHeight(0)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingGlobalHeader, resizeStartY, resizeStartHeaderHeight, localColumns])

  useEffect(() => {
    if (!rowMenu.isOpen) return

    const handleClickOutside = (event) => {
      // Проверяем, что клик произошел вне меню и вне кнопки, которая его открыла
      if (rowMenuRef.current && rowMenuRef.current.contains(event.target)) {
        return // Клик внутри меню - не закрываем
      }
      
      // Проверяем, что клик не по кнопке "3 точки"
      const clickedButton = event.target.closest('.row-actions-btn')
      if (clickedButton) {
        return // Клик по кнопке - не закрываем (кнопка сама откроет меню)
      }
      
      // Закрываем меню при клике вне его
      setRowMenu({ isOpen: false, rowIdx: null, x: 0, y: 0 })
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setRowMenu({ isOpen: false, rowIdx: null, x: 0, y: 0 })
      }
    }

    const handleScroll = () => {
      setRowMenu({ isOpen: false, rowIdx: null, x: 0, y: 0 })
    }

    // Используем capture phase для обработки кликов
    document.addEventListener('click', handleClickOutside, true)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('scroll', handleScroll, true)
    if (tableWrapperRef.current) {
      tableWrapperRef.current.addEventListener('scroll', handleScroll)
    }

    return () => {
      document.removeEventListener('click', handleClickOutside, true)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('scroll', handleScroll, true)
      if (tableWrapperRef.current) {
        tableWrapperRef.current.removeEventListener('scroll', handleScroll)
      }
    }
  }, [rowMenu.isOpen])

  const handleCellChange = (rowIdx, col, value) => {
    // Проверяем, действительно ли значение изменилось
    const currentValue = localData[rowIdx]?.[col] || ''
    if (currentValue === value) {
      return // Значение не изменилось, не обновляем состояние
    }
    
    const newData = [...localData]
    if (!newData[rowIdx]) {
      newData[rowIdx] = {}
    }
    newData[rowIdx][col] = value
    setLocalData(newData)
    setIsModified(true)
    if (onModifiedChange) onModifiedChange(true)
    onDataUpdated(newData)
  }

  const handleAddRow = () => {
    const row = {}
    localColumns.forEach(col => row[col] = '')
    const newData = [...localData, row]
    setLocalData(newData)
    setIsModified(true)
    if (onModifiedChange) onModifiedChange(true)
    onDataUpdated(newData)
  }

  const handleAddColumn = (colName) => {
    if (!colName || !colName.trim()) return

    // Проверяем уникальность названия
    if (localColumns.includes(colName.trim())) {
      showNotification('Столбец с таким названием уже существует', 'warning')
      return
    }

    const newColumns = [...localColumns, colName.trim()]
    const newData = localData.map(row => ({
      ...row,
      [colName.trim()]: ''
    }))

    setLocalColumns(newColumns)
    setLocalData(newData)
    setIsModified(true)
    if (onModifiedChange) onModifiedChange(true)
    onDataUpdated(newData)
    if (onColumnsUpdated) {
      onColumnsUpdated(newColumns)
    }
    showNotification(`Столбец "${colName.trim()}" добавлен!`, 'success')
  }

  const handleDeleteRow = (rowIdx) => {
    if (localData.length <= 1) return
    const newData = localData.filter((_, idx) => idx !== rowIdx)
    setLocalData(newData)
    setIsModified(true)
    if (onModifiedChange) onModifiedChange(true)
    onDataUpdated(newData)
  }

  const handleMoveRowUp = (rowIdx) => {
    if (rowIdx === 0) return
    const newData = [...localData]
    const temp = newData[rowIdx]
    newData[rowIdx] = newData[rowIdx - 1]
    newData[rowIdx - 1] = temp
    setLocalData(newData)
    setIsModified(true)
    if (onModifiedChange) onModifiedChange(true)
    onDataUpdated(newData)
  }

  const handleMoveRowDown = (rowIdx) => {
    if (rowIdx === localData.length - 1) return
    const newData = [...localData]
    const temp = newData[rowIdx]
    newData[rowIdx] = newData[rowIdx + 1]
    newData[rowIdx + 1] = temp
    setLocalData(newData)
    setIsModified(true)
    if (onModifiedChange) onModifiedChange(true)
    onDataUpdated(newData)
  }

  const handleDuplicateRow = (rowIdx) => {
    const newRow = { ...localData[rowIdx] }
    const newData = [
      ...localData.slice(0, rowIdx + 1),
      newRow,
      ...localData.slice(rowIdx + 1)
    ]
    setLocalData(newData)
    setIsModified(true)
    if (onModifiedChange) onModifiedChange(true)
    onDataUpdated(newData)
    showNotification('Строка скопирована!', 'success')
  }

  const openRowMenu = (rowIdx, clientX, clientY) => {
    if (!tableWrapperRef.current) return
    const wrapper = tableWrapperRef.current
    const rect = wrapper.getBoundingClientRect()
    
    // Вычисляем позицию кнопки относительно wrapper (с учетом scroll)
    const buttonX = clientX - rect.left + wrapper.scrollLeft
    const buttonY = clientY - rect.top + wrapper.scrollTop
    
    // Оценка размеров меню (примерно 200px ширина, ~150px высота)
    const menuWidth = 200
    const menuHeight = 150
    
    // Вычисляем доступное пространство в viewport
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    const spaceBelow = viewportHeight - clientY
    const spaceAbove = clientY - rect.top
    const spaceRight = rect.right - clientX
    const spaceLeft = clientX - rect.left
    
    // Определяем вертикальную позицию с более строгой проверкой
    let finalY = buttonY
    const menuHeightWithPadding = menuHeight + 20 // Добавляем отступ для безопасности
    
    // Проверяем, поместится ли меню снизу в видимой области
    const visibleSpaceBelow = (rect.bottom - clientY) + (wrapper.scrollHeight - wrapper.scrollTop - wrapper.clientHeight)
    const visibleSpaceAbove = (clientY - rect.top) + wrapper.scrollTop
    
    if (visibleSpaceBelow < menuHeightWithPadding && visibleSpaceAbove >= menuHeightWithPadding) {
      // Размещаем выше кнопки
      finalY = buttonY - menuHeight - 10
    } else if (visibleSpaceBelow < menuHeightWithPadding && visibleSpaceAbove < menuHeightWithPadding) {
      // Если места мало везде - размещаем там, где больше
      if (visibleSpaceAbove > visibleSpaceBelow) {
        finalY = buttonY - menuHeight - 10
      } else {
        // Размещаем снизу, но ограничиваем видимой областью wrapper
        finalY = Math.min(buttonY + 10, wrapper.scrollTop + wrapper.clientHeight - menuHeight - 10)
      }
    } else {
      // Размещаем снизу с небольшим отступом, но проверяем что все кнопки будут видны
      const proposedY = buttonY + 10
      // Проверяем, что меню не выйдет за нижнюю границу видимой области
      if (proposedY + menuHeight > wrapper.scrollTop + wrapper.clientHeight) {
        // Если не помещается снизу, размещаем выше
        finalY = buttonY - menuHeight - 10
      } else {
        finalY = proposedY
      }
    }
    
    // Убеждаемся, что меню не выходит за верхнюю границу wrapper
    finalY = Math.max(wrapper.scrollTop, finalY)
    
    // Определяем горизонтальную позицию
    let finalX = buttonX
    if (spaceRight < menuWidth && spaceLeft >= menuWidth) {
      // Размещаем слева от кнопки
      finalX = buttonX - menuWidth - 10
    } else if (spaceRight < menuWidth) {
      // Прижимаем к правому краю видимой области wrapper
      finalX = wrapper.scrollLeft + wrapper.clientWidth - menuWidth - 10
    } else {
      // Размещаем справа от кнопки
      finalX = buttonX + 10
    }
    
    // Убеждаемся, что меню не выходит за левую границу wrapper
    finalX = Math.max(wrapper.scrollLeft, finalX)

    setRowMenu({ isOpen: true, rowIdx, x: finalX, y: finalY })
  }

  // Получить уникальные значения для столбца (для автозаполнения)
  const getUniqueValuesForColumn = (colName) => {
    if (!Array.isArray(localData) || localData.length === 0) {
      return []
    }
    const values = new Set()
    localData.forEach(row => {
      if (row && row[colName] && typeof row[colName] === 'string' && row[colName].trim()) {
        values.add(row[colName].trim())
      }
    })
    
    // Возвращаем ВСЕ уникальные значения, отсортированные
    return Array.from(values).sort()
  }

  // Обработка ввода в textarea с автозаполнением
  const handleTextareaChange = (rowIdx, col, value) => {
    // Обновляем данные ячейки
    const currentValue = localData[rowIdx]?.[col] || ''
    if (currentValue !== value) {
      handleCellChange(rowIdx, col, value)
    }
    
    // Получаем уникальные значения из ВСЕХ строк столбца (используем getUniqueValuesForColumn)
    // Это гарантирует, что мы получим все существующие значения, даже если текущая ячейка пустая
    let uniqueValues = getUniqueValuesForColumn(col)
    
    // Если в столбце нет данных, но мы вводим текст - добавляем его во временные данные для фильтрации
    if (uniqueValues.length === 0 && value && value.trim()) {
      // Создаем временную копию для получения уникальных значений включая текущий ввод
      const tempData = [...localData]
      if (!tempData[rowIdx]) {
        tempData[rowIdx] = {}
      }
      tempData[rowIdx] = { ...tempData[rowIdx], [col]: value }
      
      const values = new Set()
      tempData.forEach(row => {
        if (row && row[col] && typeof row[col] === 'string' && row[col].trim()) {
          values.add(row[col].trim())
        }
      })
      uniqueValues = Array.from(values).sort()
    }
    
    // Если нет уникальных значений, скрываем автозаполнение
    if (uniqueValues.length === 0) {
      setAutocomplete({ show: false, rowIdx: null, col: null, suggestions: [], selectedIndex: 0 })
      return
    }
    
    // Фильтруем подсказки по введенному тексту (как SQL LIKE '%текст%')
    let filtered = uniqueValues
    if (value && value.trim()) {
      const searchText = value.trim().toLowerCase()
      
      filtered = uniqueValues.filter(v => {
        // Исключаем точное совпадение
        if (v === value) return false
        
        // Простая проверка вхождения подстроки (без учета регистра)
        return v.toLowerCase().includes(searchText)
      })
    }
    
    // Всегда показываем подсказки если есть уникальные значения
    // Если поле пустое - показываем все, если есть текст - показываем отфильтрованные (или все если ничего не найдено)
    const suggestionsToShow = (value && value.trim() && filtered.length > 0) ? filtered : uniqueValues
    
    // Обновляем состояние автозаполнения
    setAutocomplete({
      show: true,
      rowIdx,
      col,
      suggestions: suggestionsToShow,
      selectedIndex: 0
    })
  }

  // Выбор подсказки из автозаполнения
  const selectAutocompleteSuggestion = (suggestion) => {
    if (autocomplete.rowIdx !== null && autocomplete.col !== null) {
      handleCellChange(autocomplete.rowIdx, autocomplete.col, suggestion)
      setAutocomplete({ show: false, rowIdx: null, col: null, suggestions: [], selectedIndex: 0 })
    }
  }

  // Обработка клавиатуры для автозаполнения
  const handleTextareaKeyDown = (e, rowIdx, col) => {
    if (autocomplete.show && autocomplete.rowIdx === rowIdx && autocomplete.col === col) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setAutocomplete(prev => ({
          ...prev,
          selectedIndex: Math.min(prev.selectedIndex + 1, prev.suggestions.length - 1)
        }))
        return
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setAutocomplete(prev => ({
          ...prev,
          selectedIndex: Math.max(prev.selectedIndex - 1, 0)
        }))
        return
      } else if (e.key === 'Enter' && !e.shiftKey && autocomplete.suggestions[autocomplete.selectedIndex]) {
        e.preventDefault()
        selectAutocompleteSuggestion(autocomplete.suggestions[autocomplete.selectedIndex])
        return
      } else if (e.key === 'Escape') {
        setAutocomplete({ show: false, rowIdx: null, col: null, suggestions: [], selectedIndex: 0 })
        return
      }
    }
  }

  // Закрытие автозаполнения при клике вне
  useEffect(() => {
    if (!autocomplete.show) return

    const handleClickOutside = (event) => {
      // Проверяем, что клик не по textarea и не по выпадающему списку
      const cellKey = `${autocomplete.rowIdx}-${autocomplete.col}`
      const cell = cellRefs.current[cellKey]
      const isClickInCell = cell && cell.contains(event.target)
      const isClickInDropdown = autocompleteRef.current && autocompleteRef.current.contains(event.target)
      
      // Проверяем, не кликнули ли на другую ячейку (textarea в другой ячейке)
      const clickedTextarea = event.target.closest('textarea')
      const isClickInAnotherCell = clickedTextarea && clickedTextarea !== cell?.querySelector('textarea')
      
      if (!isClickInCell && !isClickInDropdown && !isClickInAnotherCell) {
        // Закрываем только если клик действительно вне всех ячеек
        setAutocomplete({ show: false, rowIdx: null, col: null, suggestions: [], selectedIndex: 0 })
      }
    }

    // Используем capture phase для раннего перехвата, но с небольшой задержкой
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true)
    }, 100)
    
    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [autocomplete.show, autocomplete.rowIdx, autocomplete.col])

  const calculateAutocompletePosition = () => {
    if (!autocomplete.show || autocomplete.rowIdx === null || autocomplete.col === null) {
      return null
    }
    const cellKey = `${autocomplete.rowIdx}-${autocomplete.col}`
    const cell = cellRefs.current[cellKey]
    if (!cell) {
      return null
    }

    const rect = cell.getBoundingClientRect()
    const wrapperRect = tableWrapperRef.current?.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    const margin = 6

    const isVisibleInViewport = rect.bottom > 0 && rect.top < viewportHeight && rect.right > 0 && rect.left < viewportWidth
    const isVisibleInWrapper = wrapperRect ? rect.bottom > wrapperRect.top && rect.top < wrapperRect.bottom : true
    if (!isVisibleInViewport || !isVisibleInWrapper) {
      return null
    }

    let spaceBelow = viewportHeight - rect.bottom - margin
    if (wrapperRect) {
      spaceBelow = Math.min(spaceBelow, wrapperRect.bottom - rect.bottom - margin)
    }
    spaceBelow = Math.max(0, spaceBelow)

    let spaceAbove = rect.top - margin
    if (wrapperRect) {
      spaceAbove = Math.min(spaceAbove, rect.top - wrapperRect.top - margin)
    }
    spaceAbove = Math.max(0, spaceAbove)

    const dropdownHeight = 280
    const positionAbove = spaceBelow < dropdownHeight && spaceAbove >= dropdownHeight

    let top = positionAbove ? rect.top - dropdownHeight - 2 : rect.bottom + 2
    top = Math.max(margin, Math.min(top, viewportHeight - dropdownHeight - margin))

    const maxWidth = Math.max(0, viewportWidth - margin * 2)
    let width = Math.min(rect.width * 2, maxWidth)
    let left = rect.left

    if (left + width > viewportWidth - margin) {
      left = Math.max(margin, viewportWidth - width - margin)
    }
    if (left < margin) {
      left = margin
      width = Math.min(width, viewportWidth - margin * 2)
    }

    return {
      top,
      left,
      width,
      height: dropdownHeight
    }
  }

  useEffect(() => {
    if (!autocomplete.show) {
      setAutocompletePosition(null)
      return
    }

    const scheduleUpdate = () => {
      if (autocompleteRafRef.current) {
        cancelAnimationFrame(autocompleteRafRef.current)
      }
      autocompleteRafRef.current = requestAnimationFrame(() => {
        setAutocompletePosition(calculateAutocompletePosition())
      })
    }

    scheduleUpdate()

    const handlePositionChange = () => {
      scheduleUpdate()
    }

    window.addEventListener('resize', handlePositionChange)
    window.addEventListener('scroll', handlePositionChange, true)
    if (tableWrapperRef.current) {
      tableWrapperRef.current.addEventListener('scroll', handlePositionChange)
    }

    return () => {
      if (autocompleteRafRef.current) {
        cancelAnimationFrame(autocompleteRafRef.current)
        autocompleteRafRef.current = null
      }
      window.removeEventListener('resize', handlePositionChange)
      window.removeEventListener('scroll', handlePositionChange, true)
      if (tableWrapperRef.current) {
        tableWrapperRef.current.removeEventListener('scroll', handlePositionChange)
      }
    }
  }, [autocomplete.show, autocomplete.rowIdx, autocomplete.col, autocomplete.suggestions.length])


  const handleDeleteColumn = (colName) => {
    if (localColumns.length <= 2) {
      showNotification('В таблице должно быть минимум 2 столбца', 'warning')
      return
    }
    const newColumns = localColumns.filter(c => c !== colName)
    const newData = localData.map(row => {
      const newRow = { ...row }
      delete newRow[colName]
      return newRow
    })

    setLocalColumns(newColumns)
    setLocalData(newData)
    setIsModified(true)
    if (onModifiedChange) onModifiedChange(true)
    onDataUpdated(newData)
    if (onColumnsUpdated) {
      onColumnsUpdated(newColumns)
    }
  }

  const handleColumnNameEdit = (oldName, newName) => {
    if (!newName || !newName.trim() || newName === oldName) {
      return
    }
    // Каноническое имя не меняем — диаграммы остаются привязаны к старому имени
    const newColumns = localColumns.map(col => col === oldName ? newName.trim() : col)
    const newData = localData.map(row => {
      const newRow = { ...row }
      if (oldName in newRow) {
        newRow[newName.trim()] = newRow[oldName]
        delete newRow[oldName]
      }
      return newRow
    })

    setLocalColumns(newColumns)
    setLocalData(newData)
    setIsModified(true)
    if (onModifiedChange) onModifiedChange(true)
    onDataUpdated(newData)
    if (onColumnsUpdated) {
      onColumnsUpdated(newColumns)
    }
  }

  const handleColumnNameDoubleClick = (colName) => {
    setEditingColumn(colName)
    setEditColumnValue(colName)
  }

  const handleColumnNameBlur = (oldName) => {
    if (editColumnValue.trim() && editColumnValue.trim() !== oldName) {
      handleColumnNameEdit(oldName, editColumnValue.trim())
    }
    setEditingColumn(null)
  }

  const handleColumnNameKeyDown = (e, oldName) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleColumnNameBlur(oldName)
    } else if (e.key === 'Escape') {
      setEditingColumn(null)
    }
  }

  const handleResizeStart = (colName, e) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingColumn(colName)
    setResizeStartX(e.clientX)
    setResizeStartWidth(columnWidths[colName] || 120)
  }

  const getColumnWidth = (colName) => {
    return columnWidths[colName] || 120 // Дефолтная ширина 120px
  }

  const getRowHeight = (rowIdx) => {
    return rowHeights[rowIdx] || 50 // Дефолтная высота 50px
  }

  const getColumnHeaderHeight = (colName) => {
    // Если есть индивидуальная высота для столбца, используем её, иначе общую
    return columnHeaderHeights[colName] || globalHeaderHeight
  }

  const handleResizeGlobalHeaderStart = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingGlobalHeader(true)
    setResizeStartY(e.clientY)
    setResizeStartHeaderHeight(globalHeaderHeight)
  }

  const handleResizeRowStart = (rowIdx, e) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingRow(rowIdx)
    setResizeStartY(e.clientY)
    setResizeStartHeight(rowHeights[rowIdx] || 50)
  }

  const handleResizeColumnHeaderStart = (colName, e) => {
    e.preventDefault()
    e.stopPropagation()
    setResizingColumnHeader(colName)
    setResizeStartY(e.clientY)
    setResizeStartHeaderHeight(columnHeaderHeights[colName] || 75)
  }

  const handleColumnDragStart = (e, colName) => {
    setDraggedColumn(colName)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', colName)
  }

  const handleColumnDragOver = (e, colName) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedColumn && draggedColumn !== colName) {
      setDragOverColumn(colName)
    }
  }

  const handleColumnDrop = (e, targetColName) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedColumn && draggedColumn !== targetColName) {
      const newColumns = [...localColumns]
      const draggedIndex = newColumns.indexOf(draggedColumn)
      const targetIndex = newColumns.indexOf(targetColName)
      if (draggedIndex >= 0 && targetIndex >= 0) {
        newColumns.splice(draggedIndex, 1)
        newColumns.splice(targetIndex, 0, draggedColumn)
        setLocalColumns(newColumns)
        setIsModified(true)
        if (onModifiedChange) onModifiedChange(true)
        if (onColumnsUpdated) onColumnsUpdated(newColumns)
      }
    }
    setDraggedColumn(null)
    setDragOverColumn(null)
  }

  const handleColumnDragEnd = () => {
    setDraggedColumn(null)
    setDragOverColumn(null)
  }

  const handleSave = async () => {
    if (!user) {
      showNotification('Для сохранения необходимо быть авторизованным пользователем', 'warning')
      return
    }

    setIsSaving(true)
    try {
      let savedFileId = fileId
      
      if (!fileId) {
        // Создаем новый файл - создаем временный CSV файл и загружаем его
        const csvContent = [
          localColumns.join(','),
          ...localData.map(row =>
            localColumns.map(col => {
              const raw = row[col]
              const value = raw === null || raw === undefined ? '' : String(raw)
              if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                return `"${value.replace(/"/g, '""')}"`
              }
              return value
            }).join(',')
          )
        ].join('\n')
        
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
        const formData = new FormData()
        const fileNameToUse = currentFileName || 'new_table.csv'
        formData.append('file', blob, fileNameToUse.endsWith('.csv') ? fileNameToUse : `${fileNameToUse}.csv`)
        
        // Если указан projectId, добавляем его в запрос
        const url = projectId 
          ? `/files/upload?project_id=${projectId}`
          : '/files/upload'
        
        const createResponse = await apiClient.post(url, formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        })
        
        savedFileId = createResponse.data.id
      } else {
        // Обновляем существующий файл
        const updateData = {
          data: localData,
          columns: localColumns
        }
        if (currentFileName && currentFileName !== fileName) {
          updateData.original_filename = currentFileName
        }
        await apiClient.put(`/files/${fileId}`, updateData)
      }
      
      setIsModified(false)
      if (onModifiedChange) onModifiedChange(false)
      // Обновляем fileId если файл был создан
      if (savedFileId && savedFileId !== fileId && onFileIdUpdate) {
        onFileIdUpdate(savedFileId)
      }
      // Вызываем callback для обновления состояния в родительском компоненте
      if (onFileSaved) {
        onFileSaved(savedFileId)
      }
      showNotification('Файл успешно сохранен!', 'success')
    } catch (err) {
      showNotification('Ошибка сохранения: ' + (err.userMessage || err.response?.data?.detail || err.message), 'error')
    } finally {
      setIsSaving(false)
    }
  }

  if (!Array.isArray(localData) || localData.length === 0 || !Array.isArray(localColumns) || localColumns.length === 0) {
    return (
      <div className="editor-tab">
        <div className="editor-container">
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <h3>Нет данных для редактирования</h3>
            <p>Загрузите файл Excel/CSV или создайте новую таблицу, чтобы начать работу</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="editor-tab">
      <div className="editor-container">
        {user && fileId && (
          <div className="file-name-editor" style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            {editingFileName ? (
              <input
                type="text"
                value={currentFileName}
                onChange={(e) => setCurrentFileName(e.target.value)}
                onBlur={() => {
                  setEditingFileName(false)
                  if (currentFileName.trim() && currentFileName !== fileName) {
                    setIsModified(true)
                    if (onFileNameChange) {
                      onFileNameChange(currentFileName.trim())
                    }
                  } else if (!currentFileName.trim()) {
                    setCurrentFileName(fileName || '')
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.target.blur()
                  } else if (e.key === 'Escape') {
                    setCurrentFileName(fileName || '')
                    setEditingFileName(false)
                  }
                }}
                style={{ 
                  padding: '8px 12px', 
                  border: '2px solid #4CAF50', 
                  borderRadius: '6px', 
                  fontSize: '16px',
                  fontWeight: '600',
                  flex: 1,
                  maxWidth: '400px'
                }}
                autoFocus
              />
            ) : (
              <h3 
                style={{ 
                  margin: 0, 
                  fontSize: '20px', 
                  fontWeight: '600', 
                  cursor: 'pointer',
                  color: '#212529'
                }}
                onDoubleClick={() => setEditingFileName(true)}
                title="Двойной клик для переименования"
              >
                {currentFileName || fileName || 'Без названия'}
              </h3>
            )}
          </div>
        )}
        <div className="editor-controls">
          <button type="button" onClick={handleAddRow}>➕ Добавить строку</button>
          <button type="button" onClick={() => setShowAddColumnModal(true)}>➕ Добавить столбец</button>
          {user && (
            <div className="editor-controls-right">
              {isModified && (
                <span className="modified-indicator">Изменено</span>
              )}
              <button 
                type="button" 
                onClick={handleSave}
                disabled={isSaving}
                className="save-btn"
              >
                {isSaving ? 'Сохранение...' : '💾 Сохранить'}
              </button>
            </div>
          )}
        </div>
        <AddColumnModal
          isOpen={showAddColumnModal}
          onClose={() => setShowAddColumnModal(false)}
          onAdd={handleAddColumn}
        />
        <div className="table-wrapper" ref={tableWrapperRef}>
          <table className="data-table">
            <thead>
              <tr>
                <th className="row-header" style={{ position: 'relative' }}>
                  <div
                    className="global-header-resize-handle"
                    onMouseDown={(e) => handleResizeGlobalHeaderStart(e)}
                    title="Перетащите для изменения высоты всех заголовков столбцов"
                  />
                </th>
                {localColumns.map(col => (
                  <th 
                    key={col}
                    className={`column-header ${draggedColumn === col ? 'dragging' : ''} ${dragOverColumn === col ? 'drag-over' : ''} ${resizingGlobalHeader ? 'resizing-all' : ''}`}
                    style={{ 
                      width: getColumnWidth(col), 
                      minWidth: getColumnWidth(col), 
                      maxWidth: getColumnWidth(col),
                      height: getColumnHeaderHeight(col),
                      minHeight: getColumnHeaderHeight(col)
                    }}
                    draggable={true}
                    onDragStart={(e) => handleColumnDragStart(e, col)}
                    onDragOver={(e) => handleColumnDragOver(e, col)}
                    onDrop={(e) => handleColumnDrop(e, col)}
                    onDragEnd={handleColumnDragEnd}
                  >
                    <div className="column-header-content">
                      {editingColumn === col ? (
                        <input
                          type="text"
                          value={editColumnValue}
                          onChange={(e) => setEditColumnValue(e.target.value)}
                          onBlur={() => handleColumnNameBlur(col)}
                          onKeyDown={(e) => handleColumnNameKeyDown(e, col)}
                          className="column-name-edit-input"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span
                          onDoubleClick={() => handleColumnNameDoubleClick(col)}
                          title="Двойной клик для редактирования, перетащите для изменения порядка"
                          className="column-name-editable"
                        >
                          {col}
                        </span>
                      )}
                      {localColumns.length > 2 && (
                        <div className="delete-column-btn-wrapper" onMouseEnter={() => setHoveredColumn(col)} onMouseLeave={() => setHoveredColumn(null)}>
                          <button
                            className="delete-column-btn"
                            onClick={() => handleDeleteColumn(col)}
                            title="Удалить столбец"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                    <div
                      className="column-resize-handle"
                      onMouseDown={(e) => handleResizeStart(col, e)}
                      title="Перетащите для изменения ширины"
                    />
                    <div
                      className="column-header-resize-handle"
                      onMouseDown={(e) => handleResizeColumnHeaderStart(col, e)}
                      title="Перетащите для изменения высоты заголовка"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {localData.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  style={{ height: getRowHeight(rowIdx), minHeight: getRowHeight(rowIdx) }}
                >
                  <td className="row-header-cell" style={{ position: 'relative' }}>
                    <button
                      type="button"
                      className="row-actions-btn"
                      title="Действия со строкой"
                      onClick={(e) => {
                        e.stopPropagation()
                        // Если меню уже открыто для этой строки, закрываем его
                        if (rowMenu.isOpen && rowMenu.rowIdx === rowIdx) {
                          setRowMenu({ isOpen: false, rowIdx: null, x: 0, y: 0 })
                        } else {
                          openRowMenu(rowIdx, e.clientX, e.clientY)
                        }
                      }}
                    >
                      ⋯
                    </button>
                    <div
                      className="row-resize-handle"
                      onMouseDown={(e) => handleResizeRowStart(rowIdx, e)}
                      title="Перетащите для изменения высоты строки"
                    />
                  </td>
                  {localColumns.map(col => (
                    <td key={col} style={{ width: getColumnWidth(col), minWidth: getColumnWidth(col), maxWidth: getColumnWidth(col), height: getRowHeight(rowIdx), position: 'relative', overflow: 'visible' }}>
                      <div
                        ref={(el) => {
                          if (el) {
                            cellRefs.current[`${rowIdx}-${col}`] = el
                          } else {
                            delete cellRefs.current[`${rowIdx}-${col}`]
                          }
                        }}
                        style={{ position: 'relative', width: '100%', height: '100%', overflow: 'visible' }}
                      >
                        <textarea
                          value={row[col] || ''}
                          onChange={(e) => handleTextareaChange(rowIdx, col, e.target.value)}
                          onKeyDown={(e) => handleTextareaKeyDown(e, rowIdx, col)}
                          onMouseDown={() => {
                            const value = row[col] || ''
                            handleTextareaChange(rowIdx, col, value)
                          }}
                          onFocus={(e) => {
                            // При фокусе всегда показываем подсказки
                            const value = row[col] || ''
                            // Вызываем сразу, без задержки - это важно для пустых ячеек
                            handleTextareaChange(rowIdx, col, value)
                          }}
                          onBlur={(e) => {
                            // Закрываем автозаполнение при потере фокуса, но с задержкой
                            // чтобы клик по подсказке или переход на другую ячейку успел обработаться
                            const blurTimeout = setTimeout(() => {
                              if (autocomplete.show && autocomplete.rowIdx === rowIdx && autocomplete.col === col) {
                                // Проверяем, что фокус не перешел на элемент автозаполнения или другую ячейку
                                const activeElement = document.activeElement
                                const isFocusInDropdown = autocompleteRef.current && autocompleteRef.current.contains(activeElement)
                                const isFocusInCell = cellRefs.current[`${rowIdx}-${col}`]?.contains(activeElement)
                                const isFocusInAnotherTextarea = activeElement.tagName === 'TEXTAREA' && activeElement !== e.target
                                
                                if (!isFocusInDropdown && !isFocusInCell && !isFocusInAnotherTextarea) {
                                  setAutocomplete({ show: false, rowIdx: null, col: null, suggestions: [], selectedIndex: 0 })
                                }
                              }
                            }, 150)
                            
                            // Сохраняем timeout для возможной отмены
                            e.target.dataset.blurTimeout = blurTimeout
                          }}
                          autoComplete="off"
                          style={{ 
                            width: '100%', 
                            height: '100%', 
                            minHeight: '100%',
                            resize: 'none',
                            padding: '10px 12px',
                            border: '2px solid #e9ecef',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontFamily: 'inherit',
                            wordWrap: 'break-word',
                            overflowWrap: 'break-word',
                            whiteSpace: 'pre-wrap',
                            overflow: 'hidden',
                            boxSizing: 'border-box'
                          }}
                          onInput={(e) => {
                            // Автоматическое изменение высоты textarea
                            e.target.style.height = 'auto'
                            e.target.style.height = Math.max(getRowHeight(rowIdx), e.target.scrollHeight) + 'px'
                          }}
                        />
                      </div>
                      {autocomplete.show && autocomplete.rowIdx === rowIdx && autocomplete.col === col && autocomplete.suggestions.length > 0 && autocompletePosition && createPortal(
                        <div
                          ref={autocompleteRef}
                          className="autocomplete-dropdown"
                          style={{
                            position: 'fixed',
                            top: `${autocompletePosition.top}px`,
                            left: `${autocompletePosition.left}px`,
                            width: `${autocompletePosition.width}px`,
                            zIndex: 20,
                            height: `${autocompletePosition.height}px`,
                            overflowY: 'auto',
                            overflowX: 'hidden'
                          }}
                          onMouseDown={(e) => {
                            // Предотвращаем blur textarea при клике на выпадающий список
                            e.preventDefault()
                          }}
                        >
                          {autocomplete.suggestions.map((suggestion, idx) => (
                            <div
                              key={idx}
                              className={`autocomplete-item ${idx === autocomplete.selectedIndex ? 'selected' : ''}`}
                              onMouseDown={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                // Отменяем blur timeout если он есть
                                const cellKey = `${autocomplete.rowIdx}-${autocomplete.col}`
                                const cell = cellRefs.current[cellKey]
                                if (cell) {
                                  const textarea = cell.querySelector('textarea')
                                  if (textarea && textarea.dataset.blurTimeout) {
                                    clearTimeout(parseInt(textarea.dataset.blurTimeout))
                                    delete textarea.dataset.blurTimeout
                                  }
                                }
                                // Выбираем подсказку сразу при нажатии мыши
                                selectAutocompleteSuggestion(suggestion)
                              }}
                              onMouseEnter={() => setAutocomplete(prev => ({ ...prev, selectedIndex: idx }))}
                            >
                              {suggestion}
                            </div>
                          ))}
                        </div>,
                        document.body
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rowMenu.isOpen && rowMenu.rowIdx !== null && (
            <div
              ref={rowMenuRef}
              className="row-menu"
              style={{ left: rowMenu.x, top: rowMenu.y }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className={`row-menu-item ${rowMenu.rowIdx === 0 ? 'disabled' : ''}`}
                onClick={() => {
                  handleMoveRowUp(rowMenu.rowIdx)
                  setRowMenu({ isOpen: false, rowIdx: null, x: 0, y: 0 })
                }}
                disabled={rowMenu.rowIdx === 0}
              >
                🔼 Вверх
              </button>
              <button
                type="button"
                className={`row-menu-item ${rowMenu.rowIdx === localData.length - 1 ? 'disabled' : ''}`}
                onClick={() => {
                  handleMoveRowDown(rowMenu.rowIdx)
                  setRowMenu({ isOpen: false, rowIdx: null, x: 0, y: 0 })
                }}
                disabled={rowMenu.rowIdx === localData.length - 1}
              >
                🔽 Вниз
              </button>
              <button
                type="button"
                className="row-menu-item"
                onClick={() => {
                  handleDuplicateRow(rowMenu.rowIdx)
                  setRowMenu({ isOpen: false, rowIdx: null, x: 0, y: 0 })
                }}
              >
                📋 Копировать
              </button>
              {localData.length > 1 && (
                <button
                  type="button"
                  className="row-menu-item danger"
                  onClick={() => {
                    handleDeleteRow(rowMenu.rowIdx)
                    setRowMenu({ isOpen: false, rowIdx: null, x: 0, y: 0 })
                  }}
                >
                  ✕ Удалить
                </button>
              )}
            </div>
          )}
          {/* Datalists не используются, так как textarea не поддерживает их - используется кастомное автозаполнение */}
        </div>
        {user && onExportCurrentFile && (
          <div className="editor-footer">
            <button
              type="button"
              onClick={() => onExportCurrentFile(localColumns, localData)}
              className="export-btn"
              title="Экспорт в CSV"
            >
              💾 Экспорт
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default EditorTab
