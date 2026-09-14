import { cents, money } from "./billing.js";
export function businessToday() {
  const d = new Date();
  d.setHours(d.getHours() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function resolveRange(req) {
  const today = businessToday();
  let from = String(req.query.from || req.query.date || today).slice(0, 10),
    to = String(req.query.to || from).slice(0, 10);
  if (req.query.month && /^\d{4}-\d{2}$/.test(req.query.month)) {
    from = req.query.month + "-01";
    const [y, m] = req.query.month.split("-").map(Number);
    to = req.query.month + "-" + new Date(y, m, 0).getDate();
  }
  const valid = (s) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
  if (!valid(from) || !valid(to)) throw new Error("Período inválido");
  if (from > to) [from, to] = [to, from];
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 3660)
    throw new Error("Selecione até dez anos");
  return { from, to };
}
export function receipts(db, from, to) {
  const local = db
    .prepare(
      `SELECT *,date(paid_at,'-1 hour') AS business_date FROM sales WHERE origin_order_id IS NULL AND date(paid_at,'-1 hour') BETWEEN ? AND ?`,
    )
    .all(from, to);
  const online = db
    .prepare(
      `SELECT *,date(COALESCE(delivered_at,updated_at),'-1 hour') AS business_date FROM orders WHERE status='entregue' AND date(COALESCE(delivered_at,updated_at),'-1 hour') BETWEEN ? AND ?`,
    )
    .all(from, to);
  return [
    ...local.map((s) => ({
      ...s,
      key: "sale-" + s.id,
      channel: "salon",
      closed_at: s.paid_at,
      total: money(s.total_cents),
      subtotal: money(s.subtotal_cents),
      couvert_valor: money(s.couvert_cents),
      taxa_servico_valor: money(s.service_cents),
    })),
    ...online.map((o) => ({
      key: "online-" + o.id,
      session_key: "online-" + o.id,
      comanda_id: o.comanda_id,
      mesa: o.tipo === "delivery" ? "Delivery" : "Retirada",
      channel: "online",
      closed_at: o.delivered_at || o.updated_at,
      business_date: o.business_date,
      total: Number(o.valor_total),
      subtotal: Number(o.valor_total),
      couvert_valor: 0,
      taxa_servico_valor: 0,
      people_count: 0,
      waiter_name: "Pedidos online",
    })),
  ].sort((a, b) => String(b.closed_at).localeCompare(String(a.closed_at)));
}
export function soldItems(db, from, to) {
  return [
    ...db
      .prepare(
        `SELECT si.*,si.unit_cents*si.quantity AS value_cents FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.origin_order_id IS NULL AND date(s.paid_at,'-1 hour') BETWEEN ? AND ?`,
      )
      .all(from, to),
    ...db
      .prepare(
        `SELECT oi.item_id,i.name,c.name AS category_name,oi.quantity,CAST(ROUND(oi.unit_price*100) AS INTEGER) AS unit_cents,CAST(ROUND(oi.unit_price*100) AS INTEGER)*oi.quantity AS value_cents,CASE WHEN i.is_grill=1 THEN 'grill' ELSE NULL END AS sector FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN items i ON i.id=oi.item_id LEFT JOIN categories c ON c.id=i.category_id WHERE o.status='entregue' AND date(COALESCE(o.delivered_at,o.updated_at),'-1 hour') BETWEEN ? AND ?`,
      )
      .all(from, to),
  ];
}
export const sumMoney = (rows, key) =>
  money(rows.reduce((s, r) => s + cents(r[key] || 0), 0));
