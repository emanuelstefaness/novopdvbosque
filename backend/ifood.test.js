/**
 * Integração iFood: importação de pedidos (itens, setores, valores, idempotência, mapeamento),
 * aparecer na produção, relatórios e o ciclo de eventos da API (com iFood simulado).
 * Banco em memória e API simulada: não toca no banco real nem na internet.
 */
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.PDV_DB_PATH = ":memory:";

const { db, initDb } = await import("./db.js");
const ifood = await import("./ifood.js");
const { pedidosRouter } = await import("./routes/pedidos.js");
const { ifoodRouter } = await import("./routes/ifood.js");
const { receipts, deliveryAdjustments, businessToday } = await import("./reporting.js");
initDb();

const app = express();
app.use(express.json());
app.set("db", db);
app.use((req, _res, next) => ((req.user = { isCaixa: true }), next()));
app.use("/pedidos", pedidosRouter);
app.use("/ifood", ifoodRouter);
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const url = `http://127.0.0.1:${server.address().port}`;
const call = async (path, method = "GET", body) => {
  const r = await fetch(url + path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};

const catEsp = Number(db.prepare("INSERT INTO categories(name,slug,sort_order) VALUES('Espetinhos','espetinhos',1)").run().lastInsertRowid);
const catLan = Number(db.prepare("INSERT INTO categories(name,slug,sort_order) VALUES('Lanches','lanches',2)").run().lastInsertRowid);
const catDrk = Number(db.prepare("INSERT INTO categories(name,slug,sort_order) VALUES('Drinks','drinks',3)").run().lastInsertRowid);
const mk = (cat, name, price, flag) =>
  Number(db.prepare(`INSERT INTO items(category_id,name,price,${flag}) VALUES(?,?,?,1)`).run(cat, name, price).lastInsertRowid);
const ESP = mk(catEsp, "Gado com Bacon", 15.9, "is_grill");
const BURG = mk(catLan, "Churraspão", 36.9, "is_kitchen");
const CAIP = mk(catDrk, "Caipirinha de Limão", 18, "is_bar");

let seq = 0;
function pedido(extra = {}) {
  seq += 1;
  return {
    id: `ifood-uuid-${seq}`,
    displayId: String(5000 + seq),
    orderType: "DELIVERY",
    customer: { name: "Ana iFood", phone: { number: "0800 41 98888-1234" } },
    delivery: { deliveryAddress: { streetName: "Rua A", streetNumber: "10", neighborhood: "Centro", complement: "casa 2", reference: "perto da praça" } },
    items: [
      { id: "i1", name: "Gado com Bacon", externalCode: "ESP01", quantity: 2, unitPrice: 15.9, totalPrice: 31.8, observations: "bem passado" },
      { id: "i2", name: "Churraspão", quantity: 1, unitPrice: 34.9, optionsPrice: 2, totalPrice: 36.9, options: [{ name: "Cheddar", quantity: 1 }] },
      { id: "i3", name: "Caipirinha de Limao", quantity: 1, unitPrice: 18, totalPrice: 18 },
    ],
    total: { subTotal: 86.7, deliveryFee: 7, orderAmount: 93.7 },
    payments: { prepaid: 93.7, pending: 0, methods: [{ method: "CREDIT", type: "ONLINE", value: 93.7, prepaid: true }] },
    ...extra,
  };
}

test("1. Pedido do iFood vira pedido + comanda e os itens vão para o setor certo", () => {
  const r = ifood.importarPedidoIfood(db, pedido(), { avisar: false });
  assert.equal(r.duplicado, false);
  const o = db.prepare("SELECT * FROM orders WHERE id = ?").get(r.orderId);
  assert.equal(o.origem, "ifood");
  assert.equal(o.status, "recebido");
  assert.equal(o.tipo, "delivery");
  assert.equal(o.forma_pagamento, "ifood");
  assert.equal(o.payment_status, "aprovado");
  assert.equal(o.valor_total, 93.7);
  assert.equal(o.external_ref, "5001");
  assert.equal(o.endereco_rua, "Rua A");
  assert.match(o.observacoes, /PAGO NO IFOOD/);
  const c = db.prepare("SELECT * FROM comandas WHERE id = ?").get(r.comandaId);
  assert.equal(c.origem, "ifood");
  assert.equal(c.mesa, "iFood #5001");
  assert.equal(c.origin_order_id, r.orderId);
  const setores = db.prepare("SELECT sector, item_id, quantity, unit_price FROM pedidos WHERE comanda_id = ? ORDER BY id").all(r.comandaId);
  assert.deepEqual(setores.map((p) => [p.item_id, p.sector]), [[ESP, "grill"], [BURG, "kitchen"], [CAIP, "bar"]]);
  assert.equal(setores[0].quantity, 2);
  assert.equal(setores[0].unit_price, 15.9);
  assert.equal(setores[1].unit_price, 36.9, "preço da linha inclui os adicionais");
  assert.equal(r.itensNaoMapeados.length, 0, "casou por nome (sem acento) com o cardápio");
});

test("2. Observações e opções do item chegam na produção", () => {
  const o = db.prepare("SELECT id FROM orders WHERE external_ref = '5001'").get();
  const obs = db.prepare("SELECT observations FROM pedidos WHERE comanda_id = (SELECT comanda_id FROM orders WHERE id = ?) ORDER BY id").all(o.id).map((p) => p.observations);
  assert.equal(obs[0], "bem passado");
  assert.equal(obs[1], "com: Cheddar");
});

test("3. Importar o mesmo pedido duas vezes não duplica", () => {
  const p = pedido();
  const a = ifood.importarPedidoIfood(db, p, { avisar: false });
  const b = ifood.importarPedidoIfood(db, p, { avisar: false });
  assert.equal(b.duplicado, true);
  assert.equal(b.orderId, a.orderId);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders WHERE external_id = ?").get(p.id).n, 1);
});

test("4. Item desconhecido não perde o pedido: entra como item interno e fica pendente de mapeamento", () => {
  const p = pedido({ items: [{ id: "x", name: "Combo Misterioso", externalCode: "MIST9", quantity: 1, unitPrice: 50, totalPrice: 50 }], total: { orderAmount: 50 } });
  const r = ifood.importarPedidoIfood(db, p, { avisar: false });
  assert.deepEqual(r.itensNaoMapeados, ["Combo Misterioso"]);
  const item = db.prepare("SELECT i.name, i.internal_only, c.slug FROM pedidos p JOIN items i ON i.id=p.item_id JOIN categories c ON c.id=i.category_id WHERE p.comanda_id = ?").get(r.comandaId);
  assert.equal(item.name, "[iFood] Combo Misterioso");
  assert.equal(item.internal_only, 1, "não aparece no cardápio online");
  assert.equal(item.slug, "ifood-nao-mapeados");
  assert.equal(db.prepare("SELECT sector FROM pedidos WHERE comanda_id = ?").get(r.comandaId).sector, "kitchen");
});

test("5. Depois de mapear, o item vai para o setor correto e não cria mais item interno", async () => {
  const antes = db.prepare("SELECT COUNT(*) AS n FROM items").get().n;
  const m = await call("/ifood/mapa", "PUT", { external_key: "code:MIST9", item_id: ESP });
  assert.equal(m.status, 200);
  const r = ifood.importarPedidoIfood(db, pedido({ items: [{ id: "x", name: "Combo Misterioso", externalCode: "MIST9", quantity: 1, unitPrice: 50, totalPrice: 50 }], total: { orderAmount: 50 } }), { avisar: false });
  assert.equal(r.itensNaoMapeados.length, 0);
  assert.equal(db.prepare("SELECT sector, item_id FROM pedidos WHERE comanda_id = ?").get(r.comandaId).item_id, ESP);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM items").get().n, antes);
  const mapa = (await call("/ifood/mapa")).data;
  assert.equal(mapa.find((x) => x.external_key === "code:MIST9").auto_created, 0);
});

test("6. Retirada (TAKEOUT) e pagamento na entrega com troco", () => {
  const r = ifood.importarPedidoIfood(db, pedido({
    orderType: "TAKEOUT",
    payments: { prepaid: 0, pending: 93.7, methods: [{ method: "CASH", type: "OFFLINE", value: 93.7, prepaid: false, cash: { changeFor: 100 } }] },
  }), { avisar: false });
  const o = db.prepare("SELECT * FROM orders WHERE id = ?").get(r.orderId);
  assert.equal(o.tipo, "retirada");
  assert.equal(o.endereco_rua, null);
  assert.equal(o.payment_status, "pendente");
  assert.match(o.observacoes, /COBRAR NA ENTREGA: CASH R\$ 93,70 — troco para R\$ 100,00/);
});

test("7. A produção recebe a origem e o número do iFood", async () => {
  const grill = (await call("/pedidos/grill")).data;
  const lista = Array.isArray(grill) ? grill : grill.pedidos || grill.main || [];
  const doIfood = lista.filter((p) => p.comanda_origem === "ifood");
  assert.ok(doIfood.length >= 1, "pedido do iFood aparece na churrasqueira");
  assert.match(doIfood[0].comanda_origem_ref, /^50\d\d$/);
  const bar = (await call("/pedidos/bar")).data;
  assert.ok((Array.isArray(bar) ? bar : []).some((p) => p.comanda_origem === "ifood"));
});

test("8. Relatórios: entregue entra como faturamento online, com a taxa separada", () => {
  const r = ifood.importarPedidoIfood(db, pedido(), { avisar: false });
  db.prepare("UPDATE orders SET status='entregue', delivered_at=datetime('now','localtime') WHERE id=?").run(r.orderId);
  const hoje = businessToday();
  const rec = receipts(db, hoje, hoje).filter((x) => x.channel === "online");
  assert.ok(rec.some((x) => x.total === 93.7));
  const adj = deliveryAdjustments(db, hoje, hoje);
  assert.equal(adj.fee, 700 * 1, "taxa de entrega = 93,70 − itens 86,70");
});

test("9. Cancelamento no iFood cancela o pedido no PDV (e não mexe em entregue)", () => {
  const r = ifood.importarPedidoIfood(db, pedido(), { avisar: false });
  assert.equal(ifood.cancelarPedidoIfood(db, db.prepare("SELECT external_id FROM orders WHERE id=?").get(r.orderId).external_id), true);
  assert.equal(db.prepare("SELECT status FROM orders WHERE id=?").get(r.orderId).status, "cancelado");
  db.prepare("UPDATE orders SET status='entregue' WHERE id=?").run(r.orderId);
  assert.equal(ifood.cancelarPedidoIfood(db, db.prepare("SELECT external_id FROM orders WHERE id=?").get(r.orderId).external_id), false);
});

// ---------- API do iFood simulada ----------
function apiFalsa() {
  const estado = { eventos: [], pedidos: new Map(), acks: [], acoes: [], tokens: 0 };
  const fetchImpl = async (u, opts = {}) => {
    const path = new URL(u).pathname;
    const json = (code, obj) => ({ ok: code < 300, status: code, json: async () => obj, text: async () => (obj == null ? "" : JSON.stringify(obj)) });
    if (path.endsWith("/oauth/token")) {
      estado.tokens += 1;
      assert.match(String(opts.body), /grantType=client_credentials/);
      return json(200, { accessToken: "tok", expiresIn: 3600 });
    }
    assert.equal(opts.headers.Authorization, "Bearer tok");
    if (path.endsWith("/events:polling")) return estado.eventos.length ? json(200, estado.eventos) : { ok: true, status: 204, text: async () => "" };
    if (path.endsWith("/acknowledgment")) { estado.acks.push(...JSON.parse(opts.body).map((e) => e.id)); return json(202, null); }
    if (path.endsWith("/cancellationReasons")) return json(200, [{ cancelCodeId: "501", description: "PROBLEMAS DE SISTEMA" }]);
    if (path.endsWith("/requestCancellation")) {
      estado.cancelamentos = estado.cancelamentos || [];
      estado.cancelamentos.push(JSON.parse(opts.body));
      return json(202, null);
    }
    const m = path.match(/\/orders\/([^/]+)(?:\/(\w+))?$/);
    if (m && m[2]) { estado.acoes.push([m[1], m[2]]); return json(202, null); }
    if (m) return estado.pedidos.has(m[1]) ? json(200, estado.pedidos.get(m[1])) : json(404, {});
    return json(404, {});
  };
  return { estado, fetchImpl };
}

test("10. Polling: importa pedido novo, confirma o evento e reaproveita o token", async () => {
  const api = apiFalsa();
  const p = pedido();
  api.estado.pedidos.set(p.id, p);
  api.estado.eventos = [{ id: "ev1", code: "PLC", orderId: p.id }, { id: "ev2", code: "KEEPALIVE" }];
  const cli = ifood.criarClienteIfood({ clientId: "a", clientSecret: "b", baseUrl: "http://ifood.test", fetchImpl: api.fetchImpl });
  const r = await ifood.processarEventosIfood(db, cli, { modo: "integrado" });
  assert.deepEqual(r, { eventos: 2, confirmados: 2 });
  assert.deepEqual(api.estado.acks, ["ev1", "ev2"]);
  assert.ok(db.prepare("SELECT 1 FROM orders WHERE external_id = ?").get(p.id));
  await ifood.processarEventosIfood(db, cli, { modo: "integrado" });
  assert.equal(api.estado.tokens, 1, "token reaproveitado");
  await new Promise((r2) => setTimeout(r2, 20));
  assert.ok(api.estado.acoes.some(([id, a]) => id === p.id && a === "confirm"), "pedido confirmado no iFood");
});

test("11. Polling: evento CAN cancela; evento com falha não é confirmado (volta no próximo ciclo)", async () => {
  const api = apiFalsa();
  const p = pedido();
  ifood.importarPedidoIfood(db, p, { avisar: false });
  api.estado.eventos = [{ id: "c1", code: "CAN", orderId: p.id }, { id: "f1", code: "PLC", orderId: "nao-existe" }];
  const cli = ifood.criarClienteIfood({ clientId: "a", clientSecret: "b", baseUrl: "http://ifood.test", fetchImpl: api.fetchImpl });
  const r = await ifood.processarEventosIfood(db, cli, { modo: "integrado" });
  assert.equal(r.confirmados, 1);
  assert.deepEqual(api.estado.acks, ["c1"]);
  assert.equal(db.prepare("SELECT status FROM orders WHERE external_id = ?").get(p.id).status, "cancelado");
});

test("12. Status do PDV vira a ação certa no iFood", async () => {
  const api = apiFalsa();
  const cli = ifood.criarClienteIfood({ clientId: "a", clientSecret: "b", baseUrl: "http://ifood.test", fetchImpl: api.fetchImpl });
  for (const s of ["em_producao", "pronto", "saiu_entrega"]) await cli.avisarStatus("abc", s);
  assert.equal(await cli.avisarStatus("abc", "entregue"), false, "entregue o iFood conclui sozinho");
  assert.deepEqual(api.estado.acoes.map((a) => a[1]), ["startPreparation", "readyToPickup", "dispatch"]);
});

test("13. Rotas: só o caixa acessa; simular cria pedido; status informa pendências", async () => {
  const sim = await call("/ifood/simular", "POST");
  assert.equal(sim.status, 201);
  assert.ok(sim.data.orderId);
  const st = (await call("/ifood/status")).data;
  assert.equal(st.configurado, false);
  assert.ok(st.pedidos_hoje >= 1);
  const ruim = await call("/ifood/pedidos", "POST", { id: "sem-itens", items: [] });
  assert.equal(ruim.status, 400);
});

test("14. Exibe bandeira do cartão, cupom (quem paga), código de coleta e CPF na nota", () => {
  const r = ifood.importarPedidoIfood(db, pedido({
    delivery: { deliveryAddress: { streetName: "Rua B", streetNumber: "5", neighborhood: "Centro" }, observations: "Deixar na portaria", pickupCode: "4821" },
    customer: { name: "Bia", phone: { number: "41977776666" }, documentNumber: "123.456.789-09" },
    benefits: [{ value: 10, sponsorshipValues: [{ name: "IFOOD", value: 6 }, { name: "MERCHANT", value: 4 }] }],
    payments: { prepaid: 0, pending: 50, methods: [{ method: "CREDIT", type: "OFFLINE", value: 50, prepaid: false, card: { brand: "VISA" } }] },
  }), { avisar: false });
  const o = db.prepare("SELECT observacoes FROM orders WHERE id = ?").get(r.orderId).observacoes;
  assert.ok(o.includes("COBRAR NA ENTREGA: CREDIT VISA R$ 50,00"), o);
  assert.ok(o.includes("CUPOM -R$ 10,00 (paga: iFood R$ 6,00 + Loja R$ 4,00)"), o);
  assert.match(o, /CÓDIGO DE COLETA: 4821/);
  assert.match(o, /ENTREGA: Deixar na portaria/);
  assert.ok(o.includes("CPF/CNPJ na nota: 123.456.789-09"), o);
});

test("15. Status feitos por outro sistema (RTP/DSP/CON) são acompanhados, sem voltar etapa", async () => {
  const api = apiFalsa();
  const p = pedido();
  ifood.importarPedidoIfood(db, p, { avisar: false });
  api.estado.eventos = [{ id: "a", code: "DSP", orderId: p.id }, { id: "b", code: "RTP", orderId: p.id }];
  const cli = ifood.criarClienteIfood({ clientId: "a", clientSecret: "b", baseUrl: "http://ifood.test", fetchImpl: api.fetchImpl });
  await ifood.processarEventosIfood(db, cli, { modo: "integrado" });
  assert.equal(db.prepare("SELECT status FROM orders WHERE external_id = ?").get(p.id).status, "saiu_entrega", "RTP depois de DSP não volta etapa");
  api.estado.eventos = [{ id: "c", code: "CON", orderId: p.id }];
  await ifood.processarEventosIfood(db, cli, { modo: "integrado" });
  const o = db.prepare("SELECT status, delivered_at FROM orders WHERE external_id = ?").get(p.id);
  assert.equal(o.status, "entregue");
  assert.ok(o.delivered_at);
});

test("16. Se a confirmação falhar, o evento não é confirmado e volta no próximo ciclo (SLA de 8 min)", async () => {
  const api = apiFalsa();
  const p = pedido();
  api.estado.pedidos.set(p.id, p);
  api.estado.eventos = [{ id: "e1", code: "PLC", orderId: p.id }];
  const base = api.fetchImpl;
  let falhar = true;
  const fetchImpl = async (u, o) => (falhar && String(u).endsWith("/confirm") ? { ok: false, status: 503, text: async () => "" } : base(u, o));
  const cli = ifood.criarClienteIfood({ clientId: "a", clientSecret: "b", baseUrl: "http://ifood.test", fetchImpl });
  const r1 = await ifood.processarEventosIfood(db, cli, { modo: "integrado" });
  assert.equal(r1.confirmados, 0);
  falhar = false;
  const r2 = await ifood.processarEventosIfood(db, cli, { modo: "integrado" });
  assert.equal(r2.confirmados, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders WHERE external_id = ?").get(p.id).n, 1, "reimportar não duplica");
});

test("17. Cancelar no PDV pede o cancelamento ao iFood com um código de motivo válido", async () => {
  const api = apiFalsa();
  const cli = ifood.criarClienteIfood({ clientId: "a", clientSecret: "b", baseUrl: "http://ifood.test", fetchImpl: api.fetchImpl });
  const cod = await ifood.cancelarNoIfood(cli, "abc", { motivo: "Sem estoque" });
  assert.equal(cod, "501");
  assert.deepEqual(api.estado.cancelamentos[0], { reason: "Sem estoque", cancellationCode: "501" });
});

test("18. Saiu para entrega sem 'pronto' antes envia readyToPickup primeiro; token só renova no 401", async () => {
  const api = apiFalsa();
  let primeiro401 = true;
  const base = api.fetchImpl;
  const fetchImpl = async (u, o) => {
    if (primeiro401 && String(u).includes("/orders/")) { primeiro401 = false; return { ok: false, status: 401, text: async () => "" }; }
    return base(u, o);
  };
  const cli = ifood.criarClienteIfood({ clientId: "a", clientSecret: "b", baseUrl: "http://ifood.test", fetchImpl });
  await cli.avisarStatus("zzz", "saiu_entrega");
  assert.deepEqual(api.estado.acoes.map((a) => a[1]), ["readyToPickup", "dispatch"]);
  assert.equal(api.estado.tokens, 2, "renovou uma vez, após o 401");
});

test("19. Acknowledgment em lotes de no máximo 2000 ids", async () => {
  const api = apiFalsa();
  const cli = ifood.criarClienteIfood({ clientId: "a", clientSecret: "b", baseUrl: "http://ifood.test", fetchImpl: api.fetchImpl });
  await cli.confirmarEventos(Array.from({ length: 4500 }, (_, i) => "id" + i));
  assert.equal(api.estado.acks.length, 4500);
});

test("20. Modo portal (padrão): o pedido só entra na produção quando é aceito no iFood, sem o PDV confirmar nada", async () => {
  const api = apiFalsa();
  const p = pedido();
  api.estado.pedidos.set(p.id, p);
  const cli = ifood.criarClienteIfood({ clientId: "a", clientSecret: "b", baseUrl: "http://ifood.test", fetchImpl: api.fetchImpl });
  // 1) pedido novo (ainda não aceito): nada aparece na produção, evento é reconhecido
  api.estado.eventos = [{ id: "p1", code: "PLC", orderId: p.id }];
  const r1 = await ifood.processarEventosIfood(db, cli, { modo: "portal" });
  assert.equal(r1.confirmados, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders WHERE external_id = ?").get(p.id).n, 0);
  // 2) aceito no portal do iFood: aparece na produção
  api.estado.eventos = [{ id: "p2", code: "CFM", orderId: p.id }];
  await ifood.processarEventosIfood(db, cli, { modo: "portal" });
  const o = db.prepare("SELECT status, origem FROM orders WHERE external_id = ?").get(p.id);
  assert.deepEqual({ ...o }, { status: "recebido", origem: "ifood" });
  assert.ok(db.prepare("SELECT 1 FROM pedidos WHERE comanda_id = (SELECT comanda_id FROM orders WHERE external_id = ?)").get(p.id));
  // 3) o PDV não chamou nenhuma ação (confirm etc.) no iFood
  assert.deepEqual(api.estado.acoes, []);
  // 4) mesmo evento repetido não duplica
  api.estado.eventos = [{ id: "p3", code: "CFM", orderId: p.id }];
  await ifood.processarEventosIfood(db, cli, { modo: "portal" });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders WHERE external_id = ?").get(p.id).n, 1);
});

test("21. Entrega pela logística do iFood (deliveredBy IFOOD): o PDV não envia dispatch", async () => {
  const api = apiFalsa();
  const cli = ifood.criarClienteIfood({ clientId: "a", clientSecret: "b", baseUrl: "http://ifood.test", fetchImpl: api.fetchImpl });
  assert.equal(await cli.avisarStatus("lg1", "saiu_entrega", { entregaPor: "IFOOD" }), false);
  assert.deepEqual(api.estado.acoes, []);
  const r = ifood.importarPedidoIfood(db, pedido({ delivery: { deliveredBy: "IFOOD", deliveryAddress: { streetName: "R", streetNumber: "1", neighborhood: "C" } } }), { avisar: false });
  assert.equal(db.prepare("SELECT entrega_por FROM orders WHERE id = ?").get(r.orderId).entrega_por, "IFOOD");
});

test("22. Pedido cancelado ou concluído sai da fila de produção (não fica contando na Cozinha)", () => {
  const abertos = (comandaId) => db.prepare("SELECT COUNT(*) AS n FROM pedidos WHERE comanda_id = ? AND status NOT IN ('cancelled','delivered')").get(comandaId).n;
  const a = ifood.importarPedidoIfood(db, pedido(), { avisar: false });
  assert.ok(abertos(a.comandaId) > 0);
  ifood.cancelarPedidoIfood(db, db.prepare("SELECT external_id FROM orders WHERE id=?").get(a.orderId).external_id);
  assert.equal(abertos(a.comandaId), 0, "cancelado no iFood esvazia a produção");
  const b = ifood.importarPedidoIfood(db, pedido(), { avisar: false });
  ifood.sincronizarStatusIfood(db, db.prepare("SELECT external_id FROM orders WHERE id=?").get(b.orderId).external_id, "entregue");
  assert.equal(abertos(b.comandaId), 0, "concluído no iFood esvazia a produção");
  const fila = db.prepare("SELECT COUNT(*) AS n FROM pedido_sector_status s JOIN pedidos p ON p.id = s.pedido_id WHERE p.comanda_id IN (?, ?) AND s.status != 'ready'").get(a.comandaId, b.comandaId).n;
  assert.equal(fila, 0);
});

test.after(() => server.close());
