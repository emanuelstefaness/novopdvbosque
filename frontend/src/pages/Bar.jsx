import '../production.css'
import '../kds.css'
import { useState, useEffect, useMemo, useRef } from 'react'
import { getPedidosBar, setPedidoSectorStatus } from '../api'
import { useSocket } from '../socket'
import ComandaCabecalho from '../components/producao/ComandaCabecalho'
import useAgora from '../hooks/useAgora'
import useComandasNovas from '../hooks/useComandasNovas'
import { tipoOnlineFromPedido } from '../utils/comandaOnlineVisual'
import { observacaoParaProducao } from '../utils/productionObservations'
import { agruparPorComanda, autoriaDaComanda, formatarDecorrido, prioridadeDaComanda } from '../utils/producao'

export default function Bar() {
  const [list, setList] = useState([])
  const [carregado, setCarregado] = useState(false)
  const [ocupados, setOcupados] = useState(() => new Set())
  const loadTimeoutRef = useRef(null)
  const agora = useAgora()

  const load = async () => {
    const data = await getPedidosBar()
    setList(data)
    setCarregado(true)
  }

  useEffect(() => { const initial=setTimeout(()=>void load(),0); return () => { clearTimeout(initial); if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current) } }, [])
  useSocket(() => {
    if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current)
    loadTimeoutRef.current = setTimeout(() => { load(); loadTimeoutRef.current = null }, 350)
  })

  const cards = useMemo(() => agruparPorComanda(list), [list])
  const novas = useComandasNovas(cards.map((c) => c.comanda_id), carregado)
  const totalItens = useMemo(() => list.reduce((s, p) => s + (Number(p.quantity) || 1), 0), [list])

  const marcarOcupado = (ids, ligado) =>
    setOcupados((prev) => {
      const n = new Set(prev)
      ids.forEach((i) => (ligado ? n.add(i) : n.delete(i)))
      return n
    })

  const setReady = async (pedidoId) => {
    marcarOcupado([pedidoId], true)
    setList((prev) => prev.filter((p) => p.id !== pedidoId))
    try {
      await setPedidoSectorStatus(pedidoId, 'bar', 'ready')
    } finally {
      marcarOcupado([pedidoId], false)
      load()
    }
  }

  const setCardAllReady = async (items) => {
    const ids = items.map((p) => p.id)
    marcarOcupado(ids, true)
    setList((prev) => prev.filter((p) => !ids.includes(p.id)))
    try {
      for (const p of items) {
        await setPedidoSectorStatus(p.id, 'bar', 'ready')
      }
    } finally {
      marcarOcupado(ids, false)
      load()
    }
  }

  return (
    <div className="prod-page kds-page">
      <div className="prod-main">
        <div className="kds-topo">
          <div className="kds-topo-titulo">
            <h1 className="kds-titulo">Bar</h1>
            <p className="kds-sub">Caipirinhas, doses e drinks — pedidos organizados por comanda e prioridade de preparo.</p>
          </div>
          <div className="kds-indicadores" aria-label="Indicadores da fila">
            <span className="kds-indicador"><b>{cards.length}</b> {cards.length === 1 ? 'comanda na fila' : 'comandas na fila'}</span>
            <span className="kds-indicador"><b>{totalItens}</b> {totalItens === 1 ? 'item' : 'itens'} para produzir</span>
          </div>
        </div>
        <div className="kds-board">
          {cards.map((card) => {
            const { nivel } = prioridadeDaComanda(card.items, agora)
            const tipo = tipoOnlineFromPedido(card.items[0])
            const modo = tipo ? `is-${tipo}` : ''
            const { nomes } = autoriaDaComanda(card.items)
            const ocupado = card.items.some((p) => ocupados.has(p.id))
            return (
              <section
                key={card.comanda_id}
                aria-label={`Produção da comanda ${card.items[0]?.production_number || card.comanda_id}`}
                className={`kds-card is-${nivel} ${modo} ${novas.has(card.comanda_id) ? 'is-nova' : ''}`}
              >
                <span className="kds-faixa" aria-hidden="true" />
                <ComandaCabecalho itens={card.items} agora={agora} ocupado={ocupado} onTudoPronto={() => setCardAllReady(card.items)} />
                <ul className="kds-itens">
                  {card.items.map((p) => {
                    const obsLinha = observacaoParaProducao(p.observations)
                    const detalhe = [
                      p.caipirinha_base && `Base: ${p.caipirinha_base}`,
                      p.caipirinha_picole && 'Picolé',
                      p.dose_accompaniment,
                      obsLinha,
                    ].filter(Boolean).join(' • ')
                    const autor = p.launched_by && nomes.length > 1 ? p.launched_by : ''
                    return (
                      <li key={p.id} className="kds-item">
                        <span className="kds-qtd" aria-label={`Quantidade ${p.quantity}`}>{p.quantity}</span>
                        <div className="kds-item-corpo">
                          <div className="kds-item-nome">{p.item_name}</div>
                          {detalhe && <div className="kds-item-obs">{detalhe}</div>}
                          <div className="kds-item-meta">
                            <span title="Tempo deste item na fila">{formatarDecorrido(p.created_at, agora)}</span>
                            {autor && <span className="kds-item-autor">por {autor}</span>}
                          </div>
                        </div>
                        <div className="kds-acoes">
                          <button type="button" className="kds-btn" disabled={ocupados.has(p.id)} onClick={() => setReady(p.id)}>Pronto</button>
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
