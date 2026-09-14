import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { WaiterProvider } from './context/WaiterContext'
import App from './App.jsx'
import './index.css'
import './refinements.css'

/** Mostra erro na tela (útil no iPad quando o console não está visível) */
class RootErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      const msg = String(this.state.error?.message || this.state.error)
      return (
        <div style={{ fontFamily: 'system-ui, sans-serif', padding: 20, maxWidth: 520, margin: '0 auto' }}>
          <h1 style={{ fontSize: 20, marginBottom: 12 }}>Erro ao carregar o PDV</h1>
          <pre style={{ background: '#f1f5f9', padding: 12, borderRadius: 8, overflow: 'auto', fontSize: 13 }}>{msg}</pre>
          <p style={{ color: '#64748b', fontSize: 14, marginTop: 16 }}>
            No celular ou iPad use o endereço com o <strong>IP do computador</strong> (ex.: http://192.168.0.10:5173), não &quot;localhost&quot;.
            Reinicie o frontend após atualizar o projeto.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootErrorBoundary>
      <BrowserRouter>
        <WaiterProvider>
          <App />
        </WaiterProvider>
      </BrowserRouter>
    </RootErrorBoundary>
  </StrictMode>,
)
