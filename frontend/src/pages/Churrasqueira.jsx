import '../production.css'
import { useState, useEffect, useMemo, useRef } from 'react'
import { getPedidosGrill, getProductionGrill, markPedidoChurrasqueiraReady } from '../api'
import { useSocket } from '../socket'
import PedidoElapsed from '../components/PedidoElapsed'
import {earliestCreatedAt} from '../utils/pedidoTime'
import { comandaOnlineLabel, isTipoPedidoOnline } from '../utils/comandaOnlineVisual'
import { observacaoParaProducao } from '../utils/productionObservations'
import { textoResumoAddonsPedido } from '../utils/lancheAddons'

/** Agrupa por comanda mantendo ordem de lançamento (primeiro pedido na fila define a ordem dos cards). Não usar Object + comanda_id numérico: o JS reordena chaves inteiras. */
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

function groupItemsByProduct(items) {
  const map = {}
  items.forEach((p) => {
    const add = textoResumoAddonsPedido(p)
    const base = p.prato_feito_espetinho_name ? `Prato Feito — ${p.prato_feito_espetinho_name}` : `${p.item_name}${add}`
    const obs = observacaoParaProducao(p.observations)
    const label = obs ? `${base} — ${obs}` : base
    if (!map[label]) {
      map[label] = { label, displayBase: base, observation: obs || null, total: 0, byPoint: {}, pedidos: [] }
    }
    const qty = p.quantity || 1
    map[label].total += qty
    const pt = p.meat_point || ''
    map[label].byPoint[pt] = (map[label].byPoint[pt] || 0) + qty
    map[label].pedidos.push(p)
  })
  return Object.values(map)
}

/** Nomes (sem repetir) de quem lançou os pedidos do grupo. */
function lancadoPor(pedidos) {
  return [...new Set((pedidos || []).map((p) => p.launched_by).filter(Boolean))].join(', ')
}

function formatByPoint(byPoint) {
  const parts = []
  if (byPoint['mal passado']) parts.push(`${byPoint['mal passado']} mal passado`)
  if (byPoint['ao ponto']) parts.push(`${byPoint['ao ponto']} ao ponto`)
  if (byPoint['bem passado']) parts.push(`${byPoint['bem passado']} bem passado`)
  return parts.length ? ` (${parts.join(', ')})` : ''
}

function groupProductionByItem(byItem) {
  const map = {}
  ;(byItem || []).forEach((p) => {
    const name = p.name
    if (!map[name]) map[name] = { name, total: 0, byPoint: {} }
    map[name].total += p.total || 0
    const pt = p.meat_point || ''
    map[name].byPoint[pt] = (map[name].byPoint[pt] || 0) + (p.total || 0)
  })
  return Object.values(map)
}

/** API nova: { pratos, espetinhos } | null; legado: [{ espetinho_name, total }] */
function normalizePratoFeitoSummary(pf) {
  if (!pf) return null
  if (typeof pf === 'object' && !Array.isArray(pf) && pf.pratos != null) {
    const pratos = Number(pf.pratos) || 0
    if (pratos <= 0) return null
    return { pratos, espetinhos: Math.max(0, Number(pf.espetinhos) || 0) }
  }
  if (Array.isArray(pf) && pf[0]?.total > 0 && pf[0]?.espetinho_name === 'Prato Feito') {
    const t = Number(pf[0].total) || 0
    return { pratos: t, espetinhos: t }
  }
  return null
}

