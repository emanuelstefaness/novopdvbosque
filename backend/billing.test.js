import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
process.env.PDV_DB_PATH = ":memory:";
const { db, initDb } = await import("./db.js");
const { comandasRouter, clearComandaHandler } =
  await import("./routes/comandas.js");
const { pedidosRouter } = await import("./routes/pedidos.js");
const { reportsRouter } = await import("./routes/reports.js");
const { financeRouter } = await import("./routes/finance.js");
const { printRouter } = await import("./routes/print.js");
const { publicRouter } = await import("./routes/public.js");
const { ordersRouter } = await import("./routes/orders.js");
initDb();
const {cashRouter,initCash}=await import('./routes/cash.js');
initCash(db);
const app = express();
app.use(express.json());
app.set("db", db);
app.use('/cash',cashRouter);
app.post("/comandas/:id/clear", (req, res) =>
  clearComandaHandler(req, res, db),
);
app.use("/comandas", comandasRouter);
app.use("/pedidos", pedidosRouter);
app.use("/reports", reportsRouter);
app.use("/finance", financeRouter);
app.use("/print", printRouter);
app.use("/public", publicRouter);
app.use("/orders", ordersRouter);
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const url = `http://127.0.0.1:${server.address().port}`;
async function req(path, method = "GET", body) {
  const r = await fetch(url + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  assert.ok(r.ok, JSON.stringify(d));
  return d;
}
const range = "?from=2020-01-01&to=2030-01-01";
const cat = db
  .prepare("INSERT INTO categories(name,slug)VALUES('Teste','teste')")
  .run().lastInsertRowid;
const item = db
  .prepare("INSERT INTO items(category_id,name,price)VALUES(?,'Produto',100)")
  .run(cat).lastInsertRowid;
const add = async (id) =>
  req("/pedidos", "POST", {
    comanda_id: id,
    item_id: Number(item),
    quantity: 1,
  });
test("Couvert explícito, base de serviço e impressão consistentes", async () => {
  await req("/comandas/1/open", "POST", { mesa: "8" });
  await add(1);
  await req("/comandas/1", "PATCH", {
    people_count: 2,
    service_tax_percent: 10,
  });
  let s = await req("/comandas/1/summary");
  assert.equal(s.total, 110);
  assert.equal(s.couvert, 0);
  await req("/comandas/1/lancar-couvert", "POST", {});
  s = await req("/comandas/1/summary");
  assert.equal(s.couvert, 10);
  assert.equal(s.serviceTax, 10);
  assert.equal(s.total, 120);
  await req("/comandas/1/lancar-couvert", "POST", {});
  assert.equal((await req("/comandas/1/summary")).total, 120);
  const print = await req("/print/comanda/1");
  assert.equal(print.total, s.total);
  assert.equal(print.service_tax, 10);
  assert.equal(print.couvert_pendente, 0);
});
test("Pagamento parcial preserva produção, receita e saldo", async () => {
  const s = await req("/comandas/1/summary");
  const product = s.pedidos.find((p) => p.item_name === "Produto");
  const partial = await req("/comandas/1/pay-selection", "POST", {
    ids: [product.id],
  });
  assert.equal(partial.total, 10);
  assert.equal(partial.paidTotal, 110);
  assert.equal(
    db.prepare("SELECT status FROM pedidos WHERE id=?").get(product.id).status,
    "pending",
  );
  assert.equal((await req("/reports/faturamento" + range)).faturamento, 110);
  const repeated = await fetch(url + "/comandas/1/pay-selection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: [product.id] }),
  });
  assert.equal(repeated.status, 400);
  await req("/comandas/1", "PATCH", { status: "closed" });
  assert.equal((await req("/reports/faturamento" + range)).faturamento, 120);
  assert.equal(
    (await req("/finance/daily" + range)).totals.sales_comandas,
    120,
  );
});
test("Reabrir limpa pessoas, CPF e serviço sem apagar histórico", async () => {
  await req("/comandas/1/open", "POST", { mesa: "9" });
  const s = await req("/comandas/1/summary");
  assert.equal(s.total, 0);
  assert.equal(s.comanda.people_count, 0);
  assert.equal(s.comanda.service_tax_percent, 0);
  assert.equal(s.comanda.client_cpf, null);
  assert.equal((await req("/reports/faturamento" + range)).faturamento, 120);
  assert.equal(
    (await req("/reports/cancelamentos" + range)).resumo.linhas_canceladas,
    0,
  );
  await add(1);
  await req("/comandas/1", "PATCH", { status: "closed" });
  assert.equal((await req("/reports/faturamento" + range)).faturamento, 220);
  assert.equal((await req("/reports/faturamento" + range)).comandasCount, 2);
});
test("Couvert com valor zero não volta ao padrão de R$ 5", async () => {
  await req("/comandas/2/open", "POST", { mesa: "10" });
  await req("/comandas/2", "PATCH", { people_count: 1, couvert_per_person: 0 });
  await req("/comandas/2/lancar-couvert", "POST", {});
  assert.equal((await req("/comandas/2/summary")).total, 0);
});
test("Cancelar é preservado no histórico após reabrir", async () => {
  const p = await add(2);
  await req("/pedidos/" + p.id, "DELETE");
  await req("/comandas/2/clear", "POST", {});
  await req("/comandas/2/open", "POST", { mesa: "11" });
  const c = await req("/reports/cancelamentos" + range);
  assert.ok(c.resumo.linhas_canceladas >= 1);
  assert.equal(c.resumo.valor_cancelado, 100);
});
test("Migração pode rodar novamente sem duplicar recebimentos", async () => {
  initDb();
  assert.equal((await req("/reports/faturamento" + range)).faturamento, 220);
});
test("Todos os relatórios respondem com dados do mesmo período", async () => {
  for (const route of [
    "vendas/dia",
    "vendas/mes",
    "itens-mais-vendidos",
    "por-categoria",
    "churrasqueira",
    "por-garcom",
    "cancelamentos",
  ])
    await req("/reports/" + route + range);
});
test("Baixa de uma unidade da cozinha preserva quantidade e total cobrados", async () => {
  const kitchen = db
    .prepare(
      "INSERT INTO items(category_id,name,price,is_kitchen)VALUES(?,'Prato cozinha',25,1)",
    )
    .run(cat).lastInsertRowid;
  await req("/comandas/10/open", "POST", { mesa: "10" });
  const p = await req("/pedidos", "POST", {
    comanda_id: 10,
    item_id: Number(kitchen),
    quantity: 3,
  });
  await req("/pedidos/" + p.id + "/fulfill-one", "POST", {});
  assert.equal(
    (await req("/pedidos/kitchen")).find((r) => r.id === p.id).quantity,
    2,
  );
  assert.equal((await req("/comandas/10/summary")).total, 75);
  await req("/comandas/10/pay-selection", "POST", { ids: [p.id] });
  await req("/pedidos/" + p.id + "/fulfill-one", "POST", {});
  assert.equal(
    (await req("/pedidos/kitchen")).find((r) => r.id === p.id).quantity,
    1,
  );
  await req("/pedidos/" + p.id + "/fulfill-one", "POST", {});
  assert.equal(
    (await req("/pedidos/kitchen")).some((r) => r.id === p.id),
    false,
  );
  assert.equal(
    db.prepare("SELECT quantity FROM pedidos WHERE id=?").get(p.id).quantity,
    3,
  );
  assert.equal((await req("/comandas/10/summary")).paidTotal, 75);
});
test("Fechamento com taxa no mesmo comando usa valor atualizado", async () => {
  await req("/comandas/11/open", "POST", { mesa: "11" });
  await add(11);
  await req("/comandas/11", "PATCH", {
    service_tax_percent: 10,
    status: "closed",
  });
  const sale = db
    .prepare("SELECT total_cents FROM sales WHERE comanda_id=11")
    .get();
  assert.equal(sale.total_cents, 11000);
});
test("Períodos inválidos são rejeitados", async () => {
  assert.equal(
    (await fetch(url + "/reports/faturamento?from=invalido")).status,
    400,
  );
});
test('Pedidos entregues entram uma vez no financeiro e relatórios',async()=>{
 const before=(await req('/reports/faturamento'+range)).faturamento;
 const order=db.prepare("INSERT INTO orders(tipo,cliente_nome,cliente_telefone,valor_total,status)VALUES('retirada','Cliente teste','41999990000',50,'recebido')").run().lastInsertRowid;
 db.prepare('INSERT INTO order_items(order_id,item_id,quantity,unit_price)VALUES(?,?,1,50)').run(order,item);
 assert.equal((await req('/reports/faturamento'+range)).faturamento,before);
 await req('/orders/'+order+'/status','PATCH',{status:'entregue'});
 assert.equal((await req('/reports/faturamento'+range)).faturamento,before+50);
 assert.equal((await req('/finance/daily'+range)).totals.sales_online,50);
 const delivered=db.prepare('SELECT delivered_at FROM orders WHERE id=?').get(order).delivered_at;
 await req('/orders/'+order+'/status','PATCH',{status:'entregue'});
 assert.equal(db.prepare('SELECT delivered_at FROM orders WHERE id=?').get(order).delivered_at,delivered);
 assert.equal((await req('/reports/faturamento'+range)).faturamento,before+50);
});
test('Acompanhamento público exige telefone completo do pedido',async()=>{
 const order=db.prepare('SELECT id FROM orders ORDER BY id DESC LIMIT 1').get().id;
 assert.equal((await fetch(url+'/public/orders/'+order)).status,403);
 assert.equal((await fetch(url+'/public/orders/'+order+'?telefone=0000')).status,403);
 assert.equal((await fetch(url+'/public/orders/'+order+'?telefone=41999990000')).status,200);
});
test('Churrasqueira baixa unidades sem reduzir a quantidade cobrada, inclusive após pagamento', async () => {
  const grill = Number(db.prepare("INSERT INTO items(category_id,name,price,is_grill) VALUES(?,'Espeto teste unitário',25,1)").run(cat).lastInsertRowid);
  await req('/comandas/12/open','POST',{mesa:'12'});
  const p = await req('/pedidos','POST',{comanda_id:12,item_id:grill,quantity:3});
  for (const remaining of [2,1]) {
    await req('/pedidos/churrasqueira-ready/'+p.id,'PATCH',{one:true});
    assert.equal((await req('/pedidos/grill')).find(r=>r.id===p.id).quantity,remaining);
    assert.equal(db.prepare('SELECT quantity FROM pedidos WHERE id=?').get(p.id).quantity,3);
    assert.equal((await req('/comandas/12/summary')).total,75);
  }
  await req('/comandas/12/pay-selection','POST',{ids:[p.id]});
  await req('/pedidos/churrasqueira-ready/'+p.id,'PATCH',{one:true});
  assert.equal((await req('/pedidos/grill')).some(r=>r.id===p.id),false);
  await req('/pedidos/churrasqueira-ready/'+p.id,'PATCH',{one:true});
  assert.equal(db.prepare("SELECT fulfilled_quantity FROM pedido_sector_status WHERE pedido_id=? AND sector='grill'").get(p.id).fulfilled_quantity,3);
  assert.equal((await req('/comandas/12/summary')).paidTotal,75);
});

