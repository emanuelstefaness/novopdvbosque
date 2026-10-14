import { useCallback, useEffect, useMemo, useState } from 'react'
import { getHistoricoComandas, getHistoricoComanda } from '../api'

const dinheiro = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const MEIOS = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Débito', credito: 'Crédito' }
const SITUACAO = { fechada: 'Paga', guardada: 'Guardada', aberta: 'Em aberto' }

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
        {d && (
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
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [aberta, setAberta] = useState(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      setDados(await getHistoricoComandas({ de, ate, q: q.trim() }))
    } catch (e) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }, [de, ate, q])

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
        Todas as comandas já cobradas, para consultar quando quiser. Toque em uma linha para ver os itens e como foi pago.
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
        <label className="history-search">Buscar
          <input type="search" placeholder="Número, mesa, garçom ou cliente" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {erro && <p className="error-banner" role="alert">{erro}</p>}

      {dados && (
        <p className="history-summary">
          <b>{dados.quantidade}</b> comanda(s) · total <b>{dinheiro(dados.total)}</b>
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
              <span className="history-number">{String(c.comanda_id).padStart(2, '0')}</span>
              <span className="history-main">
                <strong>{c.cliente_nome || (c.mesa ? `Mesa ${c.mesa}` : 'Comanda')}</strong>
                <small>
                  {c.mesa && c.cliente_nome ? `Mesa ${c.mesa} · ` : ''}
                  {c.garcom || '(Sem garçom)'}
                  {c.pessoas ? ` · ${c.pessoas} pessoa(s)` : ''}
                </small>
              </span>
              <span className="history-when">{quando(c.ultimo_pagamento)}</span>
              <span className={`history-status is-${c.situacao}`}>{SITUACAO[c.situacao] || c.situacao}</span>
              <b className="history-amount">{dinheiro(c.total)}</b>
            </button>
          ))}
        </div>
      )}

      {aberta && <Detalhe chave={aberta} onFechar={() => setAberta(null)} />}
    </div>
  )
}
