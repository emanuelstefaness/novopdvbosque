/**
 * Conferência financeira completa: subtotal, serviço, couvert, recebimentos, turno de caixa,
 * relatórios e financeiro. Os valores esperados estão escritos à mão (centavos conferidos),
 * sem reutilizar as funções de cálculo do sistema, para que um erro de lógica apareça.
 *
 * Banco em memória: não toca no banco real.
 */
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
process.env.PDV_DB_PATH = ":memory:";
process.env.PEDIDOS_ONLINE_ATIVO = "1"; // pedido público aceito a qualquer hora, só nos testes
const { db, initDb } = await import("./db.js");
const { comandasRouter, clearComandaHandler } = await import("./routes/comandas.js");
const { pedidosRouter } = await import("./routes/pedidos.js");
const { reportsRouter } = await import("./routes/reports.js");
const { financeRouter } = await import("./routes/finance.js");
const { printRouter } = await import("./routes/print.js");
const { ordersRouter } = await import("./routes/orders.js");
const { publicRouter } = await import("./routes/public.js");
const { cashRouter, initCash } = await import("./routes/cash.js");
const { businessToday } = await import("./reporting.js");
initDb();
initCash(db);

const app = express();
app.use(express.json());
app.set("db", db);
app.use("/cash", cashRouter);
app.post("/comandas/:id/clear", (req, res) => clearComandaHandler(req, res, db));
app.use("/comandas", comandasRouter);
app.use("/pedidos", pedidosRouter);
app.use("/reports", reportsRouter);
app.use("/finance", financeRouter);
app.use("/print", printRouter);
app.use("/orders", ordersRouter);
app.use("/public", publicRouter);
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const url = `http://127.0.0.1:${server.address().port}`;

