import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Убираем StrictMode чтобы избежать двойного рендера в development
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

