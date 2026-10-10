/** Regras de exibição da fidelidade do delivery (o servidor é quem decide e aplica o desconto de verdade). */

/** Desconto em R$ sobre os itens, arredondado ao centavo exatamente como o servidor faz. */
export function descontoFidelidade(subtotalItens, fidelidade) {
  if (!fidelidade?.desconto_disponivel) return 0
  const pct = Number(fidelidade.percentual) || 0
  const itensCents = Math.round((Number(subtotalItens) || 0) * 100)
  return Math.round((itensCents * pct) / 100) / 100
}

/** Primeiro nome, para cumprimentar. */
export function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || ''
}

/** Texto do cartão fidelidade conforme a situação do cliente. */
export function mensagemFidelidade(fidelidade) {
  const f = fidelidade || {}
  const meta = f.meta || 10
  const pct = f.percentual || 20
  const andamento = f.em_andamento || 0
  const aCaminho = andamento > 0 ? (andamento === 1 ? ' · 1 pedido a caminho' : ` · ${andamento} pedidos a caminho`) : ''
  if (f.desconto_disponivel) {
    const n = f.descontos_disponiveis || 1
    return {
      tipo: 'recompensa',
      titulo: `Você ganhou ${pct}% de desconto no próximo pedido!`,
      detalhe: n > 1 ? `Você tem ${n} descontos acumulados. Aplicado automaticamente nos itens.` : 'Aplicado automaticamente nos itens do pedido.',
    }
  }
  const faltam = f.faltam ?? meta
  if ((f.pedidos_concluidos || 0) === 0) {
    return {
      tipo: 'inicio',
      titulo: `A cada ${meta} pedidos, ${pct}% de desconto`,
      detalhe: andamento > 0
        ? 'Seu primeiro pedido está a caminho e vira carimbo quando for entregue.'
        : 'Cada pedido entregue vira um carimbo no seu cartão.',
    }
  }
  return {
    tipo: 'progresso',
    titulo: faltam === 1 ? `Falta 1 pedido para ganhar ${pct}% de desconto` : `Faltam ${faltam} pedidos para ganhar ${pct}% de desconto`,
    detalhe: `${f.no_ciclo || 0} de ${meta} pedidos entregues${aCaminho}`,
  }
}
