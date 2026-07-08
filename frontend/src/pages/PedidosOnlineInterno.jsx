import { useState, useEffect, useRef, useMemo } from 'react'
import { getOrders, updateOrderStatus, getPrintOrder } from '../api'
import { useSocket } from '../socket'
import { buildPedidoOnlinePrintHtml, formatFormaPagamentoLabel, openComandaPrintWindow } from '../utils/comandaImpressao'

const STATUS_LABEL = {
  aguardando_pagamento: 'Aguardando pagamento (PIX)',
  recebido: 'Recebido',
  em_producao: 'Em produção',
  pronto: 'Pronto',
  saiu_entrega: 'Saiu para entrega',
  entregue: 'Entregue',
  cancelado: 'Cancelado'
}

/** Data local YYYY-MM-DD a partir de `created_at` (SQLite localtime). */
function ymdFromOrder(order) {
  const raw = order?.created_at
  if (!raw) return null
  const m = String(raw).trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

function todayYmdLocal() {
  const t = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
}

function isOrderFromToday(order) {
  const y = ymdFromOrder(order)
  if (!y) return true
  return y === todayYmdLocal()
}

function isFinalizado(status) {
  return status === 'entregue' || status === 'cancelado'
}

function playNewOrderSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 800
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)
  } catch (_) {}
}

