import '../production.css'
import { useState, useEffect, useMemo, useRef } from 'react'
import { getPedidosBar, setPedidoSectorStatus } from '../api'
import { useSocket } from '../socket'
import PedidoElapsed from '../components/PedidoElapsed'
import {earliestCreatedAt} from '../utils/pedidoTime'
import { comandaOnlineLabel, isTipoPedidoOnline } from '../utils/comandaOnlineVisual'
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
    <div className="prod-page">
      <div className="prod-main">
        <div className="prod-head">
          <h1 className="prod-title">Bar</h1>
          <p className="prod-sub">Caipirinhas, doses e drinks — pedidos organizados por comanda.</p>
          <span className="prod-count">{cards.length} {cards.length === 1 ? 'comanda na fila' : 'comandas na fila'}</span>
        </div>
        <div className="prod-board">
          {cards.map((card) => {
            const tipoOn = card.items[0]?.comanda_tipo_online
            const modo = tipoOn === 'delivery' ? 'is-delivery' : tipoOn === 'retirada' ? 'is-retirada' : ''
            const numero = card.items[0]?.production_number || card.comanda_id
            return (
              <section key={card.comanda_id} className={`prod-card ${modo}`}>
                <div className="prod-card-head">
                  <div>
                    <h2 className="prod-card-title">
                      Comanda {numero}{card.items[0]?.production_number ? ' (paga)' : ''} — Mesa {card.mesa}
                    </h2>
                    <div className="prod-card-meta">
                      {isTipoPedidoOnline(tipoOn) && <span className={`prod-chip ${modo}`}>{comandaOnlineLabel(tipoOn)}</span>}
                      {card.items[0]?.waiter_name && <span>Garçom: {card.items[0].waiter_name}</span>}
                      <span title="Tempo desde o pedido mais antigo desta comanda na fila">
                        <PedidoElapsed createdAt={earliestCreatedAt(card.items)} className="text-xs" />
                      </span>
                    </div>
                  </div>
                  <button type="button" className="prod-btn" onClick={() => setCardAllReady(card.items)}>Tudo pronto</button>
                </div>
                <ul className="prod-items">
                  {card.items.map((p) => {
                    const obsLinha = observacaoParaProducao(p.observations)
                    const detalhe = [
                      p.caipirinha_base && `Base: ${p.caipirinha_base}`,
                      p.caipirinha_picole && 'Picolé',
                      p.dose_accompaniment,
                      obsLinha,
                    ].filter(Boolean).join(' • ')
                    return (
                      <li key={p.id} className="prod-item">
                        <span className="prod-qty">{p.quantity}</span>
                        <div style={{ minWidth: 0 }}>
                          <div className="prod-item-name">{p.item_name}</div>
                          {detalhe && <div className="prod-item-note">{detalhe}</div>}
                          <div className="prod-item-time">
                            <PedidoElapsed createdAt={p.created_at} className="text-xs" />
                            {p.launched_by && <span className="prod-by"> · por {p.launched_by}</span>}
                          </div>
                        </div>
                        <div className="prod-actions">
                          <button type="button" className="prod-btn is-small" onClick={() => setReady(p.id)}>Pronto</button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
        {cards.length === 0 && <p className="prod-empty">Nenhum pedido no momento.</p>}
      </div>
    </div>
  )
}