test('União preserva serviço de cada origem e recebimentos, inclusive uniões sucessivas',async()=>{
 for(const id of [40,41,42]){await req('/comandas/'+id+'/open','POST',{mesa:String(id)});await add(id);}
 const p=await add(41);await req('/comandas/41','PATCH',{service_tax_percent:10});await req('/comandas/41/pay-selection','POST',{ids:[p.id]});
 await req('/comandas/merge','POST',{target_id:40,source_ids:[41]});
 assert.equal((await req('/comandas/40/summary')).total,210);assert.equal((await req('/comandas/40/summary')).paidTotal,110);
 await req('/comandas/merge','POST',{target_id:42,source_ids:[40]});
 assert.equal((await req('/comandas/42/summary')).total,310);assert.equal((await req('/comandas/42/summary')).paidTotal,110);
});
test('Comanda reutilizada mantém produção paga em sessão separada',async()=>{
 const grill=Number(db.prepare("INSERT INTO items(category_id,name,price,is_grill)VALUES(?,'Produção preservada',20,1)").run(cat).lastInsertRowid);
 await req('/comandas/43/open','POST',{mesa:'43'});const p=await req('/pedidos','POST',{comanda_id:43,item_id:grill,quantity:2});await req('/comandas/43','PATCH',{status:'closed'});await req('/comandas/43/open','POST',{mesa:'nova'});
 const row=(await req('/pedidos/grill')).find(x=>x.id===p.id);assert.equal(row.production_number,43);assert.equal(row.mesa,'43');assert.notEqual(row.comanda_id,43);assert.equal((await req('/comandas/43/summary')).total,0);
 await req('/pedidos/churrasqueira-ready/'+p.id,'PATCH',{one:true});assert.equal((await req('/pedidos/grill')).find(x=>x.id===p.id).quantity,1);
});
test('Recebimento por unidade, misto, troco, repetição e conferência de turno',async()=>{
 await req('/cash/shift','POST',{opening:50});await req('/comandas/44/open','POST',{mesa:'44'});const p=await req('/pedidos','POST',{comanda_id:44,item_id:Number(item),quantity:3});
 const first={request_key:'teste-recebimento-unidade',comanda_id:44,selection:[{id:p.id,quantity:1}],expected_total:100,tenders:[{method:'dinheiro',amount:110}]};
 const r=await req('/cash/receive','POST',first);assert.equal(r.change,10);assert.equal(r.remaining,200);assert.equal((await req('/cash/receive','POST',first)).replayed,true);
 assert.equal((await req('/comandas/44/summary')).pedidos[0].quantity,2);assert.equal(db.prepare('SELECT quantity FROM pedidos WHERE id=?').get(p.id).quantity,3);
 await req('/cash/receive','POST',{request_key:'teste-recebimento-misto',comanda_id:44,expected_total:200,tenders:[{method:'pix',amount:80},{method:'credito',amount:120}]});assert.equal((await req('/comandas/44')).status,'closed');
 await req('/cash/movement','POST',{kind:'sangria',amount:20,reason:'Retirada teste'});const shift=(await req('/cash/shift')).current;assert.equal(shift.expected.dinheiro,13000);assert.equal(shift.expected.pix,8000);assert.equal(shift.expected.credito,12000);
 const close=await req('/cash/shift/close','POST',{counted:{dinheiro:130,pix:80,debito:0,credito:120}});assert.deepEqual(close.difference,{dinheiro:0,pix:0,debito:0,credito:0});
});
test('Adiantamento reduz saldo e entra uma única vez no financeiro ao liquidar',async()=>{
 await req('/comandas/45/open','POST',{mesa:'45'});await add(45);await req('/comandas/45','PATCH',{service_tax_percent:10});
 const before=(await req('/reports/faturamento'+range)).faturamento;
 await req('/cash/receive','POST',{request_key:'adiantamento-45-teste',comanda_id:45,amount:40,expected_total:40,tenders:[{method:'pix',amount:40}]});
 assert.equal((await req('/comandas/45/summary')).total,70);assert.equal((await req('/comandas/45/summary')).paidTotal,40);assert.equal((await req('/reports/faturamento'+range)).faturamento,before+40);
 await req('/cash/receive','POST',{request_key:'liquidacao-45-teste',comanda_id:45,expected_total:70,tenders:[{method:'debito',amount:70}]});
 assert.equal((await req('/reports/faturamento'+range)).faturamento,before+110);assert.equal((await req('/comandas/45/summary')).paidTotal,110);assert.equal((await req('/comandas/45')).status,'closed');
});
test('Recebimento rejeita valor desatualizado, excesso sem dinheiro e repetição com outro conteúdo',async()=>{
 await req('/comandas/46/open','POST',{mesa:'46'});await add(46);
 for(const body of [{expected_total:90,tenders:[{method:'pix',amount:90}]},{expected_total:100,tenders:[{method:'pix',amount:120}]}]){
 const r=await fetch(url+'/cash/receive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_key:'invalido-recebimento-46',comanda_id:46,...body})});assert.equal(r.status,400);
 }assert.equal((await req('/comandas/46/summary')).total,100);
 const body={request_key:'duplicado-recebimento-46',comanda_id:46,expected_total:100,tenders:[{method:'pix',amount:100}]};await req('/cash/receive','POST',body);
 const r=await fetch(url+'/cash/receive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,comanda_id:45})});assert.equal(r.status,400);
});
test('Divisão de unidades preserva arredondamento e quantidade na pré-conta',async()=>{
 const tiny=Number(db.prepare("INSERT INTO items(category_id,name,price)VALUES(?,'Teste centavos',0.05)").run(cat).lastInsertRowid);
 await req('/comandas/47/open','POST',{mesa:'47'});const p=await req('/pedidos','POST',{comanda_id:47,item_id:tiny,quantity:3});await req('/comandas/47','PATCH',{service_tax_percent:10});
 const original=(await req('/comandas/47/summary')).total;
 for(let i=0;i<3;i++){const total=(await req('/comandas/47/summary')).total;const quantity=3-i;const afterBase=(quantity-1)*5,afterTax=Math.round(afterBase*.1);const expected=(Math.round(total*100)-afterBase-afterTax)/100;await req('/cash/receive','POST',{request_key:'centavos-'+i+'-recebimento',comanda_id:47,selection:[{id:p.id,quantity:1}],expected_total:expected,tenders:[{method:'pix',amount:expected}]});if(i===0)assert.equal((await req('/print/comanda/47')).pedidos[0].quantity,2);}
 assert.equal((await req('/comandas/47/summary')).paidTotal,original);
});
test.after(() => {
  server.close();
  db.close();
});
