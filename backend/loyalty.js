/**
 * Fidelidade do delivery: a cada LOYALTY_EVERY pedidos ENTREGUES do mesmo celular,
 * o próximo pedido ganha LOYALTY_PERCENT% de desconto sobre os itens (a taxa de entrega não entra).
 *
 * - O carimbo só é concedido quando o pedido é ENTREGUE (cancelado ou em andamento não vale). Pedidos em
 *   andamento aparecem no cartão como "contando" (campo em_andamento), para o cliente ver o progresso.
 * - Cada bloco de 10 gera um desconto; um pedido com desconto o "gasta" assim que é criado.
 *   Se esse pedido for cancelado, o desconto volta a ficar disponível.
 * - O desconto é sempre calculado aqui no servidor, nunca vem do navegador.
 */
export const LOYALTY_EVERY = 10;
export const LOYALTY_PERCENT = 20;

/** Só dígitos, sem o 55 do país: "+55 (41) 98888-7777" e "41988887777" viram o mesmo número. */
export function normalizePhone(v) {
  let n = String(v || '').replace(/\D/g, '');
  if (n.length > 11 && n.startsWith('55')) n = n.slice(2);
  return n;
}

export function loyaltyStatus(db, phone) {
  const tel = normalizePhone(phone);
  const base = {
    pedidos_concluidos: 0,
    meta: LOYALTY_EVERY,
    percentual: LOYALTY_PERCENT,
    no_ciclo: 0,
    faltam: LOYALTY_EVERY,
    descontos_disponiveis: 0,
    desconto_disponivel: false,
    em_andamento: 0,
  };
  if (tel.length < 10) return base;
  const concluidos = db
    .prepare("SELECT COUNT(*) AS n FROM orders WHERE telefone_normalizado = ? AND status = 'entregue'")
    .get(tel).n;
  // Pedidos já feitos e ainda não entregues: aparecem no cartão como "contando" e viram carimbo ao serem entregues.
  const emAndamento = db
    .prepare("SELECT COUNT(*) AS n FROM orders WHERE telefone_normalizado = ? AND status IN ('recebido','em_producao','pronto','saiu_entrega')")
    .get(tel).n;
  const gastos = db
    .prepare("SELECT COUNT(*) AS n FROM orders WHERE telefone_normalizado = ? AND fidelidade_aplicada = 1 AND status != 'cancelado'")
    .get(tel).n;
  const disponiveis = Math.max(0, Math.floor(concluidos / LOYALTY_EVERY) - gastos);
  const noCiclo = concluidos % LOYALTY_EVERY;
  return {
    ...base,
    pedidos_concluidos: concluidos,
    no_ciclo: noCiclo,
    faltam: disponiveis > 0 ? 0 : LOYALTY_EVERY - noCiclo,
    descontos_disponiveis: disponiveis,
    desconto_disponivel: disponiveis > 0,
    em_andamento: emAndamento,
  };
}

/** Desconto em centavos sobre o total dos itens (em centavos). */
export function loyaltyDiscountCents(itemsCents) {
  return Math.round((itemsCents * LOYALTY_PERCENT) / 100);
}
