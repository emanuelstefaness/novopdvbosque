import { useState, useEffect, useMemo, useRef } from 'react'
import { getPedidosBar, setPedidoSectorStatus } from '../api'
import { useSocket } from '../socket'
import PedidoElapsed from '../components/PedidoElapsed'
import {earliestCreatedAt} from '../utils/pedidoTime'
import { barComandaColumnClass, comandaOnlineLabel, isTipoPedidoOnline, pedidoOnlineBannerModel } from '../utils/comandaOnlineVisual'
import { observacaoParaProducao } from '../utils/productionObservations'

/** Ordem dos cards = ordem de lançamento na fila (ver Churrasqueira.jsx). */
function groupByComanda(list) {
  const map = new Map()
  const order = []
  list.forEach((p) => {
    const key = p.comanda_id
    if (!map.has(key)) {
      map.set(key, { comanda_id: key, mesa: p.mesa, items: [] })
      order.push(key)
    }
    map.get(key).items.push(p)
  })
  return order.map((k) => map.get(k))
}

export default function Bar() {
  const [list, setList] = useState([])
  const loadTimeoutRef = useRef(null)

  const load = async () => {
    const data = await getPedidosBar()
    setList(data)
  }

  useEffect(() => { const initial=setTimeout(()=>void load(),0); return () => { clearTimeout(initial); if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current) } }, [])
  useSocket(() => {
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current)
    loadTimeoutRef.current = setTimeout(() => { load(); loadTimeoutRef.current = null }, 350)
  })

  const cards = useMemo(() => groupByComanda(list), [list])

  const setReady = async (pedidoId) => {
    setList((prev) => prev.filter((p) => p.id !== pedidoId))
    try {
      await setPedidoSectorStatus(pedidoId, 'bar', 'ready')
      load()
    } catch {
      load()
    }
  }

  const setCardAllReady = async (items) => {
    const ids = new Set(items.map((p) => p.id))
    setList((prev) => prev.filter((p) => !ids.has(p.id)))
    try {
      for (const p of items) {
        await setPedidoSectorStatus(p.id, 'bar', 'ready')
      }
      load()
    } catch {
      load()
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
      <div className="mb-3 shrink-0">
        <h1 className="text-xl font-bold text-slate-800">Bar</h1>
      <p className="production-subtitle">Pedidos organizados por comanda e prioridade de preparo.</p>
        <p className="text-sm text-slate-500">Caipirinhas, doses e drinks</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-row gap-3 overflow-x-auto overflow-y-hidden pb-2">
        {cards.map((card) => {
          const tipoOn = card.items[0]?.comanda_tipo_online
          const barBanner = pedidoOnlineBannerModel(tipoOn)
          return (
          <div
            key={card.comanda_id}
            className={barComandaColumnClass(tipoOn)}
          >
            {barBanner && (
              <div className={barBanner.wrap}>
                <p className={barBanner.titleClass}>{barBanner.title}</p>
                <p className={barBanner.subtitleClass}>{barBanner.subtitle}</p>
              </div>
            )}
            <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
              <div>
                <span className="font-bold text-sm text-slate-800">
                  Comanda {card.items[0]?.production_number || card.comanda_id}{card.items[0]?.production_number ? " (paga)" : ""} — Mesa {card.mesa}
                  {isTipoPedidoOnline(tipoOn) && (
                    <span className="ml-2 inline-block rounded-full bg-violet-200/90 px-2 py-0.5 text-[9px] font-black uppercase text-violet-900">
                      Pedir online
                    </span>
                  )}
                  {comandaOnlineLabel(tipoOn) && (
                    <span className="ml-2 inline-block rounded-full bg-slate-200/90 px-2 py-0.5 text-[10px] font-bold text-slate-800">
                      {comandaOnlineLabel(tipoOn)}
                    </span>
                  )}
                </span>
                {card.items[0]?.waiter_name && <span className="ml-2 text-slate-500 text-xs">Garçom: {card.items[0].waiter_name}</span>}
                <div className="mt-0.5" title="Tempo desde o pedido mais antigo desta comanda na fila">
                  <PedidoElapsed createdAt={earliestCreatedAt(card.items)} className="text-xs" />
                </div>
              </div>
              <button
                type="button"
                className="rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-500"
                onClick={() => setCardAllReady(card.items)}
              >
                Tudo pronto
              </button>
            </div>
            <ul className="min-h-0 flex-1 space-y-2 overflow-auto">
              {card.items.map((p) => {
                const obsLinha = observacaoParaProducao(p.observations)
                return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-100 px-2 py-1.5 text-sm text-slate-800">
                  <span className="flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span>{p.quantity}x {p.item_name}</span>
                      <PedidoElapsed createdAt={p.created_at} className="text-xs" />
                    </span>
                    {(p.caipirinha_base || p.caipirinha_picole || p.dose_accompaniment || obsLinha) && (
                      <span className="block text-xs text-slate-500">
                        {p.caipirinha_base && `Base: ${p.caipirinha_base}`}
                        {p.caipirinha_picole && ' • Picolé'}
                        {p.dose_accompaniment && ` • ${p.dose_accompaniment}`}
                        {obsLinha && `${(p.caipirinha_base || p.caipirinha_picole || p.dose_accompaniment) ? ' • ' : ''}${obsLinha}`}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded bg-green-600 px-2 py-0.5 text-xs text-white hover:bg-green-500"
                    onClick={() => setReady(p.id)}
                  >
                    Pronto
                  </button>
                </li>
                );
              })}
            </ul>
          </div>
          );
        })}
      </div>
      {cards.length === 0 && (
        <p className="py-8 text-center text-slate-500">Nenhum pedido no momento.</p>
      )}
    </div>
  )
}

