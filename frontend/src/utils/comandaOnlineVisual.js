/** `comanda_tipo_online` vindo da API (delivery | retirada | null). Aceita alias do objeto. */
export function tipoOnlineFromPedido(p) {
  const raw = p?.comanda_tipo_online ?? p?.tipo_online
  if (raw == null || String(raw).trim() === '') return null
  const t = String(raw).trim().toLowerCase()
  if (t === 'delivery') return 'delivery'
  if (t === 'retirada') return 'retirada'
  return null
}

export function isTipoPedidoOnline(tipo) {
  return tipo === 'delivery' || tipo === 'retirada'
}

export function isPedidoOnline(p) {
  return isTipoPedidoOnline(tipoOnlineFromPedido(p))
}

/** Faixa no topo do card (Cozinha, colunas, TV): título + subtítulo. */
export function pedidoOnlineBannerModel(tipo) {
  if (!isTipoPedidoOnline(tipo)) return null
  if (tipo === 'delivery') {
    return {
      wrap: 'mb-2 rounded-lg border-2 border-[#0092dd] bg-[#2f3c43] px-3 py-2 text-center shadow-sm',
      titleClass: 'text-sm font-black uppercase tracking-wide text-[#1077bc]',
      title: 'Pedido online — entrega (delivery)',
      subtitleClass: 'mt-0.5 text-xs font-semibold leading-snug text-[#107dbc]',
      subtitle: 'Embalar / preparar para envio ao cliente — não é consumo na mesa',
    }
  }
  return {
    wrap: 'mb-2 rounded-lg border-2 border-[#0cc4b4] bg-[#1c3a36] px-3 py-2 text-center shadow-sm',
    titleClass: 'text-sm font-black uppercase tracking-wide text-[#0cc0b4]',
    title: 'Pedido online — retirada no balcão',
    subtitleClass: 'mt-0.5 text-xs font-semibold leading-snug text-[#25a79e]',
    subtitle: 'Cliente retira aqui — organizar pedido para retirada',
  }
}

/** Faixa larga para TV. */
export function pedidoOnlineTvBannerModel(tipo) {
  if (!isTipoPedidoOnline(tipo)) return null
  if (tipo === 'delivery') {
    return {
      wrap: 'mb-3 rounded-xl border-2 border-[#0087d2] bg-[#2f3c43] px-4 py-3 text-center',
      titleClass: 'text-xl font-black uppercase tracking-wide text-[#1077bc]',
      title: 'Pedido online — delivery (entrega)',
      subtitleClass: 'mt-1 text-base font-bold text-[#107dbc]',
      subtitle: 'Embalar — envio ao cliente',
    }
  }
  return {
    wrap: 'mb-3 rounded-xl border-2 border-[#13b9ac] bg-[#1c3a36] px-4 py-3 text-center',
    titleClass: 'text-xl font-black uppercase tracking-wide text-[#0cc0b4]',
    title: 'Pedido online — retirada',
    subtitleClass: 'mt-1 text-base font-bold text-[#25a79e]',
    subtitle: 'Cliente retira no balcão',
  }
}

/** Texto do selo de pedidos vindos de marketplace (ex.: "iFood #1234"); null para pedidos próprios. */
export function comandaOrigemLabel(p) {
  if (p?.comanda_origem !== 'ifood') return null
  return p.comanda_origem_ref ? `iFood #${p.comanda_origem_ref}` : 'iFood'
}

export function comandaOnlineLabel(tipo) {
  if (tipo === 'delivery') return '🚚 Delivery'
  if (tipo === 'retirada') return '🛍 Retirada'
  return null
}

