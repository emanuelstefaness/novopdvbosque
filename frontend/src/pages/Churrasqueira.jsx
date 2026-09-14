import { useState, useEffect, useMemo, useRef } from 'react'
import { getPedidosGrill, getProductionGrill, markPedidoChurrasqueiraReady } from '../api'
import { useSocket } from '../socket'
import PedidoElapsed from '../components/PedidoElapsed'
import {earliestCreatedAt} from '../utils/pedidoTime'
import { churrasqueiraComandaColumnClass, comandaOnlineLabel, isTipoPedidoOnline, pedidoOnlineBannerModel } from '../utils/comandaOnlineVisual'
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
    <div className="relative flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-gradient-to-br from-stone-200 via-amber-100/90 to-amber-50">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-1 transition-[padding] sm:px-2" style={{ paddingRight: totalMinimized ? 0 : '13rem' }}>
        <div className="mb-3 flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 px-1">
          <h1 className="text-xl font-bold text-amber-900/90">Churrasqueira</h1>
      <p className="production-subtitle">Pedidos organizados por comanda e prioridade de preparo.</p>
          <span
            className="rounded-full border border-amber-300/80 bg-amber-100/90 px-2.5 py-0.5 text-sm font-semibold text-amber-950 shadow-sm tabular-nums"
            title="Total de cards de comanda na fila"
          >
            {cards.length} {cards.length === 1 ? 'comanda na fila' : 'comandas na fila'}
          </span>
        </div>
        {error&&<p className="error-banner" role="alert">{error}</p>}
        <div className="flex min-h-0 flex-1 flex-row gap-4 overflow-x-auto overflow-y-auto pb-3">
        {cards.map((card) => {
          const tipoOn = card.items[0]?.comanda_tipo_online
          const colBanner = pedidoOnlineBannerModel(tipoOn)
          return (
          <div
            key={card.comanda_id}
            role="region"
            aria-label={`Produção da comanda ${card.comanda_id}`}
            className={churrasqueiraComandaColumnClass(tipoOn)}
          >
            {colBanner && (
              <div className={colBanner.wrap}>
                <p className={colBanner.titleClass}>{colBanner.title}</p>
                <p className={colBanner.subtitleClass}>{colBanner.subtitle}</p>
              </div>
            )}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className={`text-base font-bold ${tipoOn === 'delivery' ? 'text-sky-800' : tipoOn === 'retirada' ? 'text-teal-900' : 'text-amber-700'}`}>
                  Comanda {card.items[0]?.production_number || card.comanda_id}{card.items[0]?.production_number ? " (paga)" : ""} — Mesa {card.mesa}
                </span>
                {isTipoPedidoOnline(tipoOn) && (
                  <span className="ml-2 inline-block rounded-full bg-violet-200/90 px-2 py-0.5 text-[10px] font-black uppercase text-violet-900">
                    Pedir online
                  </span>
                )}
                {comandaOnlineLabel(tipoOn) && (
                  <span className="ml-2 inline-block rounded-full bg-black/10 px-2 py-0.5 text-[11px] font-bold text-slate-800">
                    {comandaOnlineLabel(tipoOn)}
                  </span>
                )}
                {card.items[0]?.waiter_name && <span className="ml-2 text-slate-500 text-xs">Garçom: {card.items[0].waiter_name}</span>}
                <div className="mt-0.5" title="Tempo desde o pedido mais antigo desta comanda na fila">
                  <PedidoElapsed createdAt={earliestCreatedAt(card.items)} className="text-xs" />
                </div>
              </div>
              <button
                type="button"
                className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-green-500"
                disabled={busy}
                onClick={() => setCardAllReady(card.items)}
              >
                Tudo pronto
              </button>
            </div>
            <ul className="space-y-2">
              {groupItemsByProduct(card.items).map((g) => (
                <li key={g.label} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200/70 bg-amber-50/90 px-2.5 py-2 shadow-sm">
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold text-slate-800">{g.total}</span>{' '}
                    <span className="text-slate-800">{g.displayBase}</span>
                    {g.pedidos.some((x) => Number(x.is_side)) && (
                      <span className="ml-1.5 inline-block rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-sky-900">Cozinha</span>
                    )}
                    <span className="ml-1 text-amber-600 text-xs">{formatByPoint(g.byPoint)}</span>
                    {g.observation && (
                      <p className="mt-1 rounded-md border border-violet-200/80 bg-violet-50 px-2 py-1 text-xs font-semibold leading-snug text-violet-800">
                        {g.observation}
                      </p>
                    )}
                    <span className="mt-0.5 block">
                      <PedidoElapsed createdAt={earliestCreatedAt(g.pedidos)} className="text-xs" />
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    {g.total > 1 && (
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-300 text-sm font-bold text-slate-800 hover:bg-slate-400"
                        onClick={() => markOneReady(g.pedidos)}
                        title="Dar pronto em 1 unidade"
                        aria-label={`Dar pronto em 1 unidade de ${g.displayBase}`}
                        disabled={busy}
                      >
                        −
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-500"
                      disabled={busy}
                      onClick={() => setCardAllReady(g.pedidos)}
                    >
                      {g.total>1?'Todos prontos':'Pronto'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          );
        })}
        </div>
        {cards.length === 0 && (
          <p className="py-8 text-center text-slate-500">Nenhum pedido no momento.</p>
        )}
      </div>

      {totalMinimized ? (
        <button
          type="button"
          onClick={() => setTotalMinimized(false)}
          className="fixed right-4 z-30 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-amber-600 shadow-lg hover:border-amber-400 hover:bg-slate-50"
          title="Abrir total para produção"
          style={{ top: '4.5rem' }}
        >
          Total produção
        </button>
      ) : (
        <div
          className="fixed right-0 top-16 z-20 flex h-[calc(100vh-4rem)] w-52 flex-col border-l border-amber-200/80 bg-gradient-to-b from-stone-50 to-amber-50/95 shadow-xl"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
            <h2 className="text-sm font-semibold text-amber-600">Total para produção</h2>
            <button
              type="button"
              onClick={() => setTotalMinimized(true)}
              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              title="Minimizar"
            >
              <span className="text-lg leading-none">×</span>
            </button>
          </div>
          <div className="flex-1 space-y-1 overflow-auto p-2 text-xs">
            {productionGrouped.map((g) => (
              <div key={g.name} className="rounded-lg bg-slate-100 px-2 py-1.5">
                <span className="font-medium text-slate-800">{g.total} {g.name}</span>
                {Object.keys(g.byPoint || {}).length > 0 && (
                  <span className="text-amber-600">{formatByPoint(g.byPoint)}</span>
                )}
              </div>
            ))}
            {production.pratoFeito &&
              typeof production.pratoFeito === 'object' &&
              !Array.isArray(production.pratoFeito) &&
              production.pratoFeito.pratos > 0 && (
                <div className="mt-3 border-t-2 border-amber-400/70 pt-2">
                  <div className="rounded-lg bg-amber-100 px-2 py-2">
                    <span className="font-semibold text-amber-900">
                      {production.pratoFeito.pratos} Prato Feito /{' '}
                      {production.pratoFeito.espetinhos === 1
                        ? '1 espetinho'
                        : `${production.pratoFeito.espetinhos} espetinhos`}
                    </span>
                  </div>
                </div>
              )}
            {productionGrouped.length === 0 && !production.pratoFeito && (
              <p className="p-2 text-slate-500">Nenhum pedido</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


