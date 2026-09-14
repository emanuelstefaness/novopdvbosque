import express from 'express';
import { db, initDb } from './db.js';
import { comandasRouter } from './routes/comandas.js';
import { pedidosRouter } from './routes/pedidos.js';
import { reportsRouter } from './routes/reports.js';
initDb();
const app = express(); app.use(express.json()); app.set('db', db);
app.use('/comandas', comandasRouter); app.use('/pedidos', pedidosRouter); app.use('/reports', reportsRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
async function req(path, method='GET', body) {
 const r = await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const data = await r.json(); if(!r.ok) throw new Error(JSON.stringify(data)); return data;
}
try {
 const cat = db.prepare("INSERT INTO categories(name,slug) VALUES ('Audit','audit')").run().lastInsertRowid;
 const item = db.prepare("INSERT INTO items(category_id,name,price) VALUES (?, 'Audit item', 100)").run(cat).lastInsertRowid;
 await req('/comandas/1/open','POST',{mesa:'1'});
 const pedido = await req('/pedidos','POST',{comanda_id:1,item_id:Number(item)});
 await req('/comandas/1','PATCH',{people_count:2,couvert_per_person:5});
 await req('/comandas/1/lancar-couvert','POST',{});
 const summary = await req('/comandas/1/summary');
 await req('/comandas/1','PATCH',{status:'closed'});
 const range = '?from=2020-01-01&to=2030-12-31';
 const before = await req('/reports/faturamento'+range);
 await req('/comandas/1/open','POST',{mesa:'2'});
 const after = await req('/reports/faturamento'+range);
 await req('/comandas/2/open','POST',{mesa:'3'});
 const partial = await req('/pedidos','POST',{comanda_id:2,item_id:Number(item)});
 await req('/pedidos/cancel-many','POST',{ids:[partial.id]});
 console.log(JSON.stringify({unauthenticatedWritesAccepted:true,checkoutTotal:summary.total,reportTotal:before.faturamento,reportAfterReopen:after.faturamento,oldItemStatus:db.prepare('SELECT status FROM pedidos WHERE id=?').get(pedido.id).status,partialPaymentItemStatus:db.prepare('SELECT status FROM pedidos WHERE id=?').get(partial.id).status},null,2));
} finally { server.close(); db.close(); }
