import { textoResumoAddonsPedido } from './lancheAddons'

/** Largura útil da comanda (bobina 80 mm) — igual ao Caixa / impressão interna */
export const COMANDA_IMPRESSAO_LARGURA_MM = 80

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtMoney(n) {
  const v = Number(n)
  if (Number.isNaN(v)) return '0,00'
  return v.toFixed(2).replace('.', ',')
}

/** SQLite localtime 'YYYY-MM-DD HH:MM:SS' → legível */
export function fmtDataHora(sqlLocal) {
  if (!sqlLocal) return ''
  const s = String(sqlLocal).trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})(?::\d{2})?/)
  if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}`
  return s
}

function sharedComandaStyles(w) {
  return `
  @page { margin: 3mm 2mm; size: ${w}mm auto; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: ${w}mm;
    max-width: ${w}mm;
  }
  .folha {
    width: ${w}mm;
    max-width: ${w}mm;
    padding: 2mm 2.5mm;
    font-family: ui-monospace, "Cascadia Mono", "Consolas", monospace;
    font-size: 11pt;
    line-height: 1.35;
    color: #000;
  }
  .empresa {
    text-align: center;
    font-size: 14pt;
    font-weight: 800;
    letter-spacing: 0.04em;
    margin: 0 0 0.5mm;
  }
  .datahora {
    text-align: center;
    font-size: 10pt;
    font-weight: 600;
    margin: 0 0 2mm;
    color: #222;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    font-size: 11pt;
    font-weight: 700;
    padding-bottom: 1mm;
    margin-bottom: 1.5mm;
    border-bottom: 1px solid #000;
  }
  table.itens {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin-bottom: 2mm;
  }
  table.itens td {
    padding: 0.75mm 0;
    vertical-align: top;
    border-bottom: 1px solid #ccc;
  }
  table.itens .q {
    width: 11%;
    font-weight: 700;
    text-align: left;
    font-variant-numeric: tabular-nums;
  }
  table.itens .d {
    width: 56%;
    word-break: break-word;
    padding-right: 1mm;
  }
  table.itens .v {
    width: 33%;
    text-align: right;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .totais {
    margin-top: 2mm;
    padding-top: 1.5mm;
    border-top: 1px solid #000;
    text-align: right;
  }
  .tot-linha {
    font-variant-numeric: tabular-nums;
    margin-bottom: 0.9mm;
  }
  .tot-base {
    font-size: 10.5pt;
    font-weight: 700;
  }
  .tot-serv {
    font-size: 10.5pt;
    font-weight: 600;
    color: #222;
  }
  .tot-pagar {
    font-size: 13pt;
    font-weight: 800;
    margin-top: 1mm;
    padding-top: 1mm;
    border-top: 1px solid #000;
    margin-bottom: 0;
  }
  .info-block {
    margin-bottom: 2mm;
    padding-bottom: 1.5mm;
    border-bottom: 1px solid #ccc;
    font-size: 10.5pt;
  }
  .info-block div { margin-bottom: 0.65mm; }
  .info-block .lab { font-weight: 700; }
  .addr-titulo {
    font-size: 10pt;
    font-weight: 700;
    margin: 0 0 0.5mm;
  }
  .addr-linha {
    font-size: 10.5pt;
    word-break: break-word;
    margin: 0 0 0.4mm;
  }
  .obs-pedido {
    font-size: 10pt;
    margin-bottom: 2mm;
    padding: 1mm 0;
    border-bottom: 1px solid #ccc;
    word-break: break-word;
  }
  @media print {
    html, body, .folha {
      width: ${w}mm !important;
      max-width: ${w}mm !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }`
}

/** Comanda de mesa (resposta de GET /api/print/comanda/:id) */
export function buildComandaPrintHtml(d) {
  const w = COMANDA_IMPRESSAO_LARGURA_MM
  const pedidos = d.pedidos || []
  const subtotal = d.subtotal != null
    ? Number(d.subtotal)
    : pedidos.reduce((s, p) => s + p.quantity * p.unit_price, 0)

  const couvPend = d.couvert_pendente != null ? Number(d.couvert_pendente) : 0
  const taxPct = d.service_tax_percent != null ? Number(d.service_tax_percent) : 0
  const taxVal = d.service_tax != null ? Number(d.service_tax) : 0
  const totalSem = d.total_sem_taxa_garcom != null ? Number(d.total_sem_taxa_garcom) : subtotal + couvPend
  const totalCom = d.total != null ? Number(d.total) : totalSem + taxVal

  const rows = pedidos
    .map((p) => {
      const add = textoResumoAddonsPedido(p)
      const obs = p.observations ? ` (${String(p.observations)})` : ''
      const nome = escHtml(`${p.item_name}${add}${obs}`)
      const linha = `${p.quantity}×`
      const sub = fmtMoney(p.quantity * p.unit_price)
      return `<tr><td class="q">${linha}</td><td class="d">${nome}</td><td class="v">R$ ${sub}</td></tr>`
    })
    .join('')

  const dh = fmtDataHora(d.printed_at)
  const cpfRaw = String(d.client_cpf ?? '').trim()
  const cpfBlock = cpfRaw
    ? `<div class="info-block" style="margin-top:0;border-bottom:1px solid #000;"><div><span class="lab">CPF (NFC-e):</span> ${escHtml(cpfRaw)}</div></div>`
    : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Comanda ${escHtml(d.comanda)}</title>
<style>${sharedComandaStyles(w)}</style>
</head>
<body>
  <div class="folha">
    <div class="empresa">${escHtml(d.logo)}</div>
    <div class="datahora">Data e horário: ${escHtml(dh || '—')}</div>
    <div class="meta">
      <span>Comanda ${escHtml(d.comanda)}</span>
      <span>Mesa ${escHtml(d.mesa ?? '—')}</span>
    </div>
    ${cpfBlock}
    <table class="itens" role="presentation"><tbody>${rows}</tbody></table>

    <div class="totais">
      <div class="tot-linha tot-base">TOTAL: R$ ${fmtMoney(totalSem)}</div>
      <div class="tot-linha tot-serv">+ SERVIÇO ${d.mixed_service ? '(por origem)' : `(${taxPct}%)`}: R$ ${fmtMoney(taxVal)}</div>
      ${Number(d.credit)>0?`<div class="tot-linha">− ADIANTAMENTO: R$ ${fmtMoney(d.credit)}</div>`:''}
      <div class="tot-linha tot-pagar">Total a pagar: R$ ${fmtMoney(totalCom)}</div>
    </div>
  </div>
</body>
</html>`
}

const FORMA_PAGAMENTO_LABEL = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartao_debito: 'Cartão de débito',
  cartao_credito: 'Cartão de crédito',
  vale: 'Vale-refeição / alimentação',
}

