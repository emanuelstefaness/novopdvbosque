import './SimpleReports.css'

const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dateLabel = value => value.slice(0, 10).split('-').reverse().join('/')

function chartDays(days, from, to) {
  const count = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1
  const mode = count > 366 ? 'year' : count > 31 ? 'month' : 'day'
  const buckets = new Map()
  const keyFor = date => mode === 'year' ? date.slice(0, 4) : mode === 'month' ? date.slice(0, 7) : date
  for (let time = Date.parse(from); time <= Date.parse(to); time += 86400000) {
    buckets.set(keyFor(new Date(time).toISOString().slice(0, 10)), 0)
  }
  for (const row of days) {
    const key = keyFor(row.dia)
    if (buckets.has(key)) buckets.set(key, buckets.get(key) + Math.round(Number(row.total) * 100))
  }
  return { mode, rows: [...buckets].map(([key, cents]) => ({ key, total: cents / 100,
    label: mode === 'day' ? dateLabel(key) : mode === 'month' ? key.split('-').reverse().join('/') : key })) }
}

export default function SimpleReports({ faturamento, days, items, from, to }) {
  const chart = chartDays(days, from, to)
  const max = Math.max(1, ...chart.rows.map(row => row.total))
  const top = [...items].sort((a, b) => b.total_quantity - a.total_quantity).slice(0, 5)
  const maxQuantity = Math.max(1, ...top.map(row => row.total_quantity))
  return <div className="simple-reports">
    <div className="simple-report-metrics">
      <article><span>Total no período</span><strong>{money(faturamento.faturamento)}</strong><small>Consumo, couvert e serviço</small></article>
      <article><span>Atendimentos</span><strong>{faturamento.comandasCount || 0}</strong><small>Com recebimento no período</small></article>
      <article><span>Ticket médio</span><strong>{money(faturamento.ticketMedio)}</strong><small>Valor médio por atendimento</small></article>
    </div>
    <div className="simple-report-charts">
      <section className="simple-report-panel">
        <header><h2>Quanto entrou</h2><p>{chart.mode === 'day' ? 'Total por dia' : chart.mode === 'month' ? 'Total por mês' : 'Total por ano'} · valores em reais</p></header>
        {chart.mode !== 'day' && <p className="simple-report-note">Agrupado para facilitar a leitura. Inclui somente as datas selecionadas.</p>}
        <div className="simple-chart-scroll" tabIndex={0} aria-label="Gráfico de valores no período">
          {chart.rows.map(row => <div className="simple-chart-row" key={row.key}>
            <div><span>{row.label}</span><strong>{money(row.total)}</strong></div>
            <div className="simple-chart-track" aria-hidden="true"><i style={{ width: `${row.total / max * 100}%` }}/></div>
          </div>)}
        </div>
        {!faturamento.faturamento && <p className="simple-report-note">Nenhum valor registrado neste período.</p>}
      </section>
      <section className="simple-report-panel">
        <header><h2>Produtos mais vendidos</h2><p>Os 5 primeiros em quantidade</p></header>
        {top.length ? top.map((row, index) => <div className="simple-chart-row product" key={row.name}>
          <div><span>{index + 1}. {row.name}</span><strong>{row.total_quantity} un.</strong></div>
          <div className="simple-chart-track" aria-hidden="true"><i style={{ width: `${row.total_quantity / maxQuantity * 100}%` }}/></div>
          <small>{money(row.total_value)} em produtos</small>
        </div>) : <p className="simple-report-empty">Nenhum produto pago neste período.</p>}
      </section>
    </div>
    <p className="simple-report-note">Salão: pagamentos recebidos, incluindo adiantamentos. Online: pedidos entregues. Produtos são contados quando quitados. O dia começa à 01:00.</p>
  </div>
}