async function call(path, method = "GET", body) {
  const r = await fetch(url + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  return { status: r.status, ok: r.ok, data: d };
}
async function req(path, method = "GET", body) {
  const r = await call(path, method, body);
  assert.ok(r.ok, `${method} ${path} → ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}
const TODAY = businessToday();
const today = `?from=${TODAY}&to=${TODAY}`;
const eq = (a, b, msg) => assert.equal(Math.round(a * 100), Math.round(b * 100), msg || `${a} !== ${b}`);

// ---------- catálogo de teste ----------
const cat = Number(db.prepare("INSERT INTO categories(name,slug) VALUES('Teste fin','teste-fin')").run().lastInsertRowid);
const mk = (name, price, extra = "") =>
  Number(db.prepare(`INSERT INTO items(category_id,name,price${extra ? "," + extra.split("=")[0] : ""}) VALUES(?,?,?${extra ? "," + extra.split("=")[1] : ""})`).run(cat, name, price).lastInsertRowid);
const B19_90 = mk("Prato 19,90", 19.9);
const A12_90 = mk("Porção 12,90", 12.9);
const D33_33 = mk("Prato 33,33", 33.33);
const C0_10 = mk("Bala 0,10", 0.1);
const P100 = mk("Produto 100", 100);
const GRILL = mk("Espeto 25", 25, "is_grill=1");

let rk = 0;
const key = (p) => `${p}-${String(++rk).padStart(4, "0")}-financeiro`;
async function open(id, mesa = String(id)) {
  await req(`/comandas/${id}/open`, "POST", { mesa });
}
async function add(id, item, quantity = 1) {
  return req("/pedidos", "POST", { comanda_id: id, item_id: item, quantity });
}
const sum = (id) => req(`/comandas/${id}/summary`);
const patch = (id, body) => req(`/comandas/${id}`, "PATCH", body);
async function receive(id, expected, tenders, extra = {}) {
  return req("/cash/receive", "POST", { request_key: key("rcv"), comanda_id: id, expected_total: expected, tenders, ...extra });
}

// =====================================================================
// 1. SUBTOTAL, SERVIÇO E TOTAL
// =====================================================================
test("1.1 Subtotal, serviço 10% e total com vários itens e quantidades", async () => {
  await open(1);
  await add(1, B19_90, 3); // 59,70
  await add(1, A12_90, 2); // 25,80
  await patch(1, { service_tax_percent: 10 });
  const s = await sum(1);
  eq(s.subtotal, 85.5, "subtotal");
  eq(s.serviceBase, 85.5, "base de serviço");
  eq(s.serviceTax, 8.55, "serviço (10% de 85,50)");
  eq(s.total, 94.05, "total");
  eq(s.couvert, 0, "sem couvert");
});

test("1.2 Sem taxa de serviço (0%) o total é igual ao subtotal", async () => {
  await open(2);
  await add(2, B19_90, 1);
  await add(2, A12_90, 1);
  const s = await sum(2);
  eq(s.subtotal, 32.8);
  eq(s.serviceTax, 0);
  eq(s.total, 32.8);
});

test("1.3 Serviço arredonda ao centavo: 3 × 33,33 a 10% = 109,99", async () => {
  await open(3);
  await add(3, D33_33, 3); // 99,99
  await patch(3, { service_tax_percent: 10 });
  const s = await sum(3);
  eq(s.subtotal, 99.99);
  eq(s.serviceTax, 10.0, "9,999 arredonda para 10,00");
  eq(s.total, 109.99);
});

test("1.4 Valores pequenos e percentual quebrado: 7 × 0,10 a 12% = 0,78", async () => {
  await open(4);
  await add(4, C0_10, 7); // 0,70
  await patch(4, { service_tax_percent: 12 });
  const s = await sum(4);
  eq(s.subtotal, 0.7);
  eq(s.serviceTax, 0.08, "0,084 → 0,08");
  eq(s.total, 0.78);
});

test("1.5 Quantidade e preço decimais não geram erro de ponto flutuante", async () => {
  await open(5);
  await add(5, B19_90, 7); // 139,30
  const s = await sum(5);
  assert.equal(s.subtotal, 139.3);
  assert.equal(s.total, 139.3);
  assert.equal(Number.isInteger(Math.round(s.total * 100)), true);
});

// =====================================================================
// 2. COUVERT
// =====================================================================
test("2.1 Couvert: 4 pessoas × R$ 5 = R$ 20, sem serviço sobre o couvert", async () => {
  await open(6);
  await add(6, P100, 1);
  await patch(6, { people_count: 4, service_tax_percent: 10 });
  await req("/comandas/6/lancar-couvert", "POST", {});
  const s = await sum(6);
  eq(s.couvert, 20, "couvert");
  eq(s.subtotal, 120, "subtotal inclui couvert");
  eq(s.serviceBase, 100, "base de serviço exclui couvert");
  eq(s.serviceTax, 10, "10% só sobre 100");
  eq(s.total, 130);
});

test("2.2 Lançar couvert de novo não duplica; aumentar pessoas acrescenta só a diferença", async () => {
  await req("/comandas/6/lancar-couvert", "POST", {});
  eq((await sum(6)).couvert, 20, "repetir não muda");
  await patch(6, { people_count: 6 });
  await req("/comandas/6/lancar-couvert", "POST", {});
  const s = await sum(6);
  eq(s.couvert, 30, "6 pessoas × 5");
  eq(s.serviceTax, 10, "serviço continua só sobre 100");
  eq(s.total, 140);
});

test("2.3 Couvert com valor diferente por pessoa (R$ 7,50)", async () => {
  await open(7);
  await add(7, P100, 2); // 200
  await patch(7, { people_count: 3, couvert_per_person: 7.5, service_tax_percent: 10 });
  await req("/comandas/7/lancar-couvert", "POST", {});
  const s = await sum(7);
  eq(s.couvert, 22.5);
  eq(s.serviceTax, 20);
  eq(s.total, 242.5);
});

test("2.4 Pré-conta (impressão) mostra o mesmo couvert, serviço e total do caixa", async () => {
  const s = await sum(7);
  const p = await req("/print/comanda/7");
  eq(p.total, s.total, "total impresso = total do caixa");
  eq(p.service_tax, s.serviceTax, "serviço impresso");
  eq(p.couvert_pendente, 0, "nada pendente");
});

test("2.5 Couvert é incluído na seleção parcial e não gera serviço extra", async () => {
  // comanda 6: 100 + couvert 30, serviço 10 → 140. Recebe só o couvert.
  const s = await sum(6);
  // o couvert foi lançado em duas vezes (4 + 2 pessoas): são duas linhas
  const linhas = s.pedidos.filter((p) => p.item_name === "Couvert");
  assert.equal(linhas.length, 2);
  assert.equal(linhas.reduce((n, p) => n + p.quantity, 0), 6);
  const r = await receive(6, 30, [{ method: "pix", amount: 30 }], { selection: linhas.map((p) => ({ id: p.id, quantity: p.quantity })) });
  eq(r.remaining, 110, "restam 100 + 10 de serviço");
  const sale = db.prepare("SELECT * FROM sales WHERE comanda_id=6 ORDER BY id DESC").get();
  assert.equal(sale.couvert_cents, 3000);
  assert.equal(sale.service_cents, 0, "pagar só couvert não gera serviço");
  assert.equal(sale.total_cents, 3000);
});

// =====================================================================
// 3. RECEBIMENTOS E TURNO DE CAIXA
// =====================================================================
test("3.0 Abre o turno com fundo de R$ 100", async () => {
  await req("/cash/shift", "POST", { opening: 100 });
  const sh = (await req("/cash/shift")).current;
  assert.equal(sh.expected.dinheiro, 10000);
});

test("3.1 Dinheiro com troco: só o valor da conta entra no caixa", async () => {
  // comanda 1: total 94,05. Cliente dá 100.
  const r = await receive(1, 94.05, [{ method: "dinheiro", amount: 100 }]);
  eq(r.change, 5.95, "troco");
  assert.equal(r.closed, true);
  const sale = db.prepare("SELECT * FROM sales WHERE comanda_id=1").get();
  assert.equal(sale.subtotal_cents, 8550);
  assert.equal(sale.service_cents, 855);
  assert.equal(sale.total_cents, 9405);
  assert.equal(sale.subtotal_cents + sale.service_cents, sale.total_cents);
  const sh = (await req("/cash/shift")).current;
  assert.equal(sh.expected.dinheiro, 10000 + 9405, "fundo + conta (sem o troco)");
});

test("3.2 Pagamento misto (PIX + débito + dinheiro) soma exatamente a conta", async () => {
  // comanda 3: total 109,99
  const r = await receive(3, 109.99, [
    { method: "pix", amount: 50 },
    { method: "debito", amount: 30 },
    { method: "dinheiro", amount: 29.99 },
  ]);
  eq(r.change, 0);
  const sh = (await req("/cash/shift")).current;
  assert.equal(sh.expected.pix, 5000);
  assert.equal(sh.expected.debito, 3000);
  assert.equal(sh.expected.dinheiro, 10000 + 9405 + 2999);
});

test("3.3 Troco só pode sair de dinheiro: PIX acima da conta é recusado", async () => {
  await open(8);
  await add(8, P100, 1);
  const r = await call("/cash/receive", "POST", {
    request_key: key("pix-excesso"), comanda_id: 8, expected_total: 100, tenders: [{ method: "pix", amount: 120 }],
  });
  assert.equal(r.status, 400);
});

test("3.4 Valor desatualizado (conta mudou) é recusado", async () => {
  const r = await call("/cash/receive", "POST", {
    request_key: key("antigo"), comanda_id: 8, expected_total: 90, tenders: [{ method: "pix", amount: 90 }],
  });
  assert.equal(r.status, 400);
});

test("3.5 Mesma requisição repetida não recebe duas vezes", async () => {
  const body = { request_key: key("dup"), comanda_id: 8, expected_total: 100, tenders: [{ method: "pix", amount: 100 }] };
  await req("/cash/receive", "POST", body);
  const again = await req("/cash/receive", "POST", body);
  assert.equal(again.replayed, true);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sales WHERE comanda_id=8").get().n, 1);
  const sh = (await req("/cash/shift")).current;
  assert.equal(sh.expected.pix, 5000 + 10000);
});

test("3.6 Recebimento parcial por unidade preserva saldo, serviço e centavos", async () => {
  await open(9);
  const p = await add(9, D33_33, 3); // 99,99
  await patch(9, { service_tax_percent: 10 }); // total 109,99
  // 1ª unidade: base 33,33 → serviço calculado por diferença (10,00 − 6,67 = 3,33)
  const first = await receive(9, 36.66, [{ method: "pix", amount: 36.66 }], { selection: [{ id: p.id, quantity: 1 }] });
  eq(first.remaining, 73.33, "109,99 − 36,66");
  // 2ª unidade: serviço do saldo (2 un.) 6,67 − serviço do que sobra (1 un.) 3,33 = 3,34 → 36,67
  const second = await receive(9, 36.67, [{ method: "pix", amount: 36.67 }], { selection: [{ id: p.id, quantity: 1 }] });
  eq(second.remaining, 36.66);
  const third = await receive(9, 36.66, [{ method: "pix", amount: 36.66 }], { selection: [{ id: p.id, quantity: 1 }] });
  assert.equal(third.closed, true);
  const totals = db.prepare("SELECT SUM(total_cents) t, SUM(subtotal_cents) s, SUM(service_cents) v FROM sales WHERE comanda_id=9").get();
  assert.equal(totals.t, 10999, "soma dos recebimentos = conta inteira");
  assert.equal(totals.s, 9999);
  assert.equal(totals.v, 1000);
});

test("3.7 Adiantamento entra uma vez só e é abatido na liquidação", async () => {
  await open(10);
  await add(10, P100, 1);
  await patch(10, { service_tax_percent: 10 }); // 110
  await req("/cash/receive", "POST", { request_key: key("adv"), comanda_id: 10, amount: 40, expected_total: 40, tenders: [{ method: "pix", amount: 40 }] });
  const s = await sum(10);
  eq(s.total, 70, "saldo");
  eq(s.paidTotal, 40);
  await receive(10, 70, [{ method: "debito", amount: 70 }]);
  const tot = db.prepare("SELECT SUM(total_cents) t FROM sales WHERE comanda_id=10").get().t;
  assert.equal(tot, 11000, "40 + 70 = 110, nunca 150");
});

test("3.8 Sangria maior que o dinheiro disponível é recusada; suprimento e sangria ajustam o esperado", async () => {
  const before = (await req("/cash/shift")).current.expected.dinheiro;
  const bad = await call("/cash/movement", "POST", { kind: "sangria", amount: before / 100 + 1, reason: "teste" });
  assert.equal(bad.status, 400);
  await req("/cash/movement", "POST", { kind: "suprimento", amount: 50, reason: "troco" });
  await req("/cash/movement", "POST", { kind: "sangria", amount: 20, reason: "pagto fornecedor" });
  assert.equal((await req("/cash/shift")).current.expected.dinheiro, before + 5000 - 2000);
});

test("3.9 Fechamento de turno compara contado × esperado por meio de pagamento", async () => {
  const sh = (await req("/cash/shift")).current;
  const counted = {
    dinheiro: sh.expected.dinheiro / 100 - 1, // falta R$ 1
    pix: sh.expected.pix / 100,
    debito: sh.expected.debito / 100,
    credito: sh.expected.credito / 100,
  };
  const close = await req("/cash/shift/close", "POST", { counted });
  assert.equal(close.difference.dinheiro, -100);
  assert.equal(close.difference.pix, 0);
  assert.equal(close.difference.debito, 0);
});

// =====================================================================
// 4. RELATÓRIOS × RECEBIMENTOS (hoje)
// =====================================================================
test("4.1 Faturamento do dia = soma exata dos recebimentos", async () => {
  const sumSales = db.prepare("SELECT SUM(total_cents) t FROM sales WHERE origin_order_id IS NULL").get().t;
  const f = await req("/reports/faturamento" + today);
  eq(f.faturamento, sumSales / 100);
});

test("4.2 Taxa de serviço e couvert dos relatórios batem com os recebimentos", async () => {
  const r = db.prepare("SELECT SUM(service_cents) v, SUM(couvert_cents) c FROM sales WHERE origin_order_id IS NULL").get();
  const f = await req("/reports/faturamento" + today);
  eq(f.taxaServico, r.v / 100, "serviço");
  eq(f.couvert, r.c / 100, "couvert");
  assert.equal(r.c, 3000, "couvert da comanda 6 (30,00)");
});

test("4.3 Faturamento = itens vendidos (inclui couvert) + taxa de serviço", async () => {
  const f = await req("/reports/faturamento" + today);
  const cats = await req("/reports/por-categoria" + today);
  const itens = cats.reduce((n, c) => n + Math.round(c.total * 100), 0);
  assert.equal(itens + Math.round(f.taxaServico * 100), Math.round(f.faturamento * 100));
});

test("4.4 Vendas por dia e por mês somam o faturamento", async () => {
  const f = await req("/reports/faturamento" + today);
  const dia = await req("/reports/vendas/dia" + today);
  eq(dia.reduce((n, r) => n + r.total, 0), f.faturamento, "soma dos recebimentos listados");
  const mes = await req("/reports/vendas/mes" + today);
  eq(mes.reduce((n, r) => n + r.total, 0), f.faturamento, "soma por dia");
});

test("4.5 Por garçom soma o faturamento", async () => {
  const f = await req("/reports/faturamento" + today);
  const g = await req("/reports/por-garcom" + today);
  eq(g.reduce((n, r) => n + r.total_faturamento, 0), f.faturamento);
});

test("4.6 Financeiro (entradas do salão) = faturamento do salão", async () => {
  const f = await req("/reports/faturamento" + today);
  const fin = await req("/finance/daily" + today);
  eq(fin.totals.sales_comandas, f.faturamento);
  eq(fin.totals.sales_online, 0);
});

test("4.7 Quantidade de itens mais vendidos confere com o consumido", async () => {
  const top = await req("/reports/itens-mais-vendidos" + today);
  const sold = db.prepare("SELECT name, SUM(quantity) q FROM sale_items GROUP BY name").all();
  for (const s of sold) {
    const r = top.find((t) => t.name === s.name);
    assert.ok(r, "falta " + s.name);
    assert.equal(r.total_quantity, s.q, s.name);
  }
});

// =====================================================================
// 5. PEDIDOS ONLINE
// =====================================================================
function makeOrder(tipo, total, itemTotals, status = "recebido") {
  const id = Number(db.prepare("INSERT INTO orders(tipo,cliente_nome,cliente_telefone,valor_total,status) VALUES(?,?,?,?,?)").run(tipo, "Cliente", "41999990000", total, status).lastInsertRowid);
  for (const [item, qty, price] of itemTotals) db.prepare("INSERT INTO order_items(order_id,item_id,quantity,unit_price) VALUES(?,?,?,?)").run(id, item, qty, price);
  return id;
}

test("5.1 Pedido online só entra no faturamento quando entregue, uma vez só", async () => {
  const before = (await req("/reports/faturamento" + today)).faturamento;
  const id = makeOrder("retirada", 59.7, [[B19_90, 3, 19.9]]);
  eq((await req("/reports/faturamento" + today)).faturamento, before, "recebido ainda não conta");
  await req(`/orders/${id}/status`, "PATCH", { status: "entregue" });
  await req(`/orders/${id}/status`, "PATCH", { status: "entregue" });
  eq((await req("/reports/faturamento" + today)).faturamento, before + 59.7);
  eq((await req("/finance/daily" + today)).totals.sales_online, 59.7);
});

test("5.2 Pedido online cancelado não entra em nenhum relatório", async () => {
  const before = (await req("/reports/faturamento" + today)).faturamento;
  const id = makeOrder("delivery", 80, [[P100, 1, 80]]);
  await req(`/orders/${id}/status`, "PATCH", { status: "cancelado", motivo_cancelamento: "teste" });
  eq((await req("/reports/faturamento" + today)).faturamento, before);
});

test("5.3 Delivery: valor do pedido inclui a taxa de entrega e o relatório a considera", async () => {
  const before = (await req("/reports/faturamento" + today)).faturamento;
  const id = makeOrder("delivery", 59.7 + 10, [[B19_90, 3, 19.9]]);
  await req(`/orders/${id}/status`, "PATCH", { status: "entregue" });
  eq((await req("/reports/faturamento" + today)).faturamento, before + 69.7, "taxa de entrega é receita");
});

test("5.3b Soma das categorias (com Taxa de entrega) + serviço fecha com o faturamento, salão e online juntos", async () => {
  const f = await req("/reports/faturamento" + today);
  const cats = await req("/reports/por-categoria" + today);
  const itens = cats.reduce((n, c) => n + Math.round(c.total * 100), 0);
  assert.ok(cats.some((c) => c.category_name === "Taxa de entrega"), "linha da taxa de entrega");
  eq(cats.find((c) => c.category_name === "Taxa de entrega").total, 10);
  assert.equal(itens + Math.round(f.taxaServico * 100), Math.round(f.faturamento * 100));
});

test("5.3c Pedido público grava o valor em centavos exatos (3 × 19,90 = 59,70, sem resíduo de ponto flutuante)", async () => {
  const r = await req("/public/orders", "POST", {
    tipo: "retirada", cliente_nome: "Cliente Teste", cliente_telefone: "41999990000",
    forma_pagamento: "dinheiro", items: [{ item_id: B19_90, quantity: 3 }],
  });
  const row = db.prepare("SELECT valor_total FROM orders WHERE id=?").get(r.id);
  assert.equal(row.valor_total, 59.7, "59.699999999999996 seria o resíduo");
  assert.equal(r.valor_total, 59.7);
});

test("5.4 Ticket médio e ticket por pessoa usam apenas o que cabe em cada conta", async () => {
  const f = await req("/reports/faturamento" + today);
  // salão
  const salon = db.prepare("SELECT SUM(total_cents) t FROM sales WHERE origin_order_id IS NULL").get().t / 100;
  const sessions = db.prepare("SELECT session_key, MAX(people_count) p FROM sales WHERE origin_order_id IS NULL GROUP BY session_key").all();
  const pessoas = sessions.reduce((n, s) => n + s.p, 0);
  assert.equal(f.totalPessoas, pessoas);
  if (pessoas > 0) {
    eq(f.ticketPorPessoa, salon / pessoas, "ticket por pessoa deve usar só o faturamento do salão (online não tem pessoas)");
  }
});

// =====================================================================
// 6. FINANCEIRO
// =====================================================================
test("6.1 Lucro = entradas (salão + online + manual) − despesas", async () => {
  await req("/finance/expenses", "POST", { business_date: TODAY, description: "Carvão", amount: 150.5 });
  await req("/finance/expenses", "POST", { business_date: TODAY, description: "Gás", amount: 99.5 });
  await req("/finance/income-manual", "POST", { business_date: TODAY, description: "Evento", amount: 300 });
  const f = await req("/finance/daily" + today);
  const t = f.totals;
  eq(t.expenses, 250);
  eq(t.income_manual, 300);
  eq(t.entradas_total, t.sales_comandas + t.sales_online + 300);
  eq(t.lucro, t.entradas_total - 250);
  const dia = f.daily[0];
  eq(dia.lucro, dia.entradas_total - dia.expenses);
});

test("6.2 Dia operacional: 00:59 pertence ao dia anterior, 01:00 ao dia seguinte", async () => {
  const ins = db.prepare("INSERT INTO sales(session_key,comanda_id,mesa,waiter_name,people_count,paid_at,subtotal_cents,couvert_cents,service_cents,total_cents) VALUES(?,?,?,?,?,?,?,?,?,?)");
  ins.run("limite-a", 150, "x", "(Sem garçom)", 0, "2026-03-10 00:59:59", 1000, 0, 0, 1000);
  ins.run("limite-b", 151, "x", "(Sem garçom)", 0, "2026-03-10 01:00:00", 2000, 0, 0, 2000);
  ins.run("limite-c", 152, "x", "(Sem garçom)", 0, "2026-03-09 23:30:00", 4000, 0, 0, 4000);
  const dia9 = await req("/reports/faturamento?from=2026-03-09&to=2026-03-09");
  const dia10 = await req("/reports/faturamento?from=2026-03-10&to=2026-03-10");
  eq(dia9.faturamento, 50, "9/mar: 23:30 + 00:59 do dia 10 = 40 + 10");
  eq(dia10.faturamento, 20, "10/mar: só a partir de 01:00");
  const fin = await req("/finance/daily?from=2026-03-09&to=2026-03-10");
  eq(fin.daily[0].sales_comandas, 50);
  eq(fin.daily[1].sales_comandas, 20);
});

test("6.3 Período por mês cobre do dia 1 ao último dia", async () => {
  const mar = await req("/reports/faturamento?month=2026-03");
  eq(mar.faturamento, 70);
  assert.equal(mar.from, "2026-03-01");
  assert.equal(mar.to, "2026-03-31");
  const fev = await req("/reports/faturamento?month=2026-02");
  assert.equal(fev.to, "2026-02-28");
});

test("6.4 Período invertido é corrigido e inválido é recusado", async () => {
  const r = await req("/reports/faturamento?from=2026-03-10&to=2026-03-09");
  eq(r.faturamento, 70);
  assert.equal((await call("/reports/faturamento?from=abc")).status, 400);
  assert.equal((await call("/finance/daily?from=2026-13-40")).status, 400);
});

// =====================================================================
// 7. CANCELAMENTOS E UNIÃO
// =====================================================================
test("7.1 Item cancelado sai da conta e entra no relatório de cancelamentos pelo valor correto", async () => {
  await open(11);
  const p1 = await add(11, B19_90, 2); // 39,80
  await add(11, A12_90, 1); // 12,90
  await req(`/pedidos/${p1.id}`, "DELETE");
  const s = await sum(11);
  eq(s.subtotal, 12.9, "só a porção restou");
  const c = await req("/reports/cancelamentos" + today);
  assert.ok(c.resumo.valor_cancelado >= 39.8);
  const item = c.porItem.find((i) => i.name === "Prato 19,90");
  eq(item.total_value, 39.8);
});

test("7.2 União de contas mantém couvert, serviço por origem e total", async () => {
  await open(12);
  await open(13);
  await add(12, P100, 1);
  await patch(12, { people_count: 2, service_tax_percent: 10 });
  await req("/comandas/12/lancar-couvert", "POST", {}); // couvert 10, serviço 10 → 120
  await add(13, P100, 1);
  await patch(13, { service_tax_percent: 0 }); // 100, sem serviço
  await req("/comandas/merge", "POST", { target_id: 12, source_ids: [13] });
  const s = await sum(12);
  eq(s.couvert, 10);
  eq(s.serviceTax, 10, "serviço só da origem que tinha 10%");
  eq(s.subtotal, 210);
  eq(s.total, 220);
});

// =====================================================================
// 8. ALEATÓRIO: contas variadas recebidas em partes, com a fórmula da tela do caixa
// =====================================================================
// Mesma conta que components/CashPayment.jsx faz no navegador para calcular "Total selecionado".
function totalDaTela(summary, quantities) {
  const cent = (n) => Math.round(Number(n) * 100);
  const isCouvert = (p) => p.item_name.trim().toLowerCase() === "couvert";
  const selected = summary.pedidos.filter((p) => quantities[p.id] > 0).map((p) => ({ ...p, quantity: Number(quantities[p.id]) }));
  const groups = {};
  let subtotal = 0;
  for (const p of selected) {
    const value = cent(p.unit_price) * p.quantity;
    subtotal += value;
    if (isCouvert(p)) continue;
    const k = p.billing_service_group || "current";
    groups[k] ??= { base: 0, rate: Number(p.billing_service_percent ?? summary.comanda.service_tax_percent) || 0 };
    groups[k].base += value;
  }
  const remaining = {};
  for (const p of summary.pedidos) {
    if (isCouvert(p)) continue;
    const k = p.billing_service_group || "current";
    remaining[k] ??= { base: 0, rate: Number(p.billing_service_percent ?? summary.comanda.service_tax_percent) || 0 };
    remaining[k].base += cent(p.unit_price) * (p.quantity - Number(quantities[p.id] || 0));
  }
  const remainingService = Object.values(remaining).reduce((n, g) => n + Math.round((g.base * g.rate) / 100), 0);
  const service = cent(summary.serviceTax) - remainingService;
  return (subtotal + service) / 100 - (summary.credit || 0);
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("8.1 Contas aleatórias: recebimento em partes sempre fecha no centavo e a tela concorda com o servidor", async () => {
  const rand = rng(20261010);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const prices = [19.9, 12.9, 33.33, 0.1, 100, 7.77, 45.45, 0.05, 59.9, 8, 27.5, 15.9];
  const rates = [0, 5, 10, 12, 13.5];
  const catalog = prices.map((p, i) => mk("Aleatório " + i, p));
  let contas = 0, pagamentos = 0;
  for (let n = 0; n < 60; n++) {
    const id = 20 + n;
    await open(id);
    const linhas = 1 + Math.floor(rand() * 4);
    for (let l = 0; l < linhas; l++) await add(id, pick(catalog), 1 + Math.floor(rand() * 5));
    const pessoas = Math.floor(rand() * 5);
    await patch(id, { service_tax_percent: pick(rates), ...(pessoas ? { people_count: pessoas } : {}) });
    if (pessoas) await req(`/comandas/${id}/lancar-couvert`, "POST", {});
    const inicial = await sum(id);
    const totalCents = Math.round(inicial.total * 100);
    // invariantes da conta inicial
    assert.equal(Math.round(inicial.subtotal * 100) + Math.round(inicial.serviceTax * 100), totalCents, `conta ${id}: subtotal + serviço = total`);
    assert.ok(Math.round(inicial.couvert * 100) <= Math.round(inicial.subtotal * 100));

    let pagoCents = 0, guarda = 0;
    while (guarda++ < 40) {
      const s = await sum(id);
      if (!s.pedidos.length) break;
      // escolhe um pedaço aleatório: de cada linha, entre 0 e a quantidade restante
      const q = {};
      let algum = false;
      for (const p of s.pedidos) {
        const v = rand() < 0.5 ? p.quantity : Math.floor(rand() * (p.quantity + 1));
        q[p.id] = v;
        if (v > 0) algum = true;
      }
      if (!algum) q[s.pedidos[0].id] = 1;
      // às vezes paga tudo de uma vez
      if (rand() < 0.2) for (const p of s.pedidos) q[p.id] = p.quantity;
      const esperado = totalDaTela(s, q);
      const selection = s.pedidos.filter((p) => q[p.id] > 0).map((p) => ({ id: p.id, quantity: q[p.id] }));
      const r = await call("/cash/receive", "POST", {
        request_key: key("rnd"), comanda_id: id, selection, expected_total: esperado,
        tenders: [{ method: pick(["pix", "debito", "credito", "dinheiro"]), amount: esperado }],
      });
      assert.ok(r.ok, `conta ${id}: a tela calculou ${esperado} e o servidor recusou: ${JSON.stringify(r.data)}`);
      pagoCents += Math.round(esperado * 100);
      pagamentos++;
      if (r.data.closed) break;
    }
    assert.equal(pagoCents, totalCents, `conta ${id}: soma dos recebimentos = conta inteira`);
    const rows = db.prepare("SELECT subtotal_cents s, service_cents v, couvert_cents c, total_cents t FROM sales WHERE comanda_id=? AND is_credit=0").all(id);
    assert.equal(rows.reduce((n, r) => n + r.t, 0), totalCents, `conta ${id}: vendas gravadas somam a conta`);
    for (const r of rows) assert.equal(r.s + r.v, r.t, `conta ${id}: cada venda fecha (itens + serviço)`);
    assert.equal(rows.reduce((n, r) => n + r.c, 0), Math.round(inicial.couvert * 100), `conta ${id}: couvert gravado`);
    assert.equal((await req(`/comandas/${id}`)).status, "closed");
    contas++;
  }
  assert.equal(contas, 60);
  assert.ok(pagamentos >= 60);
});

test("8.2 Depois de tudo, relatórios e financeiro seguem coerentes entre si", async () => {
  const f = await req("/reports/faturamento" + today);
  const sales = db.prepare("SELECT SUM(total_cents) t, SUM(service_cents) v, SUM(couvert_cents) c FROM sales WHERE origin_order_id IS NULL AND date(paid_at,'-1 hour') = ?").get(TODAY);
  const online = db.prepare("SELECT COALESCE(SUM(valor_total),0) t FROM orders WHERE status='entregue'").get().t;
  eq(f.faturamento, sales.t / 100 + online, "faturamento = salão + online");
  eq(f.faturamentoSalao, sales.t / 100);
  eq(f.taxaServico, sales.v / 100);
  eq(f.couvert, sales.c / 100);
  const fin = await req("/finance/daily" + today);
  eq(fin.totals.sales_comandas, sales.t / 100);
  eq(fin.totals.sales_online, online);
  // o que o turno de caixa registrou nunca passa do vendido (só pagamentos via /cash/receive)
  const tendered = db.prepare("SELECT COALESCE(SUM(amount_cents),0) a FROM cash_tenders").get().a;
  assert.ok(tendered <= sales.t, "meios de pagamento não excedem as vendas");
});

test.after(() => {
  server.close();
  db.close();
});
