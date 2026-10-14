import { useCallback, useEffect, useMemo, useState } from 'react'
import { getHistoricoComandas, getHistoricoComanda } from '../api'

const dinheiro = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const MEIOS = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Débito', credito: 'Crédito' }
const SITUACAO = { fechada: 'Paga', guardada: 'Guardada', aberta: 'Em aberto' }
const ORIGENS = [['todas', 'Todas'], ['salao', 'Salão'], ['online', 'Pedir online'], ['ifood', 'iFood']]
const textoSituacao = (c) => c.situacao_texto || SITUACAO[c.situacao] || c.situacao

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const diasAtras = (n) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return iso(d)
}
function quando(sql) {
  if (!sql) return ''
  const [d, h] = String(sql).split(' ')
  const [a, m, dia] = d.split('-')
  return `${dia}/${m}/${a} ${String(h || '').slice(0, 5)}`
}

function Detalhe({ chave, onFechar }) {
  const [d, setD] = useState(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    let vivo = true
    getHistoricoComanda(chave)
      .then((r) => vivo && setD(r))
      .catch((e) => vivo && setErro(e.message))
    return () => {
      vivo = false
    }
  }, [chave])

  return (
    <div className="account-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <section className="held-modal history-detail" role="dialog" aria-modal="true" aria-labelledby="hist-title">
        <button type="button" className="account-modal-close icon-button" aria-label="Fechar" onClick={onFechar}>×</button>
        {erro && <p className="error-banner" role="alert">{erro}</p>}
        {!d && !erro && <p>Carregando…</p>}
        {d && d.tipo_registro === 'online' && (
          <>
            <h2 id="hist-title">{d.canal} {d.numero} · {d.cliente_nome}</h2>
            <p className="history-meta">
              {d.situacao === 'entregue' ? 'Entregue' : d.situacao === 'cancelado' ? 'Cancelado' : d.situacao} · feito em {quando(d.criado_em)}
              {d.concluido_em && d.situacao === 'entregue' ? ` · concluído ${quando(d.concluido_em)}` : ''}
            </p>
            {d.cliente_telefone && <p className="history-meta">Telefone: {d.cliente_telefone}</p>}
            {d.endereco && <p className="history-meta">Entrega: {d.endereco}</p>}
            {d.motivo_cancelamento && <p className="history-obs">Motivo do cancelamento: {d.motivo_cancelamento}</p>}
            {d.observacao && <p className="history-obs">Obs.: {d.observacao}</p>}
            <h3>Itens</h3>
            <table className="history-table">
              <thead><tr><th>Item</th><th className="num">Qtd.</th><th className="num">Unitário</th><th className="num">Total</th></tr></thead>
              <tbody>
                {d.itens.map((i, k) => (
                  <tr key={k}>
                    <td>{i.nome}{i.observacao ? <small className="history-item-obs"> · {i.observacao}</small> : null}</td>
                    <td className="num">{i.quantidade}</td>
                    <td className="num">{dinheiro(i.unitario)}</td>
                    <td className="num">{dinheiro(i.unitario * i.quantidade)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="history-totals">
              <span>Itens <b>{dinheiro(d.subtotal)}</b></span>
              {d.entrega_e_ajustes !== 0 && <span>Entrega e ajustes <b>{dinheiro(d.entrega_e_ajustes)}</b></span>}
              <span className="history-total">Total <b>{dinheiro(d.total)}</b></span>
            </div>
            <p className="history-meta">Pagamento: {d.forma_pagamento || '—'}{d.pagamento_status ? ` (${d.pagamento_status})` : ''}</p>
          </>
        )}
        {d && d.tipo_registro !== 'online' && (
          <>
            <h2 id="hist-title">
              Comanda {String(d.comanda_id).padStart(2, '0')}
              {d.mesa ? ` · Mesa ${d.mesa}` : ''}
              {d.cliente_nome ? ` · ${d.cliente_nome}` : ''}
            </h2>
            <p className="history-meta">
              {SITUACAO[d.situacao] || d.situacao} · {quando(d.ultimo_pagamento)}
              {d.garcom ? ` · Garçom: ${d.garcom}` : ''}
              {d.pessoas ? ` · ${d.pessoas} pessoa(s)` : ''}
            </p>
            {d.observacao && <p className="history-obs">Obs.: {d.observacao}</p>}
            {d.cliente_telefone && <p className="history-meta">Telefone: {d.cliente_telefone}</p>}

            <h3>Itens</h3>
            <table className="history-table">
              <thead><tr><th>Item</th><th className="num">Qtd.</th><th className="num">Unitário</th><th className="num">Total</th></tr></thead>
              <tbody>
                {d.itens.map((i) => (
                  <tr key={`${i.nome}-${i.unitario}`}>
                    <td>{i.nome}</td>
                    <td className="num">{i.quantidade}</td>
                    <td className="num">{dinheiro(i.unitario)}</td>
                    <td className="num">{dinheiro(i.unitario * i.quantidade)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="history-totals">
              <span>Subtotal <b>{dinheiro(d.subtotal)}</b></span>
              {d.servico > 0 && <span>Serviço <b>{dinheiro(d.servico)}</b></span>}
              {d.couvert > 0 && <span>Couvert (incluso) <b>{dinheiro(d.couvert)}</b></span>}
              <span className="history-total">Total <b>{dinheiro(d.total)}</b></span>
            </div>

            <h3>Pagamentos</h3>
            <ul className="history-payments">
              {d.pagamentos.map((p, i) => (
                <li key={i}>
                  <span>{quando(p.pago_em)}{p.adiantamento ? ' · Adiantamento' : ''}</span>
                  <span>{p.meios.length ? p.meios.map((m) => `${MEIOS[m.meio] || m.meio} ${dinheiro(m.valor)}`).join(' + ') : '—'}</span>
                  <b>{dinheiro(p.valor)}</b>
                  {p.operador && <small>{p.operador}{p.troco > 0 ? ` · troco ${dinheiro(p.troco)}` : ''}</small>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}

export default function Historico() {
  const [de, setDe] = useState(diasAtras(6))
  const [ate, setAte] = useState(iso(new Date()))
  const [q, setQ] = useState('')
  const [origem, setOrigem] = useState('todas')
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [aberta, setAberta] = useState(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      setDados(await getHistoricoComandas({ de, ate, q: q.trim(), origem }))
    } catch (e) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }, [de, ate, q, origem])

  useEffect(() => {
    const t = setTimeout(carregar, 250)
    return () => clearTimeout(t)
  }, [carregar])

  const atalhos = useMemo(
    () => [
      ['Hoje', 0],
      ['7 dias', 6],
      ['30 dias', 29],
      ['90 dias', 89],
    ],
    [],
  )

  return (
    <div className="history-page">
      <h1 className="mb-1 text-xl font-bold text-[var(--ink)]">Histórico de comandas</h1>
      <p className="mb-4 text-sm text-[var(--muted)]">
        Comandas do salão já cobradas e pedidos online e do iFood de dias anteriores. Toque em uma linha para ver os itens e como foi pago.
      </p>

      <div className="history-filters">
        <label>De<input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} /></label>
        <label>Até<input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} /></label>
        <div className="history-shortcuts">
          {atalhos.map(([rotulo, n]) => (
            <button key={rotulo} type="button" className="btn btn-secondary" onClick={() => { setDe(diasAtras(n)); setAte(iso(new Date())) }}>
              {rotulo}
            </button>
          ))}
        </div>
        <label>Origem
          <select value={origem} onChange={(e) => setOrigem(e.target.value)}>
            {ORIGENS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </label>
        <label className="history-search">Buscar
          <input type="search" placeholder="Número, mesa, garçom, cliente ou telefone" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {erro && <p className="error-banner" role="alert">{erro}</p>}

      {dados && (
        <p className="history-summary">
          <b>{dados.quantidade}</b> registro(s) · total recebido <b>{dinheiro(dados.total)}</b>
          {carregando ? ' · atualizando…' : ''}
        </p>
      )}

      {dados && dados.comandas.length === 0 && !carregando && (
        <div className="empty-panel">Nenhuma comanda encontrada neste período.</div>
      )}

      {dados && dados.comandas.length > 0 && (
        <div className="history-list" role="list">
          {dados.comandas.map((c) => (
            <button key={c.session_key} type="button" role="listitem" className="history-row" onClick={() => setAberta(c.session_key)}>
              <span className={`history-number ${c.origem !== 'salao' ? 'is-online' : ''}`}>{c.numero}</span>
              <span className="history-main">
                <strong>{c.cliente_nome || (c.mesa ? `Mesa ${c.mesa}` : 'Comanda')}</strong>
                <small>
                  {c.origem === 'salao' ? (
                    <>
                      {c.mesa && c.cliente_nome ? `Mesa ${c.mesa} · ` : ''}
                      {c.garcom || '(Sem garçom)'}
                      {c.pessoas ? ` · ${c.pessoas} pessoa(s)` : ''}
                    </>
                  ) : (
                    <>{c.canal}{c.telefone ? ` · ${c.telefone}` : ''}</>
                  )}
                </small>
              </span>
              <span className="history-when">{quando(c.ultimo_pagamento)}</span>
              <span className={`history-status is-${c.situacao}`}>{textoSituacao(c)}</span>
              <b className={`history-amount ${c.conta_no_total ? '' : 'is-muted'}`}>{dinheiro(c.total)}</b>
            </button>
          ))}
        </div>
      )}

      {aberta && <Detalhe chave={aberta} onFechar={() => setAberta(null)} />}
    </div>
  )
}