/** Rótulo para UI e impressão */
export function formatFormaPagamentoLabel(raw) {
  const k = String(raw || '').trim().toLowerCase()
  if (FORMA_PAGAMENTO_LABEL[k]) return FORMA_PAGAMENTO_LABEL[k]
  if (raw && String(raw).trim()) return String(raw).trim()
  return '—'
}

function labelFormaPagamentoHtml(raw) {
  const k = String(raw || '').trim().toLowerCase()
  if (FORMA_PAGAMENTO_LABEL[k]) return escHtml(FORMA_PAGAMENTO_LABEL[k])
  if (raw && String(raw).trim()) return escHtml(String(raw).trim())
  return '—'
}

function linhasEnderecoPedidoOnline(d) {
  const rua = String(d.endereco_rua ?? '').trim()
  const num = String(d.endereco_numero ?? '').trim()
  const comp = String(d.endereco_complemento ?? '').trim()
  const bairro = String(d.endereco_bairro ?? '').trim()
  const ref = String(d.endereco_referencia ?? '').trim()
  const linhas = []
  if (rua || num || comp) {
    const p1 = [rua, num].filter(Boolean).join(', ')
    linhas.push((p1 || rua || num) + (comp ? ` — ${comp}` : ''))
  }
  if (bairro) linhas.push(bairro)
  if (ref) linhas.push(`Ref.: ${ref}`)
  return linhas
}

