import '../production.css'
import '../kds.css'
import { useState, useEffect, useMemo, useRef } from 'react'
import { getPedidosGrill, getProductionGrill, markPedidoChurrasqueiraReady } from '../api'
import { useSocket } from '../socket'
import ComandaCabecalho from '../components/producao/ComandaCabecalho'
import useAgora from '../hooks/useAgora'
import useComandasNovas from '../hooks/useComandasNovas'
import { earliestCreatedAt } from '../utils/pedidoTime'
import { tipoOnlineFromPedido } from '../utils/comandaOnlineVisual'
import { agruparPorComanda, autoriaDaComanda, autorDoItem, formatarDecorrido, prioridadeDaComanda } from '../utils/producao'
import { observacaoParaProducao } from '../utils/productionObservations'
import { textoResumoAddonsPedido } from '../utils/lancheAddons'

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
  const [carregado, setCarregado] = useState(false)
  const busyRef=useRef(false)
  const [production, setProduction] = useState({ byItem: [], pratoFeito: null })
  const [totalMinimized, setTotalMinimized] = useState(()=>window.matchMedia("(max-width: 600px)").matches)

  const load = async () => {
    const [pedidos, prod] = await Promise.all([getPedidosGrill(), getProductionGrill()])
    setList(pedidos)
    setCarregado(true)
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

  const cards = useMemo(() => agruparPorComanda(list), [list])

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
  const novas = useComandasNovas(cards.map((c) => c.comanda_id), carregado)
  const agora = useAgora()
  const totalItens = useMemo(() => list.reduce((s, p) => s + (Number(p.quantity) || 1), 0), [list])

  return (
    <div className="prod-page kds-page">
      <div className="prod-main">
        <div className="kds-topo">
          <div className="kds-topo-titulo">
            <h1 className="kds-titulo">Churrasqueira</h1>
            <p className="kds-sub">Pedidos organizados por comanda e prioridade de preparo.</p>
          </div>
          <div className="kds-indicadores" aria-label="Indicadores da fila">
            <span className="kds-indicador" title="Total de comandas na fila"><b>{cards.length}</b> {cards.length === 1 ? 'comanda na fila' : 'comandas na fila'}</span>
            <span className="kds-indicador" title="Unidades pendentes na churrasqueira"><b>{totalItens}</b> {totalItens === 1 ? 'item' : 'itens'} para produzir</span>
            {totalMinimized && (
              <button type="button" onClick={() => setTotalMinimized(false)} className="kds-btn is-neutro" title="Abrir total para produção">
                Total produção
              </button>
            )}
          </div>
        </div>
        {error && <p className="error-banner" role="alert">{error}</p>}
        <div className="kds-board">
          {cards.map((card) => {
            const { nivel } = prioridadeDaComanda(card.items, agora)
            const tipo = tipoOnlineFromPedido(card.items[0])
            const modo = tipo ? `is-${tipo}` : ''
            const { nomes } = autoriaDaComanda(card.items)
            return (
              <section
                key={card.comanda_id}
                aria-label={`Produção da comanda ${card.items[0]?.production_number || card.comanda_id}`}
                className={`kds-card is-${nivel} ${modo} ${novas.has(card.comanda_id) ? 'is-nova' : ''}`}
              >
                <span className="kds-faixa" aria-hidden="true" />
                <ComandaCabecalho itens={card.items} agora={agora} ocupado={busy} onTudoPronto={() => setCardAllReady(card.items)} />
                <ul className="kds-itens">
                  {groupItemsByProduct(card.items).map((g) => {
                    const pontos = formatByPoint(g.byPoint).trim().replace(/^\(|\)$/g, '')
                    const autores = autorDoItem(g.pedidos)
                    return (
                      <li key={g.label} className="kds-item">
                        <span className="kds-qtd" aria-label={`Quantidade ${g.total}`}>{g.total}</span>
                        <div className="kds-item-corpo">
                          <div className="kds-item-nome">
                            {g.displayBase}
                            {g.pedidos.some((x) => Number(x.is_side)) && <span className="kds-chip is-neutro" style={{ marginLeft: 6 }}>Cozinha</span>}
                          </div>
                          {pontos && <div className="kds-item-ponto">{pontos}</div>}
                          {g.observation && <div className="kds-item-obs">{g.observation}</div>}
                          <div className="kds-item-meta">
                            <span title="Tempo deste item na fila">{formatarDecorrido(earliestCreatedAt(g.pedidos), agora)}</span>
                            {autores.length > 0 && nomes.length > 1 && <span className="kds-item-autor">por {autores.join(', ')}</span>}
                          </div>
                        </div>
                        <div className="kds-acoes">
                          {g.total > 1 && (
                            <button
                              type="button"
                              className="kds-btn is-neutro is-compacto"
                              onClick={() => markOneReady(g.pedidos)}
                              title="Dar pronto em 1 unidade"
                              aria-label={`Dar pronto em 1 unidade de ${g.displayBase}`}
                              disabled={busy}
                            >
                              −1
                            </button>
                          )}
                          <button type="button" className="kds-btn" disabled={busy} onClick={() => setCardAllReady(g.pedidos)}>
                            {g.total > 1 ? 'Todos' : 'Pronto'}
                          </button>
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