export default function Churrasqueira() {
  const [list, setList] = useState([])
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const busyRef=useRef(false)
  const [production, setProduction] = useState({ byItem: [], pratoFeito: null })
  const [totalMinimized, setTotalMinimized] = useState(()=>window.matchMedia("(max-width: 600px)").matches)

  const load = async () => {
    const [pedidos, prod] = await Promise.all([getPedidosGrill(), getProductionGrill()])
    setList(pedidos)
    setProduction({
      byItem: prod.byItem || [],
      pratoFeito: normalizePratoFeitoSummary(prod.pratoFeito)
    })
  }

  const loadTimeoutRef = useRef(null)
  useEffect(() => { const initial=setTimeout(()=>void load(),0); return () => { clearTimeout(initial); if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current) } }, [])
  useSocket(() => {
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current)
    loadTimeoutRef.current = setTimeout(() => { load(); loadTimeoutRef.current = null }, 400)
  })

  const cards = useMemo(() => groupByComanda(list), [list])

  const subtractFromProduction = (itemsToRemove) => {
    const byKey = {}
    let pfPratosSub = 0
    let pfEspSub = 0
    itemsToRemove.forEach((p) => {
      const qty = p.quantity || 1
      const isPf = Number(p.item_is_prato_feito) === 1
      if (isPf) {
        pfPratosSub += qty
        if (p.prato_feito_espetinho_id) pfEspSub += qty
        if (p.prato_feito_espetinho_name) {
          byKey[`${p.prato_feito_espetinho_name}|${p.meat_point || ''}`] =
            (byKey[`${p.prato_feito_espetinho_name}|${p.meat_point || ''}`] || 0) + qty
        }
      } else {
        byKey[`${p.item_name}|${p.meat_point || ''}`] = (byKey[`${p.item_name}|${p.meat_point || ''}`] || 0) + qty
      }
    })
    setProduction((prev) => {
      let nextPf = prev.pratoFeito
      const cur = prev.pratoFeito
      if (cur && typeof cur === 'object' && !Array.isArray(cur) && cur.pratos != null) {
        const np = Math.max(0, cur.pratos - pfPratosSub)
        const ne = Math.max(0, cur.espetinhos - pfEspSub)
        nextPf = np > 0 ? { pratos: np, espetinhos: ne } : null
      }
      return {
        ...prev,
        byItem: (prev.byItem || [])
          .map((p) => {
            const key = `${p.name}|${p.meat_point || ''}`
            return { ...p, total: Math.max(0, (p.total || 0) - (byKey[key] || 0)) }
          })
          .filter((p) => p.total > 0),
        pratoFeito: nextPf
      }
    })
  }

  const setCardAllReady = async (items) => {
    if (items.length === 0 || busyRef.current) return
    busyRef.current=true;setBusy(true);setError('')
    const ids = new Set(items.map((i) => i.id))
    subtractFromProduction(items)
    setList((prev) => prev.filter((p) => !ids.has(p.id)))
    try {
      await Promise.all(items.map((p) => markPedidoChurrasqueiraReady(p.id)))
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = setTimeout(() => { load(); loadTimeoutRef.current = null }, 150)
    } catch(e) {
      setError(e.message);load()
    } finally {busyRef.current=false;setBusy(false)}
  }

  const markOneReady = async (pedidos) => {
    const one=pedidos.find(p=>!Number(p.is_side))??pedidos[0]
    if(!one||busyRef.current)return
    busyRef.current=true;setBusy(true);setError('')
    try { await markPedidoChurrasqueiraReady(one.id,true); await load() }
    catch(e){setError(e.message);await load()}
    finally{busyRef.current=false;setBusy(false)}
  }

  const productionGrouped = useMemo(() => groupProductionByItem(production.byItem), [production.byItem])

  return (
    <div className="prod-page">
      <div className="prod-main">
        <div className="prod-head">
          <h1 className="prod-title">Churrasqueira</h1>
          <p className="prod-sub">Pedidos organizados por comanda e prioridade de preparo.</p>
          <span className="prod-count" title="Total de cards de comanda na fila">
            {cards.length} {cards.length === 1 ? 'comanda na fila' : 'comandas na fila'}
          </span>
          {totalMinimized && (
            <button type="button" onClick={() => setTotalMinimized(false)} className="prod-btn is-ghost prod-toggle" title="Abrir total para produção">
              Total produção
            </button>
          )}
        </div>
        {error && <p className="error-banner" role="alert">{error}</p>}
        <div className="prod-board">
          {cards.map((card) => {
            const tipoOn = card.items[0]?.comanda_tipo_online
            const modo = tipoOn === 'delivery' ? 'is-delivery' : tipoOn === 'retirada' ? 'is-retirada' : ''
            const numero = card.items[0]?.production_number || card.comanda_id
            return (
              <section
                key={card.comanda_id}
                aria-label={`Produção da comanda ${card.comanda_id}`}
                className={`prod-card ${modo}`}
              >
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
                  <button type="button" className="prod-btn" disabled={busy} onClick={() => setCardAllReady(card.items)}>
                    Tudo pronto
                  </button>
                </div>
                <ul className="prod-items">
                  {groupItemsByProduct(card.items).map((g) => (
                    <li key={g.label} className="prod-item">
                      <span className="prod-qty">{g.total}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="prod-item-name">
                          {g.displayBase}
                          {g.pedidos.some((x) => Number(x.is_side)) && <span className="prod-chip" style={{ marginLeft: 6 }}>Cozinha</span>}
                        </div>
                        {formatByPoint(g.byPoint) && <div className="prod-item-sub">{formatByPoint(g.byPoint).trim().replace(/^\(|\)$/g, '')}</div>}
                        {g.observation && <div className="prod-item-note">{g.observation}</div>}
                        <div className="prod-item-time">
                          <PedidoElapsed createdAt={earliestCreatedAt(g.pedidos)} className="text-xs" />
                          {lancadoPor(g.pedidos) && <span className="prod-by"> · por {lancadoPor(g.pedidos)}</span>}
                        </div>
                      </div>
                      <div className="prod-actions">
                        {g.total > 1 && (
                          <button
                            type="button"
                            className="prod-btn is-ghost"
                            onClick={() => markOneReady(g.pedidos)}
                            title="Dar pronto em 1 unidade"
                            aria-label={`Dar pronto em 1 unidade de ${g.displayBase}`}
                            disabled={busy}
                          >
                            −1
                          </button>
                        )}
                        <button type="button" className="prod-btn is-small" disabled={busy} onClick={() => setCardAllReady(g.pedidos)}>
                          {g.total > 1 ? 'Todos' : 'Pronto'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
        {cards.length === 0 && <p className="prod-empty">Nenhum pedido no momento.</p>}
      </div>
      {!totalMinimized && (
        <aside className="prod-side" aria-label="Total para produção">
          <div className="prod-side-head">
            <h2>Total para produção</h2>
            <button type="button" className="prod-close" onClick={() => setTotalMinimized(true)} title="Fechar" aria-label="Fechar total para produção">
              ×
            </button>
          </div>
          <div className="prod-side-body">
            {productionGrouped.map((g) => (
              <div key={g.name} className="prod-total-row">
                <b>{g.total}</b>
                <span>
                  {g.name}
                  {formatByPoint(g.byPoint) && <small>{formatByPoint(g.byPoint).trim().replace(/^\(|\)$/g, '')}</small>}
                </span>
              </div>
            ))}
            {production.pratoFeito &&
              typeof production.pratoFeito === 'object' &&
              !Array.isArray(production.pratoFeito) &&
              production.pratoFeito.pratos > 0 && (
                <div className="prod-total-pf">
                  <div className="prod-total-row">
                    <b>{production.pratoFeito.pratos}</b>
                    <span>
                      Prato Feito
                      <small>
                        {production.pratoFeito.espetinhos === 1 ? '1 espetinho' : `${production.pratoFeito.espetinhos} espetinhos`}
                      </small>
                    </span>
                  </div>
                </div>
              )}
            {productionGrouped.length === 0 && !production.pratoFeito && <p className="prod-empty">Nenhum pedido</p>}
          </div>
        </aside>
      )}
    </div>
  )
}
