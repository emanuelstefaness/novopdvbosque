import { Router } from "express";
import { resolveRange, receipts, soldItems, sumMoney } from "../reporting.js";
import { money } from "../billing.js";
export const reportsRouter = Router();
reportsRouter.use((req, res, next) => {
  try {
    req.range = resolveRange(req);
    next();
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
const data = (req) => receipts(req.app.get("db"), req.range.from, req.range.to);
reportsRouter.get("/vendas/dia", (req, res) => res.json(data(req)));
reportsRouter.get("/vendas/mes", (req, res) => {
  const rows = data(req);
  res.json(
    [...new Set(rows.map((r) => r.business_date))].sort().map((dia) => ({
      dia,
      total: sumMoney(
        rows.filter((r) => r.business_date === dia),
        "total",
      ),
    })),
  );
});
reportsRouter.get("/faturamento", (req, res) => {
  const rows = data(req),
    sessions = new Map();
  for (const r of rows)
    sessions.set(
      r.session_key,
      Math.max(sessions.get(r.session_key) || 0, r.people_count || 0),
    );
  const totalPessoas = [...sessions.values()].reduce((s, v) => s + v, 0),
    faturamento = sumMoney(rows, "total");
  res.json({
    ...req.range,
    faturamento,
    taxaServico: sumMoney(rows, "taxa_servico_valor"),
    couvert: sumMoney(rows, "couvert_valor"),
    comandasCount: sessions.size,
    totalPessoas,
    ticketMedio: sessions.size ? faturamento / sessions.size : 0,
    ticketPorPessoa: totalPessoas ? faturamento / totalPessoas : 0,
    business_day_note:
      "Salão: pagamentos recebidos. Online: pedidos entregues. Dia operacional: 01:00 a 00:59. Couvert sem serviço.",
  });
});
function groupedItems(req, key) {
  const map = new Map();
  for (const r of soldItems(req.app.get("db"), req.range.from, req.range.to)) {
    const k = r[key] || "Sem categoria",
      a = map.get(k) || { name: k, total_quantity: 0, c: 0 };
    a.total_quantity += r.quantity;
    a.c += r.value_cents;
    map.set(k, a);
  }
  return [...map.values()]
    .map((r) => ({
      name: r.name,
      total_quantity: r.total_quantity,
      total_value: money(r.c),
    }))
    .sort((a, b) => b.total_quantity - a.total_quantity);
}
reportsRouter.get("/itens-mais-vendidos", (req, res) =>
  res.json(
    groupedItems(req, "name").slice(
      0,
      Math.max(1, Math.min(200, Number(req.query.limit) || 50)),
    ),
  ),
);
reportsRouter.get("/por-categoria", (req, res) =>
  res.json(
    groupedItems(req, "category_name")
      .map((r) => ({ category_name: r.name, total: r.total_value }))
      .sort((a, b) => b.total - a.total),
  ),
);
reportsRouter.get("/churrasqueira", (req, res) => {
  const map = new Map();
  for (const r of soldItems(
    req.app.get("db"),
    req.range.from,
    req.range.to,
  ).filter((r) => r.sector === "grill"))
    map.set(r.name, (map.get(r.name) || 0) + r.quantity);
  res.json(
    [...map]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total),
  );
});
reportsRouter.get("/por-garcom", (req, res) => {
  const rows = data(req);
  res.json(
    [...new Set(rows.map((r) => r.waiter_name))].map((waiter_name) => {
      const rs = rows.filter((r) => r.waiter_name === waiter_name);
      return {
        waiter_name,
        comandas_count: new Set(rs.map((r) => r.session_key)).size,
        total_faturamento: sumMoney(rs, "total"),
      };
    }),
  );
});
reportsRouter.get("/cancelamentos", (req, res) => {
  const rows = req.app
    .get("db")
    .prepare(
      "SELECT * FROM cancellation_log WHERE date(cancelled_at,'-1 hour') BETWEEN ? AND ?",
    )
    .all(req.range.from, req.range.to);
  const map = new Map();
  for (const r of rows) {
    const a = map.get(r.name) || { name: r.name, total_quantity: 0, c: 0 };
    a.total_quantity += r.quantity;
    a.c += r.value_cents;
    map.set(r.name, a);
  }
  res.json({
    ...req.range,
    resumo: {
      linhas_canceladas: rows.length,
      valor_cancelado: money(rows.reduce((s, r) => s + r.value_cents, 0)),
    },
    porItem: [...map.values()].map((r) => ({
      name: r.name,
      total_quantity: r.total_quantity,
      total_value: money(r.c),
    })),
  });
});
