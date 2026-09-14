import { useState, useEffect, useRef, useMemo } from 'react'
import { getPedidosKitchen, setPedidoSectorStatus, fulfillKitchenUnit } from '../api'
import { useSocket } from '../socket'
import PedidoElapsed from '../components/PedidoElapsed'
import {earliestCreatedAt} from '../utils/pedidoTime'
import { cozinhaPedidoCardClass, comandaOnlineLabel, isPedidoOnline, pedidoOnlineBannerModel, tipoOnlineFromPedido } from '../utils/comandaOnlineVisual'
import { observacaoParaProducao } from '../utils/productionObservations'
import { textoResumoAddonsPedido } from '../utils/lancheAddons'

/** Totais por item + linhas "q — descrição" quando há observação útil (sem ruído de combo) + qtd delivery. */
function buildKitchenProductionCards(pedidos) {
  const byName = new Map()
  for (const p of pedidos) {
    const name = (p.item_name || '—') + textoResumoAddonsPedido(p)
    const qty = Math.max(1, Number(p.quantity) || 1)
    const obsUse = observacaoParaProducao(p.observations)
    if (!byName.has(name)) byName.set(name, { name, total: 0, deliveryTotal: 0, descMap: new Map() })
    const row = byName.get(name)
    row.total += qty
    if (tipoOnlineFromPedido(p) === 'delivery') row.deliveryTotal += qty
    if (obsUse) row.descMap.set(obsUse, (row.descMap.get(obsUse) || 0) + qty)
  }
  return Array.from(byName.values())
    .map((row) => ({
      name: row.name,
      total: row.total,
      deliveryTotal: row.deliveryTotal,
      lines: [...row.descMap.entries()]
        .map(([text, q]) => ({ qty: q, text }))
        .sort((a, b) => b.qty - a.qty || a.text.localeCompare(b.text))
    }))
    .sort((a, b) => b.total - a.total)
}

/** Card Prato Feito: total + só observação livre (sem combo/PF automático) + qtd delivery. */
function buildPratoFeitoProductionSummary(pedidos) {
  let total = 0
  let deliveryTotal = 0
  const descMap = new Map()
  for (const p of pedidos) {
    const qty = Math.max(1, Number(p.quantity) || 1)
    total += qty
    if (tipoOnlineFromPedido(p) === 'delivery') deliveryTotal += qty
    const obs = observacaoParaProducao(p.observations)
    if (obs) descMap.set(obs, (descMap.get(obs) || 0) + qty)
  }
  if (total <= 0) return null
  const lines = [...descMap.entries()]
    .map(([text, q]) => ({ qty: q, text }))
    .sort((a, b) => b.qty - a.qty || a.text.localeCompare(b.text))
  return { total, lines, deliveryTotal }
}

