/**
 * Delivery / pedidos online: cardápio público, criação de pedido, validações, preços,
 * PIX automático (Mercado Pago simulado), acompanhamento, cancelamento e relatórios.
 * Banco em memória e Mercado Pago simulado: não toca no banco real nem na internet.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

// ---------- Mercado Pago simulado ----------
const mp = {
  payments: new Map(), // id -> { status, amount, body }
  nextId: 9000,
  failCreate: false,
  calls: [],
};
const mpServer = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (d) => (raw += d));
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    mp.calls.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
    const send = (code, obj) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (req.method === "POST" && req.url === "/v1/payments") {
      if (mp.failCreate) return send(500, { message: "indisponível" });
      const id = ++mp.nextId;
      mp.payments.set(id, { status: "pending", amount: body.transaction_amount, body });
      return send(201, {
        id,
        status: "pending",
        point_of_interaction: { transaction_data: { qr_code: "000201PIXCOPIAECOLA" + id, qr_code_base64: "QUJD" } },
      });
    }
    const m = req.url.match(/^\/v1\/payments\/(\d+)$/);
    if (m && mp.payments.has(Number(m[1]))) {
      const p = mp.payments.get(Number(m[1]));
      if (req.method === "GET") return send(200, { id: Number(m[1]), status: p.status });
      if (req.method === "PUT") {
        p.status = body.status || p.status;
        return send(200, { id: Number(m[1]), status: p.status });
      }
    }
    send(404, { message: "não encontrado" });
  });
});
await new Promise((r) => mpServer.listen(0, "127.0.0.1", r));

process.env.PDV_DB_PATH = ":memory:";
process.env.MP_API_BASE = `http://127.0.0.1:${mpServer.address().port}`;
process.env.MP_ACCESS_TOKEN = "TEST-token-simulado";
process.env.PEDIDOS_ONLINE_ATIVO = "1";
process.env.TAXA_ENTREGA_DELIVERY = "10";

const { db, initDb } = await import("./db.js");
const { publicRouter } = await import("./routes/public.js");
const { ordersRouter } = await import("./routes/orders.js");
const { reportsRouter } = await import("./routes/reports.js");
const { financeRouter } = await import("./routes/finance.js");
const { pedidosRouter } = await import("./routes/pedidos.js");
const { comandasRouter } = await import("./routes/comandas.js");
const { businessToday } = await import("./reporting.js");
initDb();

const app = express();
app.use(express.json());
app.set("db", db);
app.use("/public", publicRouter);
app.use("/orders", ordersRouter);
app.use("/reports", reportsRouter);
app.use("/finance", financeRouter);
app.use("/pedidos", pedidosRouter);
app.use("/comandas", comandasRouter);
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const url = `http://127.0.0.1:${server.address().port}`;

async function call(path, method = "GET", body) {
  const r = await fetch(url + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, ok: r.ok, data: await r.json().catch(() => ({})) };
}
async function req(path, method = "GET", body) {
  const r = await call(path, method, body);
  assert.ok(r.ok, `${method} ${path} → ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}
const TODAY = businessToday();
const today = `?from=${TODAY}&to=${TODAY}`;
const eq = (a, b, m) => assert.equal(Math.round(a * 100), Math.round(b * 100), m || `${a} !== ${b}`);

// ---------- catálogo ----------
const catEsp = Number(db.prepare("INSERT INTO categories(name,slug,sort_order) VALUES('Espetinhos','espetinhos',1)").run().lastInsertRowid);
const catLan = Number(db.prepare("INSERT INTO categories(name,slug,sort_order) VALUES('Lanches','lanches',2)").run().lastInsertRowid);
const catBeb = Number(db.prepare("INSERT INTO categories(name,slug,sort_order) VALUES('Bebidas','bebidas',3)").run().lastInsertRowid);
const mk = (cat, name, price, cols = "", vals = []) =>
  Number(db.prepare(`INSERT INTO items(category_id,name,price${cols ? "," + cols : ""}) VALUES(?,?,?${vals.map(() => ",?").join("")})`).run(cat, name, price, ...vals).lastInsertRowid);
const ESP = mk(catEsp, "Gado com Bacon", 15.9, "is_grill", [1]);
const BURG = mk(catLan, "Churraspão", 36.9, "is_grill", [1]);
const COCA = mk(catBeb, "Coca-Cola 350ml", 8);
const INTERNO = mk(catBeb, "Item interno", 5, "internal_only", [1]);
const PF = mk(catLan, "Prato Feito", 29.9, "is_prato_feito", [1]);

const base = {
  tipo: "retirada",
  cliente_nome: "Maria Cliente",
  cliente_telefone: "41988887777",
  forma_pagamento: "dinheiro",
};
const order = (extra) => call("/public/orders", "POST", { ...base, ...extra });

// =====================================================================
// 1. CARDÁPIO PÚBLICO
// =====================================================================
test("1.1 Cardápio aberto devolve categorias, itens e taxa de entrega", async () => {
  const m = await req("/public/menu");
  assert.equal(m.online_ativo, true);
  assert.ok(m.items.length >= 4);
  assert.equal(m.taxa_entrega_delivery, 10);
  assert.ok(m.categories.some((c) => c.slug === "espetinhos"));
});

test("1.2 Item de uso interno não aparece no cardápio nem pode ser pedido", async () => {
  const m = await req("/public/menu");
  assert.equal(m.items.some((i) => i.id === INTERNO), false);
  const r = await order({ items: [{ item_id: INTERNO, quantity: 1 }] });
  assert.equal(r.status, 400);
});

// =====================================================================
// 2. CRIAÇÃO E VALIDAÇÃO
// =====================================================================
test("2.1 Pedido em dinheiro vai direto para produção (não espera pagamento)", async () => {
  const r = await order({ items: [{ item_id: ESP, quantity: 2 }, { item_id: COCA, quantity: 1 }] });
  assert.equal(r.status, 201);
  assert.equal(r.data.status, "recebido");
  eq(r.data.valor_total, 39.8, "2×15,90 + 8,00");
  const grill = await req("/pedidos/grill");
  assert.ok(grill.some((p) => p.item_name === "Gado com Bacon"), "espetinho chegou na churrasqueira");
});

test("2.2 Delivery soma a taxa de entrega e exige endereço", async () => {
  const sem = await order({ tipo: "delivery", items: [{ item_id: COCA, quantity: 1 }] });
  assert.equal(sem.status, 400);
  const ok = await order({
    tipo: "delivery", endereco_rua: "Rua A", endereco_numero: "10", endereco_bairro: "Centro",
    items: [{ item_id: COCA, quantity: 2 }],
  });
  assert.equal(ok.status, 201);
  eq(ok.data.valor_total, 26, "2×8,00 + taxa 10,00");
});

test("2.3 Dados obrigatórios, forma de pagamento e carrinho vazio", async () => {
  assert.equal((await order({ cliente_nome: "", items: [{ item_id: COCA, quantity: 1 }] })).status, 400);
  assert.equal((await order({ cliente_telefone: "", items: [{ item_id: COCA, quantity: 1 }] })).status, 400);
  assert.equal((await order({ forma_pagamento: "bitcoin", items: [{ item_id: COCA, quantity: 1 }] })).status, 400);
  assert.equal((await order({ items: [] })).status, 400);
  assert.equal((await order({ items: [{ item_id: 999999, quantity: 1 }] })).status, 400);
});

test("2.4 Prato Feito exige escolher o espetinho", async () => {
  const sem = await order({ items: [{ item_id: PF, quantity: 1 }] });
  assert.equal(sem.status, 400);
  const com = await order({ items: [{ item_id: PF, quantity: 1, prato_feito_espetinho_id: ESP }] });
  assert.equal(com.status, 201);
  eq(com.data.valor_total, 29.9);
});

test("2.5 Pedido fora do horário (sistema fechado) é recusado", async () => {
  process.env.PEDIDOS_ONLINE_ATIVO = "0";
  const r = await order({ items: [{ item_id: COCA, quantity: 1 }] });
  assert.equal(r.status, 503);
  const m = await req("/public/menu");
  assert.equal(m.online_ativo, false);
  assert.equal(m.items.length, 0);
  process.env.PEDIDOS_ONLINE_ATIVO = "1";
});

// =====================================================================
// 3. PREÇO (segurança)
// =====================================================================
test("3.1 Preço enviado pelo navegador acima da tabela é ignorado", async () => {
  const r = await order({ items: [{ item_id: COCA, quantity: 1, unit_price: 80 }] });
  eq(r.data.valor_total, 8);
});

test("3.2 Preço absurdamente baixo (0,01) é ignorado e cobra o preço de tabela", async () => {
  const r = await order({ items: [{ item_id: BURG, quantity: 2, unit_price: 0.01 }] });
  assert.equal(r.status, 201);
  eq(r.data.valor_total, 73.8, "2×36,90, não 0,02");
});

test("3.3 Combo (até 15% de desconto por item) continua aceito", async () => {
  // Combo 2 Churraspão + 2 Coca: original 89,80; 15% → 76,33; fator 0,85
  const f = 0.85;
  const r = await order({
    items: [
      { item_id: BURG, quantity: 1, unit_price: Number((36.9 * f).toFixed(2)) },
      { item_id: BURG, quantity: 1, unit_price: Number((36.9 * f).toFixed(2)) },
      { item_id: COCA, quantity: 1, unit_price: Number((8 * f).toFixed(2)) },
      { item_id: COCA, quantity: 1, unit_price: Number((8 * f).toFixed(2)) },
    ],
  });
  assert.equal(r.status, 201);
  eq(r.data.valor_total, Number((36.9 * f).toFixed(2)) * 2 + Number((8 * f).toFixed(2)) * 2, "desconto do combo preservado");
  assert.ok(r.data.valor_total < 36.9 * 2 + 8 * 2, "houve desconto");
});

test("3.4 Desconto acima de 15% não é aceito (cobra tabela)", async () => {
  const r = await order({ items: [{ item_id: BURG, quantity: 1, unit_price: 36.9 * 0.5 }] });
  eq(r.data.valor_total, 36.9);
});

test("3.5 Valor do pedido é gravado em centavos exatos (3 × 19,90 não vira 59,6999…)", async () => {
  const x = mk(catBeb, "Suco 19,90", 19.9);
  const r = await order({ items: [{ item_id: x, quantity: 3 }] });
  assert.equal(db.prepare("SELECT valor_total v FROM orders WHERE id=?").get(r.data.id).v, 59.7);
});

// =====================================================================
// 4. PIX (Mercado Pago simulado)
// =====================================================================
const pixBody = (extra = {}) => ({ forma_pagamento: "pix", items: [{ item_id: ESP, quantity: 2 }, { item_id: COCA, quantity: 1 }], ...extra });

test("4.1 PIX cria cobrança com o valor exato e devolve QR / copia e cola", async () => {
  mp.calls.length = 0;
  const r = await order(pixBody());
  assert.equal(r.status, 201);
  assert.equal(r.data.status, "aguardando_pagamento");
  assert.ok(r.data.pix_qr_code?.startsWith("000201PIX"), "copia e cola");
  assert.equal(r.data.pix_qr_code_base64, "QUJD");
  assert.ok(r.data.pix_expira_em, "prazo de expiração");
  const call = mp.calls.find((c) => c.url === "/v1/payments" && c.method === "POST");
  assert.equal(call.body.transaction_amount, 39.8, "valor enviado ao Mercado Pago");
  assert.equal(call.body.payment_method_id, "pix");
  assert.equal(call.auth, "Bearer TEST-token-simulado");
  assert.equal(call.body.external_reference, String(r.data.id));
});

test("4.2 Pedido aguardando PIX NÃO vai para a cozinha nem para o faturamento", async () => {
  const id = db.prepare("SELECT id FROM orders WHERE status='aguardando_pagamento' ORDER BY id DESC").get().id;
  const o = db.prepare("SELECT comanda_id FROM orders WHERE id=?").get(id);
  const naCozinha = db.prepare("SELECT COUNT(*) n FROM pedidos WHERE comanda_id=?").get(o.comanda_id).n;
  assert.equal(naCozinha, 0, "nada lançado nos setores antes de pagar");
  const f = await req("/reports/faturamento" + today);
  assert.equal(f.faturamentoOnline, 0, "só pedido entregue entra");
});

test("4.3 PIX aprovado libera para produção (uma única vez) ao consultar o pedido", async () => {
  const id = db.prepare("SELECT id FROM orders WHERE status='aguardando_pagamento' ORDER BY id DESC").get().id;
  const row = db.prepare("SELECT mp_payment_id, cliente_telefone, comanda_id FROM orders WHERE id=?").get(id);
  mp.payments.get(Number(row.mp_payment_id)).status = "approved";
  const a = await req(`/public/orders/${id}?telefone=${row.cliente_telefone}`);
  assert.equal(a.status, "recebido");
  assert.equal(a.payment_status, "aprovado");
  const n1 = db.prepare("SELECT COUNT(*) n FROM pedidos WHERE comanda_id=?").get(row.comanda_id).n;
  assert.ok(n1 >= 2, "itens lançados na produção");
  // consultar de novo não duplica
  await req(`/public/orders/${id}?telefone=${row.cliente_telefone}`);
  const n2 = db.prepare("SELECT COUNT(*) n FROM pedidos WHERE comanda_id=?").get(row.comanda_id).n;
  assert.equal(n2, n1, "não duplica itens");
});

test("4.4 PIX rejeitado ou cancelado cancela o pedido com motivo", async () => {
  const r = await order(pixBody());
  const row = db.prepare("SELECT id, mp_payment_id, cliente_telefone FROM orders WHERE id=?").get(r.data.id);
  mp.payments.get(Number(row.mp_payment_id)).status = "rejected";
  const a = await req(`/public/orders/${row.id}?telefone=${row.cliente_telefone}`);
  assert.equal(a.status, "cancelado");
  assert.match(a.motivo_cancelamento, /PIX/i);
});

test("4.5 PIX que passou do prazo é cancelado no Mercado Pago e no sistema", async () => {
  const r = await order(pixBody());
  const row = db.prepare("SELECT id, mp_payment_id, cliente_telefone FROM orders WHERE id=?").get(r.data.id);
  db.prepare("UPDATE orders SET pix_expira_em=? WHERE id=?").run(new Date(Date.now() - 60000).toISOString(), row.id);
  const a = await req(`/public/orders/${row.id}?telefone=${row.cliente_telefone}`);
  assert.equal(a.status, "cancelado");
  assert.equal(a.payment_status, "expirado");
  assert.equal(mp.payments.get(Number(row.mp_payment_id)).status, "cancelled", "cobrança cancelada no Mercado Pago");
});

test("4.6 Mercado Pago fora do ar: pedido não se perde, segue para atendimento combinar o pagamento", async () => {
  mp.failCreate = true;
  const r = await order(pixBody());
  mp.failCreate = false;
  assert.equal(r.status, 201);
  assert.equal(r.data.pix_indisponivel, true);
  assert.equal(r.data.status, "recebido");
  assert.match(r.data.message, /atendente/i);
});

test("4.7 Pedido PIX só pode ser consultado com o telefone do cliente", async () => {
  const r = await order(pixBody());
  assert.equal((await call(`/public/orders/${r.data.id}`)).status, 403);
  assert.equal((await call(`/public/orders/${r.data.id}?telefone=0000`)).status, 403);
  assert.equal((await call(`/public/orders/${r.data.id}?telefone=41988887777`)).status, 200);
});

test("4.8 PIX de delivery cobra itens + taxa de entrega", async () => {
  mp.calls.length = 0;
  const r = await order(pixBody({
    tipo: "delivery", endereco_rua: "Rua B", endereco_numero: "5", endereco_bairro: "Centro",
    items: [{ item_id: COCA, quantity: 3 }],
  }));
  eq(r.data.valor_total, 34, "3×8 + 10");
  const call = mp.calls.find((c) => c.url === "/v1/payments");
  assert.equal(call.body.transaction_amount, 34);
});

// =====================================================================
// 5. ACOMPANHAMENTO, FINANCEIRO E RELATÓRIOS
// =====================================================================
test("5.1 Último pedido do telefone é encontrado pelo número", async () => {
  const r = await call("/public/orders/ultimo?telefone=41988887777");
  assert.equal(r.status, 200);
  assert.ok(r.data.id);
});

test("5.2 Pedido entregue entra no faturamento online com o valor do pedido (inclui entrega)", async () => {
  const before = (await req("/reports/faturamento" + today)).faturamentoOnline;
  const r = await order({
    tipo: "delivery", endereco_rua: "Rua C", endereco_numero: "7", endereco_bairro: "Centro",
    items: [{ item_id: ESP, quantity: 4 }], // 63,60 + 10
  });
  await req(`/orders/${r.data.id}/status`, "PATCH", { status: "entregue" });
  const f = await req("/reports/faturamento" + today);
  eq(f.faturamentoOnline - before, 73.6);
  const fin = await req("/finance/daily" + today);
  assert.ok(fin.totals.sales_online >= 73.6);
});

test("5.3 Pedido cancelado não entra em relatório nenhum", async () => {
  const before = (await req("/reports/faturamento" + today)).faturamentoOnline;
  const r = await order({ items: [{ item_id: BURG, quantity: 5 }] });
  await req(`/orders/${r.data.id}/status`, "PATCH", { status: "cancelado", motivo_cancelamento: "cliente desistiu" });
  eq((await req("/reports/faturamento" + today)).faturamentoOnline, before);
});

test("5.4 Taxa de entrega aparece nas categorias e a soma fecha com o faturamento", async () => {
  const f = await req("/reports/faturamento" + today);
  const cats = await req("/reports/por-categoria" + today);
  const soma = cats.reduce((n, c) => n + Math.round(c.total * 100), 0);
  assert.ok(cats.some((c) => c.category_name === "Taxa de entrega"));
  assert.equal(soma + Math.round(f.taxaServico * 100), Math.round(f.faturamento * 100));
});

test("5.5 Itens vendidos online somam as quantidades entregues", async () => {
  const top = await req("/reports/itens-mais-vendidos" + today);
  const esp = top.find((t) => t.name === "Gado com Bacon");
  assert.equal(esp.total_quantity, 4, "só o pedido entregue (4 espetinhos)");
});

// =====================================================================
// 6. O QUE APARECE NO CARDÁPIO ONLINE
// =====================================================================
test("6.1 Todo item que não é 'só PDV' aparece online, inclusive Chopp/Cerveja, Drinks e Doses", async () => {
  const chopp = Number(db.prepare("INSERT INTO categories(name,slug,sort_order) VALUES('Chopp / Cerveja','chopp-cerveja',20)").run().lastInsertRowid);
  const drinks = Number(db.prepare("INSERT INTO categories(name,slug,sort_order) VALUES('Drinks','drinks',21)").run().lastInsertRowid);
  const doses = Number(db.prepare("INSERT INTO categories(name,slug,sort_order) VALUES('Doses','doses',22)").run().lastInsertRowid);
  const ids = [mk(chopp, "Heineken 600ml", 19.9), mk(drinks, "Caipicerva", 37.9), mk(doses, "Campari", 19)];
  const m = await req("/public/menu");
  for (const id of ids) assert.ok(m.items.some((i) => i.id === id), "item " + id + " deveria aparecer");
  for (const slug of ["chopp-cerveja", "drinks", "doses"]) assert.ok(m.categories.some((c) => c.slug === slug), slug);
});

test("6.2 A opção 'só PDV' do item tira ele do cardápio online e bloqueia o pedido", async () => {
  const id = mk(catBeb, "Item só do salão", 9);
  assert.ok((await req("/public/menu")).items.some((i) => i.id === id));
  db.prepare("UPDATE items SET internal_only=1 WHERE id=?").run(id);
  assert.equal((await req("/public/menu")).items.some((i) => i.id === id), false);
  assert.equal((await order({ items: [{ item_id: id, quantity: 1 }] })).status, 400);
  db.prepare("UPDATE items SET internal_only=0 WHERE id=?").run(id);
  assert.ok((await req("/public/menu")).items.some((i) => i.id === id), "volta ao desmarcar");
});

test("6.3 Couvert lançado na comanda nasce como 'só PDV' e não aparece no cardápio online", async () => {
  await req("/comandas/7/open", "POST", { mesa: "7" });
  await req("/comandas/7", "PATCH", { people_count: 2 });
  await req("/comandas/7/lancar-couvert", "POST", {});
  const couvert = db.prepare("SELECT id, internal_only FROM items WHERE lower(name)='couvert'").get();
  assert.equal(Number(couvert.internal_only), 1);
  const m = await req("/public/menu");
  assert.equal(m.items.some((i) => i.id === couvert.id), false);
  assert.equal((await order({ items: [{ item_id: couvert.id, quantity: 1 }] })).status, 400);
});

test("6.4 Couvert que já existia sem a marca passa a 'só PDV' ao atualizar o sistema", async () => {
  db.prepare("UPDATE items SET internal_only=0 WHERE lower(name)='couvert'").run();
  initDb();
  assert.equal(Number(db.prepare("SELECT internal_only FROM items WHERE lower(name)='couvert'").get().internal_only), 1);
});

test.after(() => {
  server.close();
  mpServer.close();
  db.close();
});