export default function PedidosOnlineInterno() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterTipo, setFilterTipo] = useState('') // '' | delivery | retirada
  const [tab, setTab] = useState('todos') // todos | delivery
  const [alert, setAlert] = useState(null)
  const [cancelDialog, setCancelDialog] = useState(null) // { id } | null
  const [cancelMotivo, setCancelMotivo] = useState('')
  const [cancelSaving, setCancelSaving] = useState(false)
  const prevOrdersRef = useRef(0)

  const load = async () => {
    setLoading(true)
    const tipo = filterTipo || undefined
    const data = await getOrders(tipo)
    setOrders(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [filterTipo])
  useSocket((payload, eventName) => {
    load()
    if (eventName === 'novo-pedido-online' && payload) {
      playNewOrderSound()
      setAlert({
        id: payload.orderId,
        tipo: payload.tipo,
        cliente_nome: payload.cliente_nome,
        valor_total: payload.valor_total
      })
      setTimeout(() => setAlert(null), 8000)
    }
  })

  useEffect(() => {
    prevOrdersRef.current = orders.length
  }, [orders])

  const list = tab === 'delivery' ? orders.filter((o) => o.tipo === 'delivery') : orders

  const { ativosHoje, feitosHoje, antigos } = useMemo(() => {
    const ativosHoje = []
    const feitosHoje = []
    const antigos = []
    for (const o of list) {
      if (!isOrderFromToday(o)) {
        antigos.push(o)
        continue
      }
      if (isFinalizado(o.status)) feitosHoje.push(o)
      else ativosHoje.push(o)
    }
    return { ativosHoje, feitosHoje, antigos }
  }, [list])

  const handleStatus = async (orderId, status) => {
    await updateOrderStatus(orderId, status)
    load()
  }

  const openCancelDialog = (orderId) => {
    setCancelMotivo('')
    setCancelDialog({ id: orderId })
  }

  const confirmCancelOrder = async () => {
    if (!cancelDialog?.id) return
    setCancelSaving(true)
    try {
      await updateOrderStatus(cancelDialog.id, 'cancelado', cancelMotivo)
      setCancelDialog(null)
      setCancelMotivo('')
      load()
    } catch (_) {
      alert('Não foi possível cancelar o pedido.')
    } finally {
      setCancelSaving(false)
    }
  }

  const handlePrint = (order) => {
    getPrintOrder(order.id).then((d) => {
      openComandaPrintWindow(buildPedidoOnlinePrintHtml(d), `Pedido #${d.numero}`)
    })
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-slate-800">Pedidos online</h1>

      {alert && (
        <div className="mb-4 rounded-xl border-2 border-amber-500 bg-amber-50 p-4 shadow-lg animate-pulse">
          <p className="font-bold text-amber-800">🔔 Novo pedido de {alert.tipo === 'delivery' ? 'delivery' : 'retirada'} recebido</p>
          <p className="text-slate-700">#{alert.id} — {alert.cliente_nome} — R$ {Number(alert.valor_total).toFixed(2)}</p>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('todos')}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === 'todos' ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-700'}`}
        >
          Todos
        </button>
        <button
          type="button"
          onClick={() => setTab('delivery')}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === 'delivery' ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-700'}`}
        >
          🚚 Delivery
        </button>
        <select
          value={filterTipo}
          onChange={(e) => setFilterTipo(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
        >
          <option value="">Todos os tipos</option>
          <option value="delivery">Delivery</option>
          <option value="retirada">Retirada</option>
        </select>
      </div>

      {loading ? (
        <p className="text-slate-500">Carregando...</p>
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">Nenhum pedido online.</p>
      ) : (
        <div className="space-y-8">
          {ativosHoje.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700">Pedidos de hoje — em andamento</h2>
              <div className="space-y-4">
                {ativosHoje.map((order) => (
                  <div
                    key={order.id}
                    className={`rounded-xl border-2 bg-white p-4 shadow-sm ${
                      order.tipo === 'delivery' ? 'border-amber-400' : 'border-slate-200'
                    }`}
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-slate-800">
                        #{order.id}
                        {order.tipo === 'delivery' ? ' 🚚 Delivery' : ' 🛍 Retirada'}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-sm font-medium text-slate-700">
                        {STATUS_LABEL[order.status] || order.status}
                      </span>
                    </div>
                    <p className="text-slate-700">{order.cliente_nome} — {order.cliente_telefone}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Pagamento: <span className="font-medium text-slate-800">{formatFormaPagamentoLabel(order.forma_pagamento)}</span>
                    </p>
                    {order.tipo === 'delivery' && order.endereco_rua && (
                      <p className="mt-1 text-sm text-slate-600">
                        {order.endereco_rua}, {order.endereco_numero}
                        {order.endereco_complemento ? ' ' + order.endereco_complemento : ''} — {order.endereco_bairro}
                        {order.endereco_referencia ? ` — Ref.: ${order.endereco_referencia}` : ''}
                      </p>
                    )}
                    <ul className="mt-2 space-y-1 text-sm text-slate-600">
                      {order.items?.map((i) => (
                        <li key={i.id}>{i.quantity}x {i.item_name} — R$ {(i.quantity * i.unit_price).toFixed(2)}</li>
                      ))}
                    </ul>
                    <p className="mt-2 font-semibold text-slate-800">Total: R$ {Number(order.valor_total).toFixed(2)}</p>
                    {order.observacoes && <p className="mt-1 text-sm text-slate-500">Obs: {order.observacoes}</p>}
                    {order.status === 'cancelado' && order.motivo_cancelamento && (
                      <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                        <span className="font-semibold">Motivo do cancelamento:</span> {order.motivo_cancelamento}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {order.status === 'recebido' && (
                        <button type="button" className="btn btn-success text-sm font-semibold" onClick={() => handleStatus(order.id, 'em_producao')}>
                          Confirmar pedido
                        </button>
                      )}
                      {order.status === 'em_producao' && (
                        <button type="button" className="btn btn-primary text-sm" onClick={() => handleStatus(order.id, 'pronto')}>
                          Pronto
                        </button>
                      )}
                      {order.tipo === 'delivery' && order.status === 'pronto' && (
                        <button type="button" className="btn btn-success text-sm" onClick={() => handleStatus(order.id, 'saiu_entrega')}>
                          Saiu para entrega
                        </button>
                      )}
                      {(order.tipo === 'retirada' && order.status === 'pronto') || (order.tipo === 'delivery' && order.status === 'saiu_entrega') ? (
                        <button type="button" className="btn btn-success text-sm" onClick={() => handleStatus(order.id, 'entregue')}>
                          {order.tipo === 'delivery' ? 'Entregue' : 'Retirado'}
                        </button>
                      ) : null}
                      {!['entregue', 'cancelado'].includes(order.status) && (
                        <button type="button" className="btn btn-danger text-sm" onClick={() => openCancelDialog(order.id)}>
                          Cancelar / recusar
                        </button>
                      )}
                      <button type="button" className="btn btn-secondary text-sm" onClick={() => handlePrint(order)}>
                        Imprimir comanda
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {feitosHoje.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Concluídos hoje (referência)</h2>
              <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50/80">
                {feitosHoje.map((order) => (
                  <div key={order.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm text-slate-700">
                    <span className="font-mono text-xs text-slate-500">#{order.id}</span>
                    <span className="font-medium text-slate-800">{order.cliente_nome}</span>
                    <span className="rounded bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                      {STATUS_LABEL[order.status] || order.status}
                    </span>
                    <span className="text-xs">{order.tipo === 'delivery' ? '🚚' : '🛍'}</span>
                    <span className="ml-auto font-semibold text-slate-800">R$ {Number(order.valor_total).toFixed(2)}</span>
                    <button type="button" className="text-xs font-semibold text-amber-700 underline hover:text-amber-900" onClick={() => handlePrint(order)}>
                      Imprimir
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {antigos.length > 0 && (
            <>
              {ativosHoje.length === 0 && feitosHoje.length === 0 ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-sm text-amber-950">
                  Nenhum pedido de hoje na área principal. Em seguida está só o <strong>histórico</strong> de dias anteriores (lista compacta).
                </p>
              ) : null}
              <details className="group rounded-xl border border-slate-200 bg-slate-100/60">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-600 marker:hidden [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-2">
                  <span className="text-slate-400 transition group-open:rotate-90">▸</span>
                  Pedidos de dias anteriores ({antigos.length}) — só registro
                </span>
              </summary>
              <div className="border-t border-slate-200 bg-white/90 px-2 py-1">
                {antigos.map((order) => (
                  <div
                    key={order.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-100 px-2 py-1.5 text-xs text-slate-600 last:border-0"
                  >
                    <span className="w-[5.5rem] shrink-0 font-mono text-[10px] text-slate-400">{ymdFromOrder(order) || '—'}</span>
                    <span className="font-semibold text-slate-700">#{order.id}</span>
                    <span className="max-w-[10rem] truncate sm:max-w-xs">{order.cliente_nome}</span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                      {STATUS_LABEL[order.status] || order.status}
                    </span>
                    <span className="ml-auto font-medium text-slate-700">R$ {Number(order.valor_total).toFixed(2)}</span>
                    <button type="button" className="shrink-0 text-[10px] font-semibold text-amber-700 underline" onClick={() => handlePrint(order)}>
                      Imprimir
                    </button>
                  </div>
                ))}
              </div>
              </details>
            </>
          )}
        </div>
      )}

      {cancelDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">Cancelar ou recusar pedido</h2>
            <p className="mt-1 text-sm text-slate-600">
              O cliente verá esta mensagem no acompanhamento do pedido online. Explique o motivo (opcional, mas recomendado).
            </p>
            <textarea
              className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
              rows={4}
              placeholder="Ex.: Item indisponível hoje. / Endereço fora da área de entrega."
              value={cancelMotivo}
              onChange={(e) => setCancelMotivo(e.target.value)}
            />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                disabled={cancelSaving}
                onClick={() => { setCancelDialog(null); setCancelMotivo('') }}
              >
                Voltar
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={cancelSaving}
                onClick={confirmCancelOrder}
              >
                {cancelSaving ? 'Salvando…' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
