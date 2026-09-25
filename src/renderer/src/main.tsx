import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import OverlayExportPage from './components/OverlayExportPage'
import './index.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)
if (new URLSearchParams(window.location.search).get('mode') === 'overlay-export') {
  root.render(<OverlayExportPage />)
} else {
  root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
  )
}
