import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  isStatusTerminal,
  stepsForTipo,
  subtituloStatusCliente,
  tituloAcompanhamento,
} from '../utils/pedidoOnlineClienteStatus'

const formatPrice = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function orderTemItens(order) {
  return Array.isArray(order?.items) && order.items.length > 0
}

export default function PedidoOnlineAcompanhamento({
  orderId,
  apiBase,
  initialOrder = null,
  telefoneConsulta = '',
  onNovoPedido,
  showNovoPedido = true,
}) {
  const [order, setOrder] = useState(initialOrder)
  const [pollError, setPollError] = useState(null)
  const [loading, setLoading] = useState(!initialOrder || !orderTemItens(initialOrder))
  const [pixCopiado, setPixCopiado] = useState(false)
  const orderRef = useRef(order)

  const handleCopiarPix = async () => {
    try {
      await navigator.clipboard.writeText(order?.pix_qr_code || '')
      setPixCopiado(true)
      setTimeout(() => setPixCopiado(false), 2500)
    } catch {
      // clipboard indisponível: o campo de texto abaixo já permite selecionar e copiar manualmente
    }
  }

  useEffect(() => {
    orderRef.current = order
  }, [order])

  useEffect(() => {
    if (!orderId) return undefined
    if (initialOrder && orderTemItens(initialOrder)) return undefined
    let cancelled = false

    const fetchOrder = async () => {
      try {
        const params = telefoneConsulta
          ? `?telefone=${encodeURIComponent(String(telefoneConsulta).replace(/\D/g, ''))}`
          : ''
        const r = await fetch(`${apiBase}/api/public/orders/${orderId}${params}`)
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error || 'Pedido não encontrado')
        if (cancelled) return
        setOrder(data)
        setPollError(null)
      } catch (e) {
        if (!cancelled) setPollError(e.message || 'Erro ao carregar pedido')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchOrder()
    return () => { cancelled = true }
  }, [orderId, apiBase, initialOrder, telefoneConsulta])

  useEffect(() => {
    if (!orderId) return undefined
    let cancelled = false

    const poll = async () => {
      const cur = orderRef.current
      if (cur?.status && isStatusTerminal(cur.status)) return
      try {
        const params = telefoneConsulta
          ? `?telefone=${encodeURIComponent(String(telefoneConsulta).replace(/\D/g, ''))}`
          : ''
        const r = await fetch(`${apiBase}/api/public/orders/${orderId}${params}`)
        if (!r.ok) throw new Error('Não foi possível atualizar o status.')
        const data = await r.json()
        if (cancelled) return
        setOrder((prev) => ({ ...prev, ...data, tipo: data.tipo || prev?.tipo }))
        setPollError(null)
      } catch (e) {
        if (!cancelled) setPollError(e.message || 'Erro de conexão.')
      }
    }

    poll()
    const iv = setInterval(poll, 4000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [orderId, apiBase, telefoneConsulta])

  if (loading && !order) {
    return (
      <div className="menu-bg flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <div className="mx-auto mb-3 h-11 w-11 animate-spin rounded-full border-4 border-[hsl(var(--menu-primary))] border-t-transparent" />
          <p className="font-display text-lg font-extrabold text-[hsl(var(--menu-fg))]">Carregando pedido…</p>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="menu-bg flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-3xl border border-red-200 bg-white p-6 text-center shadow-card">
          <p className="text-lg font-bold text-red-800">Pedido não encontrado</p>
          {pollError && <p className="mt-2 text-sm text-red-700">{pollError}</p>}
          <Link to="/pedir" className="mt-4 inline-block text-sm font-semibold text-[hsl(var(--menu-primary))] hover:underline">
            Voltar ao cardápio
          </Link>
        </div>
      </div>
    )
  }

  const tipo = order.tipo === 'delivery' ? 'delivery' : 'retirada'
  const st = order.status || 'recebido'
  const steps = stepsForTipo(tipo)
  const aguardandoPagamento = st === 'aguardando_pagamento'
  const aguardandoConfirmacao = st === 'recebido'
  const found = steps.findIndex((s) => s.status === st)
  const curIdx =
    st === 'cancelado'
      ? -1
      : st === 'entregue'
        ? steps.length
        : Math.max(0, found >= 0 ? found : 0)
  const cancelado = st === 'cancelado'

  return (
    <div className="menu-bg min-h-screen p-5">
      <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-card">
        <h1
          className={`text-2xl font-bold sm:text-3xl ${
            cancelado ? 'text-red-700' : st === 'entregue' ? 'text-emerald-700' : 'text-slate-900'
          }`}
        >
          {aguardandoConfirmacao ? 'Pedido enviado!' : tituloAcompanhamento(st)}
        </h1>
        <p className="mt-2 text-slate-700">Pedido #{order.id}</p>

        {orderTemItens(order) && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left">
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Seu pedido</p>
            <ul className="space-y-2.5">
              {order.items.map((it, idx) => (
                <li key={it.id ?? `${it.item_id}-${idx}`} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0 text-slate-800">
                    <span className="font-semibold">{it.quantity}x</span>{' '}
                    {it.item_name || 'Item'}
                    {it.observations && (
                      <p className="mt-0.5 text-xs leading-snug text-slate-500">{it.observations}</p>
                    )}
                  </div>
                  <span className="shrink-0 font-medium text-slate-700">
                    {formatPrice(Number(it.unit_price) * Number(it.quantity))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-4 text-xl font-bold text-slate-900">Total: {formatPrice(order.valor_total)}</p>

        {aguardandoPagamento && (
          <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-left">
            <div className="flex items-start gap-3">
              <span className="relative mt-0.5 flex h-3 w-3 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-sky-500" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-sky-950">Escaneie o QR Code ou copie o código PIX</p>
                <p className="mt-1 text-sm leading-relaxed text-sky-900">
                  Assim que o pagamento for confirmado, seu pedido é enviado automaticamente para a cozinha.
                </p>
              </div>
            </div>

            {order.pix_qr_code_base64 ? (
              <div className="mt-4 flex justify-center">
                <img
                  src={`data:image/png;base64,${order.pix_qr_code_base64}`}
                  alt="QR Code PIX"
                  className="h-52 w-52 rounded-xl border border-sky-200 bg-white p-2"
                />
              </div>
            ) : (
              <p className="mt-4 text-center text-sm text-sky-800">Gerando seu PIX…</p>
            )}

            {order.pix_qr_code && (
              <div className="mt-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-700">PIX copia e cola</p>
                <textarea
                  readOnly
                  value={order.pix_qr_code}
                  onFocus={(e) => e.target.select()}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-sky-200 bg-white p-2 text-xs text-slate-700"
                />
                <button
                  type="button"
                  onClick={handleCopiarPix}
                  className="mt-2 w-full rounded-xl bg-sky-600 py-2.5 text-sm font-bold text-white"
                >
                  {pixCopiado ? 'Código copiado!' : 'Copiar código PIX'}
                </button>
              </div>
            )}
          </div>
        )}

        {aguardandoConfirmacao && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left">
            <div className="flex items-start gap-3">
              <span className="relative mt-0.5 flex h-3 w-3 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" />
              </span>
              <div>
                <p className="text-sm font-bold text-amber-950">Aguardando confirmação do restaurante</p>
                <p className="mt-1 text-sm leading-relaxed text-amber-900">
                  Recebemos seu pedido e estamos conferindo. Assim que confirmarmos, você verá aqui o andamento em tempo real.
                </p>
              </div>
            </div>
          </div>
        )}

        {!cancelado && !aguardandoConfirmacao && !aguardandoPagamento && (
          <p className="mt-2 text-base font-medium text-[hsl(var(--menu-primary))]">
            {subtituloStatusCliente(st, tipo)}
          </p>
        )}

        {order.message && !cancelado && !aguardandoConfirmacao && !aguardandoPagamento && (
          <p className="mt-2 text-sm text-slate-600">{order.message}</p>
        )}

        {cancelado && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-left text-red-950">
            <p className="text-sm font-bold uppercase tracking-wide text-red-800">Motivo</p>
            <p className="mt-1 text-sm leading-relaxed">
              {String(order.motivo_cancelamento || '').trim() || 'Não informado pelo restaurante.'}
            </p>
          </div>
        )}

        {!cancelado && (
          <div className="mt-6 text-left">
            <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Andamento</p>
            <ol className="space-y-0">
              {aguardandoPagamento && (
                <li className="relative flex gap-3 border-l-2 border-sky-400 py-2 pl-4">
                  <span className="absolute -left-[9px] top-3 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-500 text-[10px] font-bold text-white">
                    …
                  </span>
                  <div>
                    <p className="text-sm font-bold text-sky-700">Aguardando pagamento PIX</p>
                    <p className="text-xs text-slate-600">Assim que o PIX for confirmado, seguimos com seu pedido.</p>
                  </div>
                </li>
              )}
              {aguardandoConfirmacao && (
                <li className="relative flex gap-3 border-l-2 border-amber-400 py-2 pl-4">
                  <span className="absolute -left-[9px] top-3 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                    …
                  </span>
                  <div>
                    <p className="text-sm font-bold text-amber-700">Aguardando confirmação</p>
                    <p className="text-xs text-slate-600">O restaurante vai aceitar seu pedido em instantes.</p>
                  </div>
                </li>
              )}
              {steps.map((s, i) => {
                const passed = !aguardandoConfirmacao && !aguardandoPagamento && i < curIdx
                const current = !aguardandoConfirmacao && !aguardandoPagamento && i === curIdx && st === s.status
                const pending = aguardandoConfirmacao || aguardandoPagamento || i > curIdx
                return (
                  <li
                    key={s.status}
                    className={`relative flex gap-3 border-l-2 py-2 pl-4 ${
                      passed ? 'border-emerald-500' : current ? 'border-[hsl(var(--menu-primary))]' : 'border-slate-200'
                    }`}
                  >
                    <span
                      className={`absolute -left-[9px] top-3 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        passed
                          ? 'bg-emerald-500 text-white'
                          : current
                            ? 'bg-[hsl(var(--menu-primary))] text-white'
                            : 'border border-slate-300 bg-white text-transparent'
                      }`}
                    >
                      {passed ? '✓' : ''}
                    </span>
                    <div className={pending ? 'opacity-55' : ''}>
                      <p className={`text-sm font-bold ${current ? 'text-[hsl(var(--menu-primary))]' : 'text-slate-800'}`}>{s.label}</p>
                      <p className="text-xs text-slate-600">{s.desc}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        )}

        {pollError && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-900">{pollError}</p>
        )}
        {!cancelado && !isStatusTerminal(st) && (
          <p className="mt-3 text-center text-xs text-slate-500">Atualizamos o status automaticamente a cada poucos segundos.</p>
        )}

        {showNovoPedido && (
          <button
            type="button"
            onClick={onNovoPedido}
            className="mt-6 w-full rounded-xl bg-[hsl(var(--menu-primary))] py-3 font-bold text-white"
          >
            Fazer outro pedido
          </button>
        )}
        <Link to="/pedir" className="mt-3 block text-sm text-slate-600 hover:underline">Voltar ao cardápio</Link>
      </div>
    </div>
  )
}

export const PEDIR_STORAGE_KEY = 'pedir_online_ultimo_pedido'

export function salvarPedidoLocal(order, telefone) {
  if (!order?.id) return
  try {
    localStorage.setItem(PEDIR_STORAGE_KEY, JSON.stringify({
      id: order.id,
      telefone: String(telefone || '').replace(/\D/g, ''),
      saved_at: Date.now(),
    }))
  } catch { /* ignore */ }
}

export function lerPedidoLocal() {
  try {
    const raw = localStorage.getItem(PEDIR_STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data?.id) return null
    const dayMs = 24 * 60 * 60 * 1000
    if (data.saved_at && Date.now() - data.saved_at > dayMs) return null
    return data
  } catch {
    return null
  }
}
