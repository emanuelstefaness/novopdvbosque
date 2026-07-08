/** Status técnicos do pedido online (backend). */

export const STEPS_DELIVERY = [
  { status: 'recebido', label: 'Pedido recebido', desc: 'Recebemos seu pedido.' },
  { status: 'em_producao', label: 'Em preparo', desc: 'A cozinha está preparando.' },
  { status: 'pronto', label: 'Pronto', desc: 'Seu pedido está pronto para envio.' },
  { status: 'saiu_entrega', label: 'Saiu para entrega', desc: 'O pedido está a caminho.' },
  { status: 'entregue', label: 'Entregue', desc: 'Bom apetite!' },
]

export const STEPS_RETIRADA = [
  { status: 'recebido', label: 'Pedido recebido', desc: 'Recebemos seu pedido.' },
  { status: 'em_producao', label: 'Em preparo', desc: 'A cozinha está preparando.' },
  { status: 'pronto', label: 'Pronto para retirada', desc: 'Pode vir buscar no balcão.' },
  { status: 'entregue', label: 'Retirado', desc: 'Obrigado pela preferência!' },
]

export function stepsForTipo(tipo) {
  return tipo === 'delivery' ? STEPS_DELIVERY : STEPS_RETIRADA
}

/** Título principal da tela de acompanhamento */
export function tituloAcompanhamento(status) {
  if (status === 'cancelado') return 'Pedido cancelado'
  if (status === 'entregue') return 'Pedido concluído!'
  if (status === 'aguardando_pagamento') return 'Pague com PIX'
  return 'Acompanhe seu pedido'
}

/** Subtítulo curto do status atual */
export function subtituloStatusCliente(status, tipo) {
  if (status === 'cancelado') return 'Infelizmente não conseguimos atender este pedido.'
  if (status === 'aguardando_pagamento') return 'Aguardando confirmação do pagamento PIX.'
  if (status === 'entregue') {
    return tipo === 'delivery' ? 'Seu pedido foi entregue.' : 'Retirada concluída no balcão.'
  }
  const steps = stepsForTipo(tipo)
  const cur = steps.find((s) => s.status === status)
  if (cur) return cur.label
  return 'Atualizando…'
}

export function isStatusTerminal(status) {
  return status === 'entregue' || status === 'cancelado'
}
