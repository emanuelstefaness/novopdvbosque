import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import PedirOnline from './pages/PedirOnline.jsx'
import PedirOnlineAcompanhar from './pages/PedirOnlineAcompanhar.jsx'
import './index.css'

// App mínimo só para pedidos online (deploy). PDV completo roda localmente.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <div className="public-app"><Routes>
        <Route path="/" element={<PedirOnline />} />
        <Route path="/pedir" element={<PedirOnline />} />
        <Route path="/acompanhar" element={<PedirOnlineAcompanhar />} />
      </Routes></div>
    </BrowserRouter>
  </StrictMode>,
)
