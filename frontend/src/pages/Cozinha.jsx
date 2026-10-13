import '../production.css'
import '../kds.css'
import { useState, useEffect, useRef, useMemo } from 'react'
import { getPedidosKitchen, setPedidoSectorStatus, fulfillKitchenUnit } from '../api'
import { useSocket } from '../socket'
import ComandaCabecalho from '../components/producao/ComandaCabecalho'
import useAgora from '../hooks/useAgora'
import useComandasNovas from '../hooks/useComandasNovas'
import { agruparPorComanda, autoriaDaComanda, formatarDecorrido, prioridadeDaComanda } from '../utils/producao'
import {earliestCreatedAt} from '../utils/pedidoTime'
import { tipoOnlineFromPedido } from '../utils/comandaOnlineVisual'
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
  const [carregado, setCarregado] = useState(false)
  const loadTimeoutRef = useRef(null)
  const agora = useAgora()

  const load = async () => {
    const pedidos = await getPedidosKitchen()
    setList(pedidos)
    setCarregado(true)
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

  /** Marca como pronto todos os pedidos da comanda na cozinha (mesma ação do botão de cada item). */
  const setCardAllReadyKitchen = async (items) => {
    const ids = new Set(items.map((p) => p.id))
    setList((prev) => prev.filter((p) => !ids.has(p.id)))
    try {
      await Promise.all(items.map((p) => setPedidoSectorStatus(p.id, 'kitchen', 'ready')))
    } finally {
      load()
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

  const cardsPorComanda = useMemo(() => agruparPorComanda(outrosPedidos), [outrosPedidos])
  const novas = useComandasNovas(cardsPorComanda.map((c) => c.comanda_id), carregado)
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
    <div className="prod-page kds-page">
      <div className="prod-main">
        <div className="prod-head">
          <h1 className="kds-titulo">Cozinha</h1>
          <p className="kds-sub">Pedidos organizados por comanda e prioridade de preparo.</p>
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

        <div className="kds-board">
          {cardsPorComanda.map((card) => {
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
                <ComandaCabecalho itens={card.items} agora={agora} onTudoPronto={() => setCardAllReadyKitchen(card.items)} />
                <ul className="kds-itens">
                  {card.items.map((p) => {
                    const obsShow = observacaoParaProducao(p.observations)
                    const addLab = textoResumoAddonsPedido(p)
                    const qtd = p.quantity || 1
                    const autor = p.launched_by && nomes.length > 1 ? p.launched_by : ''
                    return (
                      <li key={p.id} className="kds-item">
                        <span className="kds-qtd" aria-label={`Quantidade ${qtd}`}>{qtd}</span>
                        <div className="kds-item-corpo">
                          <div className="kds-item-nome">
                            {p.item_name}
                            {addLab ? <span className="kds-chip is-neutro" style={{ marginLeft: 6 }}>{addLab}</span> : null}
                          </div>
                          {p.waiting_grill && <div className="kds-item-aviso">aguardando churrasqueira</div>}
                          {obsShow && <div className="kds-item-obs">{obsShow}</div>}
                          <div className="kds-item-meta">
                            <span title="Tempo deste item na fila">{formatarDecorrido(p.created_at, agora)}</span>
                            {autor && <span className="kds-item-autor">por {autor}</span>}
                          </div>
                        </div>
                        <div className="kds-acoes">
                          {qtd > 1 && (
                            <button type="button" className="kds-btn is-neutro is-compacto" title="Menos 1 na produção" aria-label={`Menos 1 unidade de ${p.item_name}`} onClick={() => fulfillOneKitchenUnit(p)}>−1</button>
                          )}
                          <button
                            type="button"
                            className="kds-btn"
                            title={qtd > 1 ? 'Marcar todas as unidades deste pedido' : undefined}
                            onClick={() => markKitchenFullyReady(p.id)}
                          >
                            {qtd > 1 ? 'Todos' : 'Pronto'}
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
          {pratoFeitoPedidos.length > 0 && (
            <section className="kds-card is-pf" aria-label="Prato Feito">
              <span className="kds-faixa" aria-hidden="true" />
              <header className="kds-head">
                <div className="kds-head-top">
                  <h2 className="kds-numero">Prato Feito</h2>
                  <span className="kds-tempo">{formatarDecorrido(earliestCreatedAt(pratoFeitoPedidos), agora)}</span>
                </div>
                <div className="kds-head-linha kds-head-autoria">
                  {autoriaDaComanda(pratoFeitoPedidos).nomes.length > 0 && (
                    <span className="kds-garcom"><span className="kds-garcom-nome">{autoriaDaComanda(pratoFeitoPedidos).nomes.join(', ')}</span></span>
                  )}
                </div>
                <div className="kds-head-rodape">
                  <div className="kds-badges">
                    {pratoFeitoTemOnline && (
                      <span className={`kds-chip is-${pratoFeitoTemDelivery ? 'delivery' : 'retirada'}`}>
                        {pratoFeitoTemDelivery && pratoFeitoTemRetirada
                          ? 'Online: entrega + retirada'
                          : pratoFeitoTemDelivery
                            ? 'Online: entrega (embalar)'
                            : 'Online: retirada no balcão'}
                      </span>
                    )}
                  </div>
                </div>
              </header>
              <ul className="kds-itens">
                <li className="kds-item">
                  <span className="kds-qtd">{totalPratoFeito}</span>
                  <div className="kds-item-corpo"><div className="kds-item-nome">Prato Feito</div></div>
                  <div className="kds-acoes">
                    <button type="button" className="kds-btn is-neutro is-compacto" title="Diminuir 1" aria-label="Diminuir 1 prato feito" onClick={() => pratoFeitoMinusOne()}>−1</button>
                    <button type="button" className="kds-btn" onClick={setAllPratoFeitoReady}>Pronto (todos)</button>
                  </div>
                </li>
              </ul>
            </section>
          )}
        </div>
        {list.length === 0 && <p className="prod-empty">Nenhum pedido no momento.</p>}
      </div>
    </div>
  )
}