export default function Cozinha() {
  const [list, setList] = useState([])
  const loadTimeoutRef = useRef(null)

  const load = async () => {
    const pedidos = await getPedidosKitchen()
    setList(pedidos)
  }

  useEffect(() => { const initial=setTimeout(()=>void load(),0); return () => { clearTimeout(initial); if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current) } }, [])
  useSocket(() => {
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current)
    loadTimeoutRef.current = setTimeout(() => { load(); loadTimeoutRef.current = null }, 350)
  })

  /** Marca o pedido inteiro como pronto na cozinha (mantém quantity na comanda). */
  const markKitchenFullyReady = async (pedidoId) => {
    setList((prev) => prev.filter((p) => p.id !== pedidoId))
    try {
      await setPedidoSectorStatus(pedidoId, 'kitchen', 'ready')
      load()
    } catch {
      load()
    }
  }

  /** Retira uma unidade apenas da fila de produção, preservando a conta. */
  const fulfillOneKitchenUnit = async (p) => {
    const q = Math.max(1, Number(p.quantity) || 1)
    if (q > 1) {
      setList((prev) => prev.map((x) => (x.id === p.id ? { ...x, quantity: q - 1 } : x)))
      try {
        await fulfillKitchenUnit(p.id)
        load()
      } catch {
        load()
      }
    } else {
      await markKitchenFullyReady(p.id)
    }
  }

  const pratoFeitoMinusOne = async () => {
    if (pratoFeitoPedidos.length === 0) return
    const sorted = [...pratoFeitoPedidos].sort(
      (a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || a.id - b.id
    )
    await fulfillOneKitchenUnit(sorted[0])
  }

  const setAllPratoFeitoReady = async () => {
    if (pratoFeitoPedidos.length === 0) return
    setList((prev) => prev.filter((p) => !p.prato_feito_espetinho_name))
    try {
      await Promise.all(pratoFeitoPedidos.map((p) => setPedidoSectorStatus(p.id, 'kitchen', 'ready')))
      load()
    } catch {
      load()
    }
  }

  const outrosPedidos = list.filter((p) => !p.prato_feito_espetinho_name)
  const pratoFeitoPedidos = list.filter((p) => p.prato_feito_espetinho_name)
  const totalPratoFeito = pratoFeitoPedidos.reduce((s, p) => s + (p.quantity || 1), 0)

  const productionByItem = useMemo(() => buildKitchenProductionCards(outrosPedidos), [outrosPedidos])
  const pratoFeitoSummary = useMemo(() => buildPratoFeitoProductionSummary(pratoFeitoPedidos), [pratoFeitoPedidos])
  const pratoFeitoTemDelivery = useMemo(
    () => pratoFeitoPedidos.some((p) => p.comanda_tipo_online === 'delivery'),
    [pratoFeitoPedidos]
  )
  const pratoFeitoTemRetirada = useMemo(
    () => pratoFeitoPedidos.some((p) => p.comanda_tipo_online === 'retirada'),
    [pratoFeitoPedidos]
  )
  const pratoFeitoTemOnline = pratoFeitoTemDelivery || pratoFeitoTemRetirada

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <h1 className="mb-3 shrink-0 text-xl font-bold text-slate-800">Cozinha</h1>
      <p className="production-subtitle">Pedidos organizados por comanda e prioridade de preparo.</p>
      <div className="mb-4 shrink-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <h2 className="mb-4 text-xl font-bold text-amber-600 md:text-2xl">Total para produção</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {productionByItem.map((p) => (
            <div key={p.name} className="flex flex-col rounded-xl bg-slate-100 px-3 py-3 text-center">
              <span className="block text-2xl font-bold text-slate-800 md:text-3xl">{p.total}</span>
              {p.deliveryTotal > 0 && (
                <span className="mx-auto mt-1 inline-flex max-w-full items-center justify-center rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-black uppercase leading-tight tracking-wide text-white shadow-md ring-2 ring-sky-300/80">
                   {p.deliveryTotal} delivery{p.deliveryTotal !== p.total ? ` · ${p.total - p.deliveryTotal} salão` : ''}
                </span>
              )}
              <span className="mt-1 text-base font-medium text-slate-600">{p.name}</span>
              {p.lines.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-slate-200/90 pt-2 text-left text-xs font-medium text-slate-600">
                  {p.lines.map((l) => (
                    <li key={l.text} className="leading-snug">
                      {l.qty} — {l.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {pratoFeitoSummary && (
            <div key="prato-feito" className="flex flex-col rounded-xl bg-amber-100 px-3 py-3 text-center">
              <span className="block text-2xl font-bold text-amber-700 md:text-3xl">{pratoFeitoSummary.total}</span>
              {pratoFeitoSummary.deliveryTotal > 0 && (
                <span className="mx-auto mt-1 inline-flex max-w-full items-center justify-center rounded-lg bg-sky-600 px-2.5 py-1 text-[11px] font-black uppercase leading-tight tracking-wide text-white shadow-md ring-2 ring-sky-300/80">
                   {pratoFeitoSummary.deliveryTotal} delivery
                  {pratoFeitoSummary.deliveryTotal !== pratoFeitoSummary.total
                    ? ` · ${pratoFeitoSummary.total - pratoFeitoSummary.deliveryTotal} salão`
                    : ''}
                </span>
              )}
              <span className="mt-1 text-base font-medium text-slate-700">Prato Feito</span>
              {pratoFeitoSummary.lines.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-amber-200/90 pt-2 text-left text-xs font-medium text-amber-900/90">
                  {pratoFeitoSummary.lines.map((l) => (
                    <li key={l.text} className="leading-snug">
                      {l.qty} — {l.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        {productionByItem.length === 0 && !pratoFeitoSummary && (
          <p className="mt-4 text-center text-slate-500 text-lg">Nenhum pedido</p>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto pb-4">
        {outrosPedidos.map((p) => {
          const banner = pedidoOnlineBannerModel(p.comanda_tipo_online)
          const obsShow = observacaoParaProducao(p.observations)
          const addLab = textoResumoAddonsPedido(p)
          return (
          <div
            key={p.id}
            className={cozinhaPedidoCardClass(p)}
          >
            <div className="min-w-0 flex-1">
              {banner && (
                <div className={banner.wrap}>
                  <p className={banner.titleClass}>{banner.title}</p>
                  <p className={banner.subtitleClass}>{banner.subtitle}</p>
                </div>
              )}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                <span className="font-medium text-slate-800">
                  {p.quantity}x {p.item_name}
                  {addLab ? <span className="text-emerald-700">{addLab}</span> : null}
                </span>
                {isPedidoOnline(p) && (
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-violet-900 ring-1 ring-violet-300">
                    Pedir online
                  </span>
                )}
                {comandaOnlineLabel(p.comanda_tipo_online) && (
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                    {comandaOnlineLabel(p.comanda_tipo_online)}
                  </span>
                )}
                <PedidoElapsed createdAt={p.created_at} className="text-xs" />
              </div>
              {p.mesa && isPedidoOnline(p) && (
                <p className={`mt-1 text-xs font-medium ${p.comanda_tipo_online === 'delivery' ? 'text-sky-900' : 'text-teal-900'}`}>{p.mesa}</p>
              )}
              {p.waiting_grill && <span className="text-amber-600 text-sm">(aguard. churrasq.)</span>}
              {p.waiter_name && <span className="ml-2 text-slate-500 text-xs">— {p.waiter_name}</span>}
              {obsShow && <p className="text-amber-800 text-sm font-medium">Obs.: {obsShow}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {(p.quantity || 1) > 1 && (
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-600 text-lg font-bold text-white hover:bg-slate-500"
                  title="Menos 1 na produção"
                  onClick={() => fulfillOneKitchenUnit(p)}
                >
                  −
                </button>
              )}
              {(p.quantity || 1) > 1 ? (
                <button
                  type="button"
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
                  title="Marcar todas as unidades deste pedido"
                  onClick={() => markKitchenFullyReady(p.id)}
                >
                  Tudo pronto
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
                  onClick={() => markKitchenFullyReady(p.id)}
                >
                  Pronto
                </button>
              )}
            </div>
          </div>
          )
        })}
        {pratoFeitoPedidos.length > 0 && (
          <div
            className={`flex items-center justify-between gap-2 rounded-xl border-2 p-3 ${
              pratoFeitoTemDelivery && pratoFeitoTemRetirada
                ? 'border-indigo-500 bg-gradient-to-r from-sky-100 via-indigo-50 to-teal-50'
                : pratoFeitoTemDelivery
                  ? 'border-sky-500 bg-gradient-to-r from-sky-100 to-amber-50'
                  : pratoFeitoTemRetirada
                    ? 'border-teal-500 bg-gradient-to-r from-teal-100 to-amber-50'
                    : 'border-amber-400 bg-amber-50'
            }`}
          >
            <div className="min-w-0 flex-1">
              {pratoFeitoTemOnline && (
                <div
                  className={`mb-2 rounded-md border px-2 py-1.5 text-center ${
                    pratoFeitoTemDelivery && pratoFeitoTemRetirada
                      ? 'border-indigo-600 bg-indigo-100'
                      : pratoFeitoTemDelivery
                        ? 'border-sky-600 bg-sky-200'
                        : 'border-teal-600 bg-teal-200'
                  }`}
                >
                  <span
                    className={`text-xs font-black uppercase tracking-wide ${
                      pratoFeitoTemDelivery && pratoFeitoTemRetirada ? 'text-indigo-950' : pratoFeitoTemDelivery ? 'text-sky-950' : 'text-teal-950'
                    }`}
                  >
                    {pratoFeitoTemDelivery && pratoFeitoTemRetirada
                      ? ' Prato Feito — pedidos online (entrega + retirada)'
                      : pratoFeitoTemDelivery
                        ? ' Prato Feito — pedido online entrega (delivery) — embalar'
                        : ' Prato Feito — pedido online retirada no balcão'}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                <span className="font-medium text-amber-800">{totalPratoFeito}x Prato Feito</span>
                <PedidoElapsed createdAt={earliestCreatedAt(pratoFeitoPedidos)} className="text-xs" />
              </div>
              {pratoFeitoPedidos[0]?.waiter_name && <span className="ml-2 text-slate-500 text-xs">— {pratoFeitoPedidos[0].waiter_name}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="rounded bg-amber-600 px-3 py-2 text-lg font-bold text-white hover:bg-amber-500"
                title="Diminuir 1"
                onClick={() => pratoFeitoMinusOne()}
              >
                −
              </button>
              <button
                type="button"
                className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
                onClick={setAllPratoFeitoReady}
              >
                Pronto (todos)
              </button>
            </div>
          </div>
        )}
        {list.length === 0 && (
          <p className="py-8 text-center text-slate-500">Nenhum pedido no momento.</p>
        )}
      </div>
    </div>
  )
}
