import '../production.css'
import { useState, useEffect, useRef, useMemo } from 'react'
import { getPedidosKitchen, setPedidoSectorStatus, fulfillKitchenUnit } from '../api'
import { useSocket } from '../socket'
import PedidoElapsed from '../components/PedidoElapsed'
import {earliestCreatedAt} from '../utils/pedidoTime'
import { comandaOnlineLabel, isPedidoOnline, tipoOnlineFromPedido } from '../utils/comandaOnlineVisual'
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
    <div className="prod-page">
      <div className="prod-main">
        <div className="prod-head">
          <h1 className="prod-title">Cozinha</h1>
          <p className="prod-sub">Pedidos organizados por comanda e prioridade de preparo.</p>
        </div>
        <div className="prod-totals">
          <h2 className="prod-totals-title">Total para produção</h2>
          {productionByItem.map((p) => (
            <div key={p.name} className="prod-total-card">
              <span className="num">{p.total}</span>
              <span className="nome">{p.name}</span>
              {p.deliveryTotal > 0 && (
                <div className="prod-card-meta">
                  <span className="prod-chip is-delivery">
                    {p.deliveryTotal} delivery{p.deliveryTotal !== p.total ? ` · ${p.total - p.deliveryTotal} salão` : ''}
                  </span>
                </div>
              )}
              {p.lines.length > 0 && (
                <ul>
                  {p.lines.map((l) => (
                    <li key={l.text}>{l.qty} — {l.text}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {pratoFeitoSummary && (
            <div key="prato-feito" className="prod-total-card is-pf">
              <span className="num">{pratoFeitoSummary.total}</span>
              <span className="nome">Prato Feito</span>
              {pratoFeitoSummary.deliveryTotal > 0 && (
                <div className="prod-card-meta">
                  <span className="prod-chip is-delivery">
                    {pratoFeitoSummary.deliveryTotal} delivery
                    {pratoFeitoSummary.deliveryTotal !== pratoFeitoSummary.total
                      ? ` · ${pratoFeitoSummary.total - pratoFeitoSummary.deliveryTotal} salão`
                      : ''}
                  </span>
                </div>
              )}
              {pratoFeitoSummary.lines.length > 0 && (
                <ul>
                  {pratoFeitoSummary.lines.map((l) => (
                    <li key={l.text}>{l.qty} — {l.text}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {productionByItem.length === 0 && !pratoFeitoSummary && (
            <p className="prod-empty" style={{ gridColumn: '1 / -1', padding: 12 }}>Nenhum pedido</p>
          )}
        </div>

        <div className="prod-list">
          {outrosPedidos.map((p) => {
            const obsShow = observacaoParaProducao(p.observations)
            const addLab = textoResumoAddonsPedido(p)
            const tipo = tipoOnlineFromPedido(p)
            const modo = tipo === 'delivery' ? 'is-delivery' : tipo === 'retirada' ? 'is-retirada' : ''
            return (
              <div key={p.id} className={`prod-row ${modo}`}>
                <div style={{ minWidth: 0 }}>
                  <div className="prod-row-title">
                    <em>{p.quantity}x</em> {p.item_name}
                    {addLab ? <span className="prod-chip" style={{ marginLeft: 6 }}>{addLab}</span> : null}
                  </div>
                  <div className="prod-row-meta">
                    {comandaOnlineLabel(p.comanda_tipo_online) && <span className={`prod-chip ${modo}`}>{comandaOnlineLabel(p.comanda_tipo_online)}</span>}
                    {p.mesa && isPedidoOnline(p) && <span>{p.mesa}</span>}
                    {p.waiting_grill && <span className="warn">aguardando churrasqueira</span>}
                    {p.launched_by ? <span>Lançado por <b>{p.launched_by}</b></span> : p.waiter_name && <span>Garçom: {p.waiter_name}</span>}
                    <PedidoElapsed createdAt={p.created_at} className="text-xs" />
                  </div>
                  {obsShow && <div className="prod-item-note">Obs.: {obsShow}</div>}
                </div>
                <div className="prod-actions">
                  {(p.quantity || 1) > 1 && (
                    <button type="button" className="prod-btn is-ghost" title="Menos 1 na produção" onClick={() => fulfillOneKitchenUnit(p)}>−1</button>
                  )}
                  <button
                    type="button"
                    className="prod-btn"
                    title={(p.quantity || 1) > 1 ? 'Marcar todas as unidades deste pedido' : undefined}
                    onClick={() => markKitchenFullyReady(p.id)}
                  >
                    {(p.quantity || 1) > 1 ? 'Tudo pronto' : 'Pronto'}
                  </button>
                </div>
              </div>
            )
          })}
          {pratoFeitoPedidos.length > 0 && (
            <div className="prod-row is-pf">
              <div style={{ minWidth: 0 }}>
                <div className="prod-row-title"><em>{totalPratoFeito}x</em> Prato Feito</div>
                <div className="prod-row-meta">
                  {pratoFeitoTemOnline && (
                    <span className={`prod-chip ${pratoFeitoTemDelivery ? 'is-delivery' : 'is-retirada'}`}>
                      {pratoFeitoTemDelivery && pratoFeitoTemRetirada
                        ? 'Online: entrega + retirada'
                        : pratoFeitoTemDelivery
                          ? 'Online: entrega (embalar)'
                          : 'Online: retirada no balcão'}
                    </span>
                  )}
                  {pratoFeitoPedidos[0]?.waiter_name && <span>Garçom: {pratoFeitoPedidos[0].waiter_name}</span>}
                  <PedidoElapsed createdAt={earliestCreatedAt(pratoFeitoPedidos)} className="text-xs" />
                </div>
              </div>
              <div className="prod-actions">
                <button type="button" className="prod-btn is-ghost" title="Diminuir 1" onClick={() => pratoFeitoMinusOne()}>−1</button>
                <button type="button" className="prod-btn" onClick={setAllPratoFeitoReady}>Pronto (todos)</button>
              </div>
            </div>
          )}
          {list.length === 0 && <p className="prod-empty">Nenhum pedido no momento.</p>}
        </div>
      </div>
    </div>
  )
}
