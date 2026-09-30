import React from 'react'
import ReactDOM from 'react-dom/client'
import './ui/tokens.css'
import './ui/ui.css'
import App from './App.jsx'

// ?rig=1: the animation rig's lab (src/city/RigLab.jsx), its own chunk; never linked
const RigLab = /[?&]rig=1\b/.test(window.location.search) ? React.lazy(() => import('./city/RigLab.jsx')) : null

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {RigLab ? <React.Suspense fallback={null}><RigLab /></React.Suspense> : <App />}
  </React.StrictMode>,
)
