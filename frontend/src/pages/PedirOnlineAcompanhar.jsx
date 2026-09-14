import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getApiBase } from '../devApiBase'
import PedidoOnlineAcompanhamento from '../components/PedidoOnlineAcompanhamento'
import { lerPedidoLocal } from '../utils/pedidoStorage'

const API = getApiBase()

export default function PedirOnlineAcompanhar() {
  const navigate = useNavigate()
  const apiBase = API || (typeof window !== 'undefined' ? window.location.origin : '')

  const [formTel, setFormTel] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [erroForm, setErroForm] = useState('')
  const [consulta, setConsulta] = useState(null)

  const buscarPorTelefone = useCallback(async (telefone) => {
    const tel = String(telefone || '').replace(/\D/g, '')
    if (tel.length < 8) {
      setErroForm('Informe seu telefone com DDD.')
      return
    }
    setBuscando(true)
    setErroForm('')
    try {
      const r = await fetch(`${apiBase}/api/public/orders/ultimo?telefone=${encodeURIComponent(tel)}`)
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Pedido não encontrado')
      setConsulta({ id: data.id, telefone: tel, initialOrder: data })
    } catch (e) {
      setErroForm(e.message || 'Não foi possível encontrar seu pedido.')
    } finally {
      setBuscando(false)
    }
  }, [apiBase])

  useEffect(() => {
    const local = lerPedidoLocal()
    if (local?.telefone) {
      setFormTel(local.telefone)
      buscarPorTelefone(local.telefone)
    }
  }, [buscarPorTelefone])

  const handleBuscar = (e) => {
    e.preventDefault()
    buscarPorTelefone(formTel)
  }

  if (consulta?.id) {
    return (
      <PedidoOnlineAcompanhamento
        orderId={consulta.id}
        apiBase={apiBase}
        initialOrder={consulta.initialOrder}
        telefoneConsulta={consulta.telefone}
        onNovoPedido={() => navigate('/pedir')}
      />
    )
  }

  return (
    <div className="menu-bg flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
        <h1 className="text-center text-2xl font-bold text-slate-900">Acompanhar pedido</h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Informe seu WhatsApp para ver o andamento do seu último pedido em tempo real.
        </p>
        <form onSubmit={handleBuscar} className="mt-6 space-y-3">
          <input
            type="tel"
            required
            placeholder="WhatsApp com DDD *"
            value={formTel}
            onChange={(e) => setFormTel(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />
          {erroForm && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erroForm}</p>
          )}
          <button
            type="submit"
            disabled={buscando}
            className="w-full rounded-xl bg-black py-3 font-semibold text-white disabled:opacity-70"
          >
            {buscando ? 'Buscando…' : 'Ver andamento'}
          </button>
        </form>
        <Link to="/pedir" className="mt-4 block text-center text-sm text-slate-600 hover:underline">
          Voltar ao cardápio
        </Link>
      </div>
    </div>
  )
}
