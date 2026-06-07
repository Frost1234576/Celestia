import React from 'react'
import ReactDOM from 'react-dom/client'
import './lib/celestia' // sets up window.celestia via Tauri invoke
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)