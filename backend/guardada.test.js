/**
 * Conta guardada (pagar depois) e histórico de comandas.
 * Banco em memória: não toca no banco real.
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.PDV_DB_PATH = ":memory:";

const { db, initDb } = await import("./db.js");
const { comandasRouter } = await import("./routes/comandas.js");
const { historicoRouter } = await import("./routes/historico.js");
const { pedidosRouter } = await import("./routes/pedidos.js");
const { cashRouter, initCash } = await import("./routes/cash.js");
const { ordersRouter } = await import("./routes/orders.js");
initDb();
initCash(db);

const app = express();
app.use(express.json());
app.set("db", db);
app.use((req, _res, next) => ((req.user = { isCaixa: true, name: "Caixa Teste" }), next()));
app.use("/comandas", comandasRouter);
app.use("/pedidos", pedidosRouter);
app.use("/historico", historicoRouter);
app.use("/cash", cashRouter);
app.use("/orders", ordersRouter);
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const url = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());
const call = async (path, method = "GET", body) => {
  const r = await fetch(url + path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};

const cat = Number(db.prepare("INSERT INTO categories(name,slug,sort_order) VALUES('Espetinhos','espetinhos',1)").run().lastInsertRowid);
const ESP = Number(db.prepare("INSERT INTO items(category_id,name,price,is_grill) VALUES(?,?,?,1)").run(cat, "Gado com Bacon", 20).lastInsertRowid);
db.prepare("INSERT INTO cash_shifts(operator,opening_cents) VALUES('Teste',0)").run();

async function abrirComItens(id, mesa, qtd = 2) {
  assert.equal((await call(`/comandas/${id}/open`, "POST", { mesa })).status, 200);
  const r = await call("/pedidos", "POST", { comanda_id: id, item_id: ESP, quantity: qtd });
  assert.equal(r.status, 201);
}
const receber = (id, total, key) =>
  call("/cash/receive", "POST", { request_key: key, comanda_id: id, expected_total: total, tenders: [{ method: "pix", amount: total }] });

test("1. Guardar exige nome e itens a pagar", async () => {
  await abrirComItens(10, "5");
  assert.equal((await call("/comandas/10/guardar", "POST", {})).status, 400);
  assert.equal((await call("/comandas/10/guardar", "POST", { cliente_nome: "A" })).status, 400);
  await call("/comandas/11/open", "POST", { mesa: "6" });
  const vazia = await call("/comandas/11/guardar", "POST", { cliente_nome: "João da Silva" });
  assert.equal(vazia.status, 400);
  assert.match(vazia.data.error, /itens a pagar/);
});

test("2. Guardada: mantém número e itens, bloqueia lançamentos e não pode ser aberta por outro", async () => {
  const g = await call("/comandas/10/guardar", "POST", { cliente_nome: "Maria Souza", cliente_telefone: "(42) 99999-1111", observacao: "paga sexta" });
  assert.equal(g.status, 200);
  assert.equal(g.data.saldo, 40);
  const c = db.prepare("SELECT * FROM comandas WHERE id = 10").get();
  assert.equal(c.status, "guardada");
  assert.equal(c.locked, 1);
  assert.equal(c.cliente_nome, "Maria Souza");
  assert.equal(c.cliente_telefone, "429999911111".slice(0, 11));
  assert.equal(c.guardada_por, "Caixa Teste");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM pedidos WHERE comanda_id = 10").get().n, 1, "itens continuam na comanda");

  const novo = await call("/pedidos", "POST", { comanda_id: 10, item_id: ESP, quantity: 1 });
  assert.equal(novo.status, 400, "comanda guardada fica bloqueada");
  const reabrir = await call("/comandas/10/open", "POST", { mesa: "9" });
  assert.equal(reabrir.status, 400);
  assert.match(reabrir.data.error, /guardada/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM pedidos WHERE comanda_id = 10").get().n, 1, "nada foi apagado");

  const lista = await call("/comandas");
  assert.equal(lista.data["10"].status, "guardada");
  assert.equal(lista.data["10"].saldo, 40);
});

test("3. Retomar volta ao atendimento e desbloqueia", async () => {
  assert.equal((await call("/comandas/10/retomar", "POST")).status, 200);
  const c = db.prepare("SELECT status, locked FROM comandas WHERE id = 10").get();
  assert.equal(c.status, "ordering");
  assert.equal(c.locked, 0);
  assert.equal((await call("/comandas/10/retomar", "POST")).status, 400, "só retoma o que está guardado");
  assert.equal((await call("/pedidos", "POST", { comanda_id: 10, item_id: ESP, quantity: 1 })).status, 201);
});

test("4. Guardar, pagar depois e aparecer no histórico com cliente e meio de pagamento", async () => {
  assert.equal((await call("/comandas/10/guardar", "POST", { cliente_nome: "Maria Souza" })).status, 200);
  const sessao = db.prepare("SELECT session_key FROM comandas WHERE id = 10").get().session_key;

  let hist = await call("/historico");
  assert.equal(hist.data.quantidade, 0, "ainda não foi paga: não há recebimento no histórico");

  const pago = await receber(10, 60, "chave-pagamento-guardada-1");
  assert.equal(pago.status, 200, JSON.stringify(pago.data));
  assert.equal(pago.data.closed, true);
  assert.equal(db.prepare("SELECT status FROM comandas WHERE id = 10").get().status, "closed");

  hist = await call("/historico");
  assert.equal(hist.data.quantidade, 1);
  const linha = hist.data.comandas[0];
  assert.equal(linha.comanda_id, 10);
  assert.equal(linha.total, 60);
  assert.equal(linha.cliente_nome, "Maria Souza");
  assert.equal(linha.situacao, "fechada");

  const det = await call(`/historico/${sessao}`);
  assert.equal(det.status, 200);
  assert.equal(det.data.total, 60);
  assert.equal(det.data.itens[0].nome, "Gado com Bacon");
  assert.equal(det.data.itens[0].quantidade, 3);
  assert.equal(det.data.pagamentos[0].meios[0].meio, "pix");
  assert.equal(det.data.pagamentos[0].operador, "Caixa Teste");
});

test("5. Histórico sobrevive à reutilização do número e a nova sessão não herda o cliente", async () => {
  const antes = (await call("/historico")).data.comandas[0].session_key;
  await call("/comandas/10/open", "POST", { mesa: "7" });
  const c = db.prepare("SELECT * FROM comandas WHERE id = 10").get();
  assert.equal(c.cliente_nome, null);
  assert.equal(c.locked, 0);
  assert.notEqual(c.session_key, antes);

  const hist = await call("/historico");
  const antiga = hist.data.comandas.find((x) => x.session_key === antes);
  assert.ok(antiga, "a conta anterior continua consultável");
  assert.equal(antiga.cliente_nome, "Maria Souza", "o nome vem do retrato guardado ao reutilizar o número");
});

test("6. Filtros do histórico: busca e período", async () => {
  assert.equal((await call("/historico?q=maria")).data.quantidade, 1);
  assert.equal((await call("/historico?q=zzz")).data.quantidade, 0);
  assert.equal((await call("/historico?from=2001-01-01&to=2001-01-31")).data.quantidade, 0);
  assert.equal((await call("/historico/inexistente")).status, 404);
});

test("7. Pedidos online: a tela mostra só os de hoje (a partir das 00:00); os anteriores vão para o histórico", async () => {
  const ins = db.prepare(`INSERT INTO orders(tipo,status,cliente_nome,cliente_telefone,valor_total,forma_pagamento,origem,external_ref,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,datetime('now','localtime', ?),datetime('now','localtime', ?))`);
  const ontem = Number(ins.run("delivery", "entregue", "Cliente de Ontem", "42999990001", 80, "pix", "proprio", null, "-1 day", "-1 day").lastInsertRowid);
  const ontemIfood = Number(ins.run("delivery", "entregue", "Ana iFood", "42999990002", 50, "ifood", "ifood", "4821", "-1 day", "-1 day").lastInsertRowid);
  const ontemCancelado = Number(ins.run("retirada", "cancelado", "Cancelou Ontem", "42999990003", 30, "pix", "proprio", null, "-1 day", "-1 day").lastInsertRowid);
  const hojeId = Number(ins.run("delivery", "recebido", "Cliente de Hoje", "42999990004", 60, "pix", "proprio", null, "+0 seconds", "+0 seconds").lastInsertRowid);

  const tela = (await call("/orders")).data.map((o) => o.id);
  assert.ok(tela.includes(hojeId), "o pedido de hoje fica na tela");
  for (const id of [ontem, ontemIfood, ontemCancelado]) assert.ok(!tela.includes(id), "pedido de ontem sai da tela");
  assert.ok((await call("/orders?dia=todos")).data.some((o) => o.id === ontem), "dia=todos devolve tudo");

  const de = db.prepare("SELECT date('now','localtime','-1 day') d").get().d;
  const ate = db.prepare("SELECT date('now','localtime') d").get().d;
  const periodo = `from=${de}&to=${ate}`;
  const hist = (await call(`/historico?${periodo}`)).data;
  const por = Object.fromEntries(hist.comandas.filter((c) => c.session_key.startsWith("pedido-")).map((c) => [c.session_key, c]));
  assert.equal(por[`pedido-${ontem}`].origem, "online");
  assert.equal(por[`pedido-${ontem}`].canal, "Delivery");
  assert.equal(por[`pedido-${ontemIfood}`].origem, "ifood");
  assert.equal(por[`pedido-${ontemIfood}`].numero, "#4821");
  assert.equal(por[`pedido-${ontemCancelado}`].situacao, "cancelado");

  const soIfood = (await call(`/historico?${periodo}&origem=ifood`)).data;
  assert.deepEqual(soIfood.comandas.map((c) => c.origem), ["ifood"]);
  const soOnline = (await call(`/historico?${periodo}&origem=online&q=ontem`)).data;
  assert.equal(soOnline.quantidade, 2, "busca por nome");
  assert.equal(soOnline.total, 80, "só pedido entregue entra no total; cancelado não");

  const det = (await call(`/historico/pedido-${ontem}`)).data;
  assert.equal(det.cliente_nome, "Cliente de Ontem");
  assert.equal(det.total, 80);
  assert.equal((await call("/historico/pedido-99999")).status, 404);
});

test("8. Até 01:00, pedido de ontem ainda em andamento continua na tela; depois disso sai", async () => {
  const id = Number(
    db
      .prepare(`INSERT INTO orders(tipo,status,cliente_nome,cliente_telefone,valor_total,forma_pagamento,origem,created_at,updated_at)
        VALUES ('delivery','em_producao','Pedido da Madrugada','42999990005',45,'pix','proprio',datetime('now','localtime','-1 day'),datetime('now','localtime','-1 day'))`)
      .run().lastInsertRowid,
  );
  const antesDeUmaHora = !!db.prepare("SELECT time('now','localtime') < '01:00:00' AS v").get().v;
  const naTela = (await call("/orders")).data.some((o) => o.id === id);
  assert.equal(naTela, antesDeUmaHora, "em andamento fica na tela só até 01:00");
  assert.ok((await call("/historico?from=2000-01-01&to=2100-01-01&origem=online&q=madrugada")).data.quantidade === 1, "e já aparece no histórico");
});