/** Linha de pedido na Cozinha (e TVs que listam pedido a pedido). */
export function cozinhaPedidoCardClass(p) {
  const t = tipoOnlineFromPedido(p)
  const base = 'flex items-center justify-between gap-2 rounded-xl border-2 p-3 '
  if (t === 'delivery') {
    return base + (p.waiting_grill
      ? 'border-[#089fe3] bg-[#252f35] shadow-sm'
      : 'border-[#13b3ff] bg-[#212a2f]/95 shadow-sm ring-1 ring-[#2f3c43]/60')
  }
  if (t === 'retirada') {
    return base + (p.waiting_grill
      ? 'border-[#11cdb8] bg-[#21302d] shadow-sm'
      : 'border-[#1ce7c7] bg-[#21302d]/90 shadow-sm ring-1 ring-[#27f1ca]/70')
  }
  return base + (p.waiting_grill ? 'border-[#f7b200] bg-[#312e22]' : 'border-[#2b3036] bg-[#212226] shadow-sm')
}

/** Coluna de comanda na Churrasqueira. */
export function churrasqueiraComandaColumnClass(tipoOnline) {
  if (tipoOnline === 'delivery') {
    return 'flex w-[min(272px,70vw)] min-w-[224px] shrink-0 flex-col self-start rounded-2xl border-2 border-[#089fe3] bg-gradient-to-b from-[#212a2f] to-[#212226] p-4 shadow-[0_8px_30px_rgb(14,165,233,0.14)] ring-1 ring-[#13b3ff]/40'
  }
  if (tipoOnline === 'retirada') {
    return 'flex w-[min(272px,70vw)] min-w-[224px] shrink-0 flex-col self-start rounded-2xl border-2 border-[#11cdb8]/95 bg-gradient-to-b from-[#21302d]/95 to-[#212226] p-4 shadow-[0_8px_30px_rgb(0,0,0,0.12)] ring-1 ring-[#1cb0a7]/15'
  }
  return 'flex w-[min(272px,70vw)] min-w-[224px] shrink-0 flex-col self-start rounded-2xl border-2 border-[#ea9404]/90 bg-[#212226] p-4 shadow-[0_8px_30px_rgb(0,0,0,0.12)] ring-1 ring-[#b94f13]/10'
}

/** Coluna de comanda no Bar. */
export function barComandaColumnClass(tipoOnline) {
  if (tipoOnline === 'delivery') {
    return 'flex w-[min(300px,85vw)] min-w-[240px] shrink-0 flex-col rounded-xl border-2 border-[#089fe3] bg-gradient-to-b from-[#212a2f] to-[#212226] p-3 shadow-md ring-1 ring-[#2f3c43]/50'
  }
  if (tipoOnline === 'retirada') {
    return 'flex w-[min(300px,85vw)] min-w-[240px] shrink-0 flex-col rounded-xl border-2 border-[#11cdb8]/90 bg-gradient-to-b from-[#21302d] to-[#212226] p-3 shadow-md ring-1 ring-[#27f1ca]/50'
  }
  return 'flex w-[min(300px,85vw)] min-w-[240px] shrink-0 flex-col rounded-xl border border-[#2b3036] bg-[#212226] p-3 shadow-sm'
}

/** Card grande nas TVs (um pedido por card). */
export function tvPedidoCardClass(p) {
  const t = tipoOnlineFromPedido(p)
  if (t === 'delivery') {
    return `rounded-2xl border-2 p-6 text-xl shadow-md border-[#089fe3] bg-gradient-to-br from-[#212a2f] to-[#212226] ${p.waiting_grill ? 'ring-2 ring-[#13b3ff]' : 'ring-1 ring-[#2f3c43]/80'}`
  }
  if (t === 'retirada') {
    return 'rounded-2xl border-2 border-[#11cdb8] bg-gradient-to-br from-[#21302d] to-[#212226] p-6 text-xl shadow-md ring-1 ring-[#27f1ca]/70'
  }
  return `rounded-2xl border-2 p-6 text-xl shadow-md ${p.waiting_grill ? 'border-[#f7b200] bg-[#312e22]' : 'border-[#2b3036] bg-[#212226]'}`
}
