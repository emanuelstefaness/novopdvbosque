/** Taxa padrão de delivery (R$) quando não há promo. */
export const TAXA_ENTREGA_PADRAO = 10;

/** Promo ativa agora — entrega grátis. Desligue amanhã (`false`) para voltar à taxa normal. */
export const PROMO_ENTREGA_GRATIS = false;

/**
 * Taxa de entrega vigente (R$).
 * - `TAXA_ENTREGA_DELIVERY=0` no .env do backend → grátis (até mudar de novo).
 * - `PROMO_ENTREGA_GRATIS` ou data em `ENTREGA_GRATIS_DATAS` → grátis.
 */
export function getTaxaEntregaDelivery(at = new Date()) {
  const env = process.env.TAXA_ENTREGA_DELIVERY;
  if (env !== undefined && String(env).trim() !== '') {
    const n = Number(env);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  if (PROMO_ENTREGA_GRATIS) return 0;
  const ymd = at.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  if (ENTREGA_GRATIS_DATAS.includes(ymd)) return 0;
  return TAXA_ENTREGA_PADRAO;
}

/** Datas YYYY-MM-DD (horário de Brasília) com entrega grátis. */
export const ENTREGA_GRATIS_DATAS = [
  '2026-06-13',
];

export function entregaGratisAtiva(at = new Date()) {
  return getTaxaEntregaDelivery(at) === 0;
}