/** Comanda de pedido online (GET /api/print/order/:id) — mesmo papel 80 mm que a comanda do Caixa */
export function buildPedidoOnlinePrintHtml(d) {
  const w = COMANDA_IMPRESSAO_LARGURA_MM
  const items = d.items || []
  const tipo = String(d.tipo || '').toLowerCase()
  const tipoLabel = tipo === 'delivery' ? 'Delivery' : tipo === 'retirada' ? 'Retirada' : escHtml(String(d.tipo || '—'))

  const rows = items
    .map((p) => {
      const obs = p.observations ? ` (${String(p.observations)})` : ''
      const nome = escHtml(`${p.item_name}${obs}`)
      const linha = `${p.quantity}×`
      const sub = fmtMoney(p.quantity * p.unit_price)
      return `<tr><td class="q">${linha}</td><td class="d">${nome}</td><td class="v">R$ ${sub}</td></tr>`
    })
    .join('')

  const dh = fmtDataHora(d.created_at)
  const enderecoLinhas = linhasEnderecoPedidoOnline(d)
  const mostrarEndereco = tipo === 'delivery' && enderecoLinhas.length > 0
  const obs = String(d.observacoes || '').trim()

  const email = String(d.cliente_email || '').trim()

  let enderecoHtml = ''
  if (tipo === 'delivery') {
    if (mostrarEndereco) {
      enderecoHtml = `
    <p class="addr-titulo">Endereço de entrega</p>
    ${enderecoLinhas.map((l) => `<p class="addr-linha">${escHtml(l)}</p>`).join('')}`
    } else {
      enderecoHtml = `<p class="addr-linha"><em>Endereço não cadastrado neste pedido.</em></p>`
    }
  } else {
    enderecoHtml = `<p class="addr-linha">Retirada no balcão do restaurante.</p>`
  }

  const obsHtml = obs
    ? `<div class="obs-pedido"><span class="lab">Obs.:</span> ${escHtml(obs)}</div>`
    : ''

  const subtotalItens = d.subtotal_itens != null
    ? Number(d.subtotal_itens)
    : items.reduce((s, p) => s + Number(p.quantity || 0) * Number(p.unit_price || 0), 0)
  const valorTotal = d.valor_total != null ? Number(d.valor_total) : subtotalItens
  const taxaEntrega = tipo === 'delivery'
    ? (d.taxa_entrega != null ? Number(d.taxa_entrega) : Math.max(0, valorTotal - subtotalItens))
    : 0
  const entregaGratis = tipo === 'delivery' && taxaEntrega === 0

  const totaisHtml = tipo === 'delivery'
    ? `
    <div class="tot-linha tot-base">Subtotal (itens): R$ ${fmtMoney(subtotalItens)}</div>
    <div class="tot-linha tot-serv">Taxa de entrega: ${entregaGratis ? 'GRÁTIS' : `R$ ${fmtMoney(taxaEntrega)}`}</div>
    <div class="tot-linha tot-pagar">Total: R$ ${fmtMoney(valorTotal)}</div>`
    : `
    <div class="tot-linha tot-pagar">Total: R$ ${fmtMoney(valorTotal)}</div>`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Pedido online #${escHtml(d.numero)}</title>
<style>${sharedComandaStyles(w)}</style>
</head>
<body>
  <div class="folha">
    <div class="empresa">${escHtml(d.logo)}</div>
    <div class="datahora">Data e horário: ${escHtml(dh || '—')}</div>
    <div class="meta">
      <span>Pedido #${escHtml(d.numero)}</span>
      <span>${tipoLabel}</span>
    </div>
    <div class="info-block">
      <div><span class="lab">Cliente:</span> ${escHtml(d.cliente_nome)}</div>
      <div><span class="lab">Tel:</span> ${escHtml(d.cliente_telefone)}</div>
      ${email ? `<div><span class="lab">E-mail:</span> ${escHtml(email)}</div>` : ''}
      <div><span class="lab">Pagamento:</span> ${labelFormaPagamentoHtml(d.forma_pagamento)}</div>
    </div>
    ${enderecoHtml}
    ${obsHtml}
    <table class="itens" role="presentation"><tbody>${rows}</tbody></table>
    <div class="totais">${totaisHtml}
    </div>
  </div>
</body>
</html>`
}

export function openComandaPrintWindow(html, title) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.document.title = title
  setTimeout(() => {
    try {
      win.focus()
      win.print()
    } finally {
      win.close()
    }
  }, 200)
}
