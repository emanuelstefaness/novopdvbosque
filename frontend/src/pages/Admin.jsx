import SimpleReports from '../components/SimpleReports'
import Icon from '../components/Icon'
import { businessDate } from '../utils/businessDate'
import { useSocket } from '../socket'
import { useState, useEffect, useMemo, useRef } from 'react'
import {
  getReportsVendasComandas,
  getReportsVendasPorDia,
  getReportsItensMaisVendidos,
  getReportsPorCategoria,
  getReportsFaturamento,
  getReportsChurrasqueira,
  getReportsPorGarcom,
  getReportsCancelamentos
} from '../api'

function todayISO() {
  return businessDate()
}

function formatMoney(n) {
  const v = Number(n || 0)
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDateBR(iso) {
  if (!iso || iso.length < 10) return iso
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export default function Admin() {
  const [periodMode, setPeriodMode] = useState('day')
  const [dateSingle, setDateSingle] = useState(todayISO)
  const [dateFrom, setDateFrom] = useState(() => {
    const t = new Date()
    return new Date(t.getFullYear(), t.getMonth(), 1).toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(todayISO)

  const { from, to } = useMemo(() => {
    if (periodMode === 'day') {
      const d = dateSingle.slice(0, 10)
      return { from: d, to: d }
    }
    let a = dateFrom.slice(0, 10)
    let b = dateTo.slice(0, 10)
    if (a > b) [a, b] = [b, a]
    return { from: a, to: b }
  }, [periodMode, dateSingle, dateFrom, dateTo])

  const periodLabel =
    from === to
      ? formatDateBR(from)
      : `${formatDateBR(from)} a ${formatDateBR(to)}`

  const [vendasComandas, setVendasComandas] = useState([])
  const [vendasPorDia, setVendasPorDia] = useState([])
  const [itensMaisVendidos, setItensMaisVendidos] = useState([])
  const [porCategoria, setPorCategoria] = useState([])
  const [faturamento, setFaturamento] = useState(null)
  const [churrasqueira, setChurrasqueira] = useState([])
  const [porGarcom, setPorGarcom] = useState([])
  const [cancelamentos, setCancelamentos] = useState(null)
  const [tab, setTab] = useState('faturamento')
  const [err, setErr] = useState(null)
  const [loading,setLoading]=useState(false)
  const requestId=useRef(0)

  const load = async () => {
    const request=++requestId.current
    setLoading(true)
    setErr(null)
    try {
      const [vc, vd, itens, cat, fat, churr, gar, canc] = await Promise.all([
        getReportsVendasComandas(from, to),
        getReportsVendasPorDia(from, to),
        getReportsItensMaisVendidos(from, to, 50),
        getReportsPorCategoria(from, to),
        getReportsFaturamento(from, to),
        getReportsChurrasqueira(from, to),
        getReportsPorGarcom(from, to),
        getReportsCancelamentos(from, to)
      ])
      if(request!==requestId.current)return
      setVendasComandas(vc)
      setVendasPorDia(vd)
      setItensMaisVendidos(itens)
      setPorCategoria(cat)
      setFaturamento(fat)
      setChurrasqueira(churr)
      setPorGarcom(gar)
      setCancelamentos(canc)
    } catch (e) {
      if(request===requestId.current)setErr(e?.message || 'Erro ao carregar relatórios')
    } finally {if(request===requestId.current)setLoading(false)}
  }

  useEffect(() => {
    const timer=setTimeout(()=>void load(),0)
    return()=>{clearTimeout(timer);requestId.current++}
  }, [from, to])

  useSocket(()=>void load())
  const exportCsv=()=>{
    const rows=[['Recebimento','Comanda','Mesa','Data','Itens','Couvert','Serviço','Total'],...vendasComandas.map(r=>[r.key,r.comanda_id,r.mesa,r.closed_at,r.subtotal,r.couvert_valor,r.taxa_servico_valor,r.total])];
    const text='\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/^(\s*[=+@-])/ ,"'$1").replaceAll('"','""')+'"').join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='vendas-'+from+'-'+to+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const ready = !loading && !err && faturamento?.from === from && faturamento?.to === to
  const choosePeriod = (kind) => {
    const today = todayISO()
    const d = new Date(today + 'T12:00:00Z')
    if (kind === 'yesterday') d.setUTCDate(d.getUTCDate() - 1)
    if (kind === 'week') d.setUTCDate(d.getUTCDate() - 6)
    const start = kind === 'month' ? today.slice(0, 8) + '01' : d.toISOString().slice(0, 10)
    setDateFrom(start); setDateTo(kind === 'yesterday' ? start : today)
    setPeriodMode('range')
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-12">
      <header className="page-heading"><div><span className="eyebrow">GESTÃO E RESULTADOS</span>
        <h1 className="text-2xl font-bold tracking-tight text-[#ccd2e1]">Relatórios</h1>
        <p className="mt-2 max-w-3xl text-sm text-[#b5bfcf]">
          Recebimentos, produtos e desempenho do restaurante. Selecione o período para consultar.
        </p>
      </div><button className="btn btn-secondary" onClick={exportCsv} disabled={!ready||!vendasComandas.length}><Icon name="download" size={17}/>Exportar vendas</button></header>

      <div className="report-period rounded-2xl border border-[#2b3036] bg-[#212226] p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-[#8f9db2]">Período</p>
        <div className="simple-period-shortcuts">{[['today','Hoje'],['yesterday','Ontem'],['week','Últimos 7 dias'],['month','Este mês']].map(([id,label]) => <button type="button" className="btn btn-secondary" key={id} onClick={() => choosePeriod(id)}>{label}</button>)}</div>
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-lg px-3 py-2 text-sm font-medium ${periodMode === 'day' ? 'bg-[#3e3b2b] text-[#b94f13]' : 'bg-[#242a30] text-[#b5bfcf] hover:bg-[#2b3036]'}`}
            onClick={() => setPeriodMode('day')}
          >
            Um dia
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-2 text-sm font-medium ${periodMode === 'range' ? 'bg-[#3e3b2b] text-[#b94f13]' : 'bg-[#242a30] text-[#b5bfcf] hover:bg-[#2b3036]'}`}
            onClick={() => setPeriodMode('range')}
          >
            Intervalo
          </button>
        </div>
        {periodMode === 'day' ? (
          <label className="flex flex-wrap items-center gap-2 text-sm text-[#bbc6d6]">
            <span>Data</span>
            <input
              type="date"
              value={dateSingle}
              onChange={(e) => setDateSingle(e.target.value)}
              className="rounded border border-[#2d353e] bg-[#212226] px-3 py-2 text-[#c5cedc]"
            />
          </label>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm text-[#bbc6d6]">
              De
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded border border-[#2d353e] bg-[#212226] px-3 py-2 text-[#c5cedc]"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-[#bbc6d6]">
              Até
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded border border-[#2d353e] bg-[#212226] px-3 py-2 text-[#c5cedc]"
              />
            </label>
          </div>
        )}
        <p className="mt-3 text-sm text-[#bbc6d6]">
          <span className="font-semibold text-[#ccd2e1]">{periodLabel}</span>
          <span className="text-[#8f9db2]"> · Dia operacional a partir de 01:00.</span>
        </p>
        <button type="button" className="btn btn-primary mt-4" disabled={loading} onClick={() => void load()}>
          {loading ? 'Carregando…' : 'Atualizar dados'}
        </button>
        {err && <p className="mt-2 text-sm text-[#d11d1d]">{err}</p>}
      </div>

      {!ready && <p role="status" className="simple-report-status">{err ? 'Não foi possível carregar os dados. Tente atualizar novamente.' : 'Carregando o período selecionado…'}</p>}
      {ready && <>
      <SimpleReports faturamento={faturamento} days={vendasPorDia} items={itensMaisVendidos} from={from} to={to}/>
      <details className="simple-report-details"><summary>Ver detalhes dos relatórios</summary><div className="space-y-5 pt-5">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-[#2b3036] bg-[#21272c]/80 p-2">
        {[
          ['faturamento', 'Resumo'],
          ['comandas', 'Comandas'],
          ['evolucao', 'Por dia'],
          ['itens', 'Mais vendidos'],
          ['categoria', 'Categorias'],
          ['churrasqueira', 'Churrasqueira'],
          ['garcom', 'Garçons'],
          ['cancelamentos', 'Cancelamentos'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === id ? 'bg-[#212226] text-[#b94f13] shadow ring-1 ring-[#ffd117]' : 'text-[#b5bfcf] hover:bg-[#212226]/70'}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'faturamento' && faturamento && (
        <div className="rounded-2xl border border-[#2b3036] bg-[#212226] p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#ccd2e1]">Composição do faturamento</h2>
          {faturamento.business_day_note && <p className="mt-2 text-xs text-[#8f9db2]">{faturamento.business_day_note}</p>}
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-[#21272c] p-4">
              <dt className="text-xs font-semibold uppercase text-[#8f9db2]">Taxa de serviço</dt>
              <dd className="mt-1 text-xl font-bold text-[#ccd2e1]">{formatMoney(faturamento.taxaServico)}</dd>
            </div>
            <div className="rounded-xl bg-[#21272c] p-4">
              <dt className="text-xs font-semibold uppercase text-[#8f9db2]">Couvert recebido</dt>
              <dd className="mt-1 text-xl font-bold text-[#ccd2e1]">{formatMoney(faturamento.couvert)}</dd>
            </div>
            <div className="rounded-xl bg-[#21272c] p-4">
              <dt className="text-xs font-semibold uppercase text-[#8f9db2]">Pessoas (soma)</dt>
              <dd className="mt-1 text-xl font-bold text-[#ccd2e1]">{faturamento.totalPessoas ?? 0}</dd>
            </div>
            <div className="rounded-xl bg-[#21272c] p-4">
              <dt className="text-xs font-semibold uppercase text-[#8f9db2]">Ticket por pessoa</dt>
              <dd className="mt-1 text-xl font-bold text-[#ccd2e1]">{formatMoney(faturamento.ticketPorPessoa)}</dd>
            </div>
          </dl>
        </div>
      )}

      {tab === 'comandas' && (
        <div className="overflow-hidden rounded-2xl border border-[#2b3036] bg-[#212226] shadow-sm">
          <div className="border-b border-[#242a30] bg-[#21272c] px-6 py-4">
            <h2 className="font-bold text-[#ccd2e1]">Comandas — {periodLabel}</h2>
            <p className="mt-1 text-sm text-[#8f9db2]">Itens (incluindo couvert) + serviço por recebimento.</p>
          </div>
          <div className="max-h-[min(70vh,560px)] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[#212226] shadow-sm">
                <tr className="border-b border-[#2b3036] text-xs uppercase text-[#8f9db2]">
                  <th className="px-6 py-3">Comanda</th>
                  <th className="px-4 py-3">Mesa</th>
                  <th className="px-4 py-3">Recebimento</th>
                  <th className="hidden px-4 py-3 text-right md:table-cell">Itens</th>
                  <th className="px-6 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {vendasComandas.map((c) => (
                  <tr key={c.key || c.comanda_id} className="border-b border-[#21272c] hover:bg-[#21272c]/80">
                    <td className="px-6 py-3 font-semibold text-[#ccd2e1]">{c.comanda_id}</td>
                    <td className="px-4 py-3 text-[#bbc6d6]">{c.mesa ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-[#b5bfcf]">
                      {c.closed_at ? `${formatDateBR(c.closed_at.slice(0, 10))} ${c.closed_at.length > 10 ? c.closed_at.slice(11, 16) : ''}` : '—'}
                    </td>
                    <td className="hidden px-4 py-3 text-right text-xs text-[#8f9db2] md:table-cell">{formatMoney(c.subtotal)}</td>
                    <td className="px-6 py-3 text-right font-bold text-[#d45f05]">{formatMoney(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {vendasComandas.length === 0 && <p className="p-8 text-center text-[#8f9db2]">Nenhuma comanda neste período.</p>}
          </div>
        </div>
      )}

      {tab === 'evolucao' && (
        <div className="overflow-hidden rounded-2xl border border-[#2b3036] bg-[#212226] shadow-sm">
          <div className="border-b border-[#242a30] bg-[#21272c] px-6 py-4">
            <h2 className="font-bold text-[#ccd2e1]">Faturamento por dia operacional — {periodLabel}</h2>
            {from === to && <p className="mt-1 text-sm text-[#8f9db2]">Um único dia: uma linha corresponde ao resumo.</p>}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2b3036] text-left text-xs uppercase text-[#8f9db2]">
                <th className="px-6 py-3">Dia</th>
                <th className="px-6 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {vendasPorDia.map((r) => (
                <tr key={r.dia} className="border-b border-[#21272c] hover:bg-[#21272c]/80">
                  <td className="px-6 py-3 font-medium text-[#c5cedc]">{formatDateBR(r.dia)}</td>
                  <td className="px-6 py-3 text-right font-bold text-[#d45f05]">{formatMoney(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {vendasPorDia.length === 0 && <p className="p-8 text-center text-[#8f9db2]">Nenhum dado neste período.</p>}
        </div>
      )}

      {tab === 'itens' && (
        <div className="overflow-hidden rounded-2xl border border-[#2b3036] bg-[#212226] shadow-sm">
          <div className="border-b border-[#242a30] bg-[#21272c] px-6 py-4">
            <h2 className="font-bold text-[#ccd2e1]">Produtos mais vendidos — {periodLabel}</h2>
            <p className="mt-1 text-sm text-[#8f9db2]">Quantidade e valor dos itens pagos no período. Adiantamentos entram no faturamento; os produtos aparecem quando são quitados.</p>
          </div>
          <div className="max-h-[min(70vh,560px)] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#212226]">
                <tr className="border-b border-[#2b3036] text-xs uppercase text-[#8f9db2]">
                  <th className="w-12 px-4 py-3 text-center">#</th>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3 text-right">Qtd</th>
                  <th className="px-6 py-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {itensMaisVendidos.map((r, i) => (
                  <tr key={`${r.name}-${i}`} className="border-b border-[#21272c] hover:bg-[#21272c]/80">
                    <td className="px-4 py-2.5 text-center text-xs font-bold text-[#414c5a]">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-[#ccd2e1]">{r.name}</td>
                    <td className="px-4 py-2.5 text-right text-[#bbc6d6]">{r.total_quantity}</td>
                    <td className="px-6 py-2.5 text-right font-semibold text-[#c5cedc]">{formatMoney(r.total_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {itensMaisVendidos.length === 0 && <p className="p-8 text-center text-[#8f9db2]">Nenhum item.</p>}
          </div>
        </div>
      )}

      {tab === 'categoria' && (
        <div className="overflow-hidden rounded-2xl border border-[#2b3036] bg-[#212226] shadow-sm">
          <div className="border-b border-[#242a30] bg-[#21272c] px-6 py-4">
            <h2 className="font-bold text-[#ccd2e1]">Vendas por categoria — {periodLabel}</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2b3036] text-xs uppercase text-[#8f9db2]">
                <th className="px-6 py-3 text-left">Categoria</th>
                <th className="px-6 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {porCategoria.map((r) => (
                <tr key={r.category_name} className="border-b border-[#21272c] hover:bg-[#21272c]/80">
                  <td className="px-6 py-3 font-medium text-[#ccd2e1]">{r.category_name}</td>
                  <td className="px-6 py-3 text-right font-semibold text-[#c5cedc]">{formatMoney(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {porCategoria.length === 0 && <p className="p-8 text-center text-[#8f9db2]">Nenhuma venda.</p>}
        </div>
      )}

      {tab === 'churrasqueira' && (
        <div className="overflow-hidden rounded-2xl border border-[#2b3036] bg-[#212226] shadow-sm">
          <div className="border-b border-[#242a30] bg-[#21272c] px-6 py-4">
            <h2 className="font-bold text-[#ccd2e1]">Vendas da churrasqueira — {periodLabel}</h2>
            <p className="mt-1 text-sm text-[#8f9db2]">Unidades pagas de produtos da churrasqueira.</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2b3036] text-xs uppercase text-[#8f9db2]">
                <th className="px-6 py-3 text-left">Item</th>
                <th className="px-6 py-3 text-right">Unidades</th>
              </tr>
            </thead>
            <tbody>
              {churrasqueira.map((r) => (
                <tr key={r.name} className="border-b border-[#21272c] hover:bg-[#21272c]/80">
                  <td className="px-6 py-3 font-medium text-[#ccd2e1]">{r.name}</td>
                  <td className="px-6 py-3 text-right font-semibold">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {churrasqueira.length === 0 && <p className="p-8 text-center text-[#8f9db2]">Nenhum item no setor churrasqueira.</p>}
        </div>
      )}

      {tab === 'garcom' && (
        <div className="overflow-hidden rounded-2xl border border-[#2b3036] bg-[#212226] shadow-sm">
          <div className="border-b border-[#242a30] bg-[#21272c] px-6 py-4">
            <h2 className="font-bold text-[#ccd2e1]">Por garçom — {periodLabel}</h2>
            <p className="mt-1 text-sm text-[#8f9db2]">Faturamento total por comanda atribuída.</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2b3036] text-xs uppercase text-[#8f9db2]">
                <th className="px-6 py-3 text-left">Garçom</th>
                <th className="px-4 py-3 text-right">Comandas</th>
                <th className="px-6 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {porGarcom.map((r) => (
                <tr key={r.waiter_name} className="border-b border-[#21272c] hover:bg-[#21272c]/80">
                  <td className="px-6 py-3 font-medium text-[#ccd2e1]">{r.waiter_name}</td>
                  <td className="px-4 py-3 text-right text-[#b5bfcf]">{r.comandas_count}</td>
                  <td className="px-6 py-3 text-right font-bold text-[#d45f05]">{formatMoney(r.total_faturamento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {porGarcom.length === 0 && <p className="p-8 text-center text-[#8f9db2]">Nenhuma comanda.</p>}
        </div>
      )}

      {tab === 'cancelamentos' && cancelamentos && (
        <div className="overflow-hidden rounded-2xl border border-[#2b3036] bg-[#212226] shadow-sm">
          <div className="border-b border-[#242a30] bg-[#21272c] px-6 py-4">
            <h2 className="font-bold text-[#ccd2e1]">Cancelamentos — {periodLabel}</h2>
            <p className="mt-1 text-sm text-[#8f9db2]">Cancelamentos efetivos, preservados mesmo após reutilizar a comanda.</p>
          </div>
          <div className="grid gap-4 p-6 sm:grid-cols-2">
            <div className="rounded-xl border border-[#ffd117] bg-[#312e22] p-4">
              <p className="text-xs font-bold uppercase text-[#b94f13]">Linhas canceladas</p>
              <p className="mt-2 text-2xl font-black text-[#c84804]">{cancelamentos.resumo?.linhas_canceladas ?? 0}</p>
            </div>
            <div className="rounded-xl border border-[#2b3036] bg-[#21272c] p-4">
              <p className="text-xs font-bold uppercase text-[#b5bfcf]">Valor de referência</p>
              <p className="mt-2 text-2xl font-black text-[#ccd2e1]">{formatMoney(cancelamentos.resumo?.valor_cancelado)}</p>
            </div>
          </div>
          <div className="border-t border-[#242a30] px-6 pb-6">
            <h3 className="mb-3 text-sm font-bold uppercase text-[#8f9db2]">Por item</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2b3036] text-xs uppercase text-[#8f9db2]">
                  <th className="py-2 text-left">Item</th>
                  <th className="py-2 text-right">Qtd</th>
                  <th className="py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {(cancelamentos.porItem || []).map((r, i) => (
                  <tr key={`${r.name}-${i}`} className="border-b border-[#21272c]">
                    <td className="py-2 font-medium text-[#ccd2e1]">{r.name}</td>
                    <td className="py-2 text-right text-[#b5bfcf]">{r.total_quantity}</td>
                    <td className="py-2 text-right">{formatMoney(r.total_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(cancelamentos.porItem || []).length === 0 && <p className="py-4 text-center text-[#8f9db2]">Nenhum cancelamento neste período.</p>}
          </div>
        </div>
      )}
      </div></details>
      </>}
    </div>
  )
}
