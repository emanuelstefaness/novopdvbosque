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
const app = express();
app.use(express.json());
app.set("db", db);
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
const cat=db.prepare("INSERT INTO categories(name,slug) VALUES('Audit','audit')").run().lastInsertRowid;
const item=Number(db.prepare("INSERT INTO items(category_id,name,price,is_grill) VALUES(?,'Audit espeto',100,1)").run(cat).lastInsertRowid);
const add=id=>req('/pedidos','POST',{comanda_id:id,item_id:item,quantity:1});
for(const id of [30,31,32])await req('/comandas/'+id+'/open','POST',{mesa:String(id)});
await add(30);const paid=await add(31);await add(31);
await req('/comandas/31','PATCH',{service_tax_percent:10});
await req('/comandas/31/pay-selection','POST',{ids:[paid.id]});
const before={target:await req('/comandas/30/summary'),source:await req('/comandas/31/summary')};
await req('/comandas/merge','POST',{target_id:30,source_ids:[31]});
const after=await req('/comandas/30/summary');
const prod=await add(32);await req('/comandas/32','PATCH',{status:'closed'});
const beforeReopen=(await req('/pedidos/grill')).some(p=>p.id===prod.id);
await req('/comandas/32/open','POST',{mesa:'32'});
const afterReopen=(await req('/pedidos/grill')).some(p=>p.id===prod.id);
const result={merge:{balanceBefore:before.target.total+before.source.total,balanceAfter:after.total,paidBefore:before.target.paidTotal+before.source.paidTotal,paidAfter:after.paidTotal},production:{beforeReopen,afterReopen}};
const fs=await import('node:fs');fs.writeFileSync('../../../outputs/auditoria-cobranca.json',JSON.stringify(result,null,2));console.log(result);server.close();db.close();

