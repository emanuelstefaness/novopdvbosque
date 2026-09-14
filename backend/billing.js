import { randomUUID } from "node:crypto";

export const cents = (v) => Math.round((Number(v) + Number.EPSILON) * 100);
export const money = (v) => v / 100;
export const isCouvert = (p) =>
  String(p.item_name ?? p.name ?? "")
    .trim()
    .toLowerCase() === "couvert";

export function calculateBill(comanda, pedidos) {
  const subtotalCents = pedidos.reduce(
    (s, p) => s + cents(p.unit_price) * p.quantity,
    0,
  );
  const couvertCents = pedidos
    .filter(isCouvert)
    .reduce((s, p) => s + cents(p.unit_price) * p.quantity, 0);
  const serviceBaseCents = subtotalCents - couvertCents;
  const groups = new Map();
  for (const p of pedidos.filter(p => !isCouvert(p))) {
    const key = p.billing_service_group || 'current';
    const group = groups.get(key) || { base: 0, rate: Number(p.billing_service_percent ?? comanda.service_tax_percent) || 0 };
    group.base += cents(p.unit_price) * p.quantity;
    groups.set(key, group);
  }
  const serviceCents = [...groups.values()].reduce((sum,g)=>sum+Math.round(g.base*g.rate/100),0);
  return {
    subtotal: money(subtotalCents),
    couvert: money(couvertCents),
    couvertLancado: money(couvertCents),
    couvertPendente: 0,
    serviceBase: money(serviceBaseCents),
    serviceTax: money(serviceCents),
    total: money(subtotalCents + serviceCents),
  };
}

export function billRows(db, id, unpaidOnly = true) {
  return db
    .prepare(
      `SELECT p.*, ${unpaidOnly ? 'p.quantity-p.paid_quantity' : 'p.quantity'} AS quantity, i.name AS item_name, c.name AS category_name FROM pedidos p
    JOIN items i ON i.id=p.item_id LEFT JOIN categories c ON c.id=i.category_id
    WHERE p.comanda_id=? AND p.status!='cancelled' ${unpaidOnly ? "AND p.paid_at IS NULL" : ""} ORDER BY p.id`,
    )
    .all(id);
}
export function calculateSelectionBill(comanda,rows,available){
 const bill=calculateBill(comanda,rows),all=calculateBill(comanda,available);
 const remaining=available.map(p=>({...p,quantity:p.quantity-(rows.find(r=>r.id===p.id)?.quantity||0)})).filter(p=>p.quantity>0);
 const left=calculateBill(comanda,remaining);
 bill.serviceTax=money(cents(all.serviceTax)-cents(left.serviceTax));
 bill.total=money(cents(bill.subtotal)+cents(bill.serviceTax));
 return bill;
}

export function summaryFor(db, id) {
  const comanda = db.prepare("SELECT * FROM comandas WHERE id=?").get(id);
  if (!comanda) return null;
  const pedidos = billRows(db, id);
  const paid = db
    .prepare(
      "SELECT COALESCE(SUM(total_cents),0) AS total FROM sales WHERE session_key=? OR session_key IN (SELECT source_session FROM billing_session_links WHERE target_session=?)",
    )
    .get(comanda.session_key,comanda.session_key);
  const bill=calculateBill(comanda,pedidos),credit=creditFor(db,comanda.session_key);
  return {
    comanda,
    pedidos,
    ...bill,
    total:money(Math.max(0,cents(bill.total)-credit.total)),credit:money(credit.total),
    paidTotal: money(paid.total),
  };
}
export function creditFor(db,session){return db.prepare(`SELECT COALESCE(SUM(total_cents),0) total,COALESCE(SUM(subtotal_cents),0) subtotal,COALESCE(SUM(service_cents),0) service,COALESCE(SUM(couvert_cents),0) couvert FROM sales WHERE is_credit=1 AND credit_used=0 AND (session_key=? OR session_key IN(SELECT source_session FROM billing_session_links WHERE target_session=?))`).get(session,session);}
export function recordCredit(db,c,amount){const bill=calculateBill(c,billRows(db,c.id)),total=cents(bill.total),service=Math.round(amount*cents(bill.serviceTax)/total),subtotal=amount-service,couvert=Math.min(subtotal,Math.round(amount*cents(bill.couvert)/total));return db.prepare(`INSERT INTO sales(session_key,comanda_id,mesa,paid_at,subtotal_cents,couvert_cents,service_cents,total_cents,is_credit) VALUES(?,?,?,datetime('now','localtime'),?,?,?,?,1)`).run(c.session_key,c.id,c.mesa,subtotal,couvert,service,amount).lastInsertRowid;}

export function recordPayment(db, comanda, rows, paidAt = null) {
  if (!rows.length) return null;
  const bill = calculateSelectionBill(comanda, rows,billRows(db,comanda.id));
  const credit=creditFor(db,comanda.session_key);
  if(credit.total){
    const available=billRows(db,comanda.id);
    if(rows.length!==available.length||rows.some(r=>available.find(p=>p.id===r.id)?.quantity!==r.quantity))throw Error('Há adiantamento nesta conta. Receba o saldo completo para liquidar os itens.');
    if(credit.total>cents(bill.total))throw Error('Adiantamento maior que o saldo dos itens.');
    bill.total-=money(credit.total);bill.subtotal-=money(credit.subtotal);bill.serviceTax-=money(credit.service);bill.couvert-=money(credit.couvert);
    db.prepare(`UPDATE sales SET credit_used=1 WHERE is_credit=1 AND credit_used=0 AND (session_key=? OR session_key IN(SELECT source_session FROM billing_session_links WHERE target_session=?))`).run(comanda.session_key,comanda.session_key);
  }
  const now =
    paidAt || db.prepare("SELECT datetime('now','localtime') t").get().t;
  const waiter = db
    .prepare("SELECT name FROM waiters WHERE id=?")
    .get(comanda.waiter_id ?? -1);
  const sale = db
    .prepare(
      `INSERT INTO sales(session_key,comanda_id,mesa,waiter_name,people_count,paid_at,subtotal_cents,couvert_cents,service_cents,total_cents,origin_order_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      comanda.session_key,
      comanda.id,
      comanda.mesa,
      waiter?.name || "(Sem garçom)",
      comanda.people_count || 0,
      now,
      cents(bill.subtotal),
      cents(bill.couvert),
      cents(bill.serviceTax),
      cents(bill.total),
      comanda.origin_order_id ?? null,
    );
  const insert = db.prepare(
    `INSERT INTO sale_items(sale_id,item_id,name,category_name,quantity,unit_cents,sector,is_couvert) VALUES (?,?,?,?,?,?,?,?)`,
  );
  for (const row of rows) {
    insert.run(
      sale.lastInsertRowid,
      row.item_id,
      row.item_name,
      row.category_name,
      row.quantity,
      cents(row.unit_price),
      row.sector,
      isCouvert(row) ? 1 : 0,
    );
    db.prepare("UPDATE pedidos SET paid_quantity=paid_quantity+?,paid_at=CASE WHEN paid_quantity+?>=quantity THEN ? ELSE NULL END WHERE id=?").run(row.quantity,row.quantity,now,row.id);
  }
  return sale.lastInsertRowid;
}

export function archiveAndReset(db, id) {
  const comanda = db.prepare("SELECT * FROM comandas WHERE id=?").get(id);
  if (!comanda) return;
  const rows = db.prepare("SELECT * FROM pedidos WHERE comanda_id=?").all(id);
  if (rows.length) {
    const pending = rows.filter(p => p.paid_at && !['cancelled','delivered'].includes(p.status) && db.prepare("SELECT 1 FROM pedido_sector_status WHERE pedido_id=? AND status!='ready'").get(p.id));
    if (pending.length) {
      // A closed snapshot owns unfinished production independently of a reusable number.
      const snapshotId=db.prepare('SELECT MAX(200,COALESCE(MAX(id),200))+1 AS id FROM comandas').get().id;
      const mesa=comanda.mesa || db.prepare('SELECT mesa FROM sales WHERE session_key=? ORDER BY id DESC LIMIT 1').get(comanda.session_key)?.mesa;
      const snapshot = db.prepare(`INSERT INTO comandas(id,mesa,status,waiter_id,session_key,production_number,closed_at)
        VALUES (?,?,'closed',?,?,?,?)`).run(snapshotId,mesa,comanda.waiter_id,comanda.session_key,comanda.production_number || id,comanda.closed_at);
      for(const p of pending) db.prepare('UPDATE pedidos SET comanda_id=? WHERE id=?').run(snapshot.lastInsertRowid,p.id);
    }
    db.prepare(
      "INSERT INTO comanda_history(session_key,comanda_json,pedidos_json) VALUES (?,?,?)",
    ).run(comanda.session_key, JSON.stringify(comanda), JSON.stringify(rows));
    db.prepare(
      "DELETE FROM pedido_sector_status WHERE pedido_id IN (SELECT id FROM pedidos WHERE comanda_id=?)",
    ).run(id);
    db.prepare("DELETE FROM pedidos WHERE comanda_id=?").run(id);
  }
  db.prepare(
    `UPDATE comandas SET people_count=0,service_tax_percent=0,client_cpf=NULL,closed_at=NULL,session_key=?,
    created_at=datetime('now','localtime') WHERE id=?`,
  ).run(randomUUID(), id);
}

export function initBilling(db) {
  for(const [table,column,type] of [['pedidos','billing_service_percent','REAL'],['pedidos','billing_service_group','TEXT'],['comandas','production_number','INTEGER']]) {
    if(!db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name===column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
  if(!db.prepare('PRAGMA table_info(pedidos)').all().some(c=>c.name==='paid_quantity')) {
    db.exec('ALTER TABLE pedidos ADD COLUMN paid_quantity INTEGER NOT NULL DEFAULT 0');
    if(db.prepare('PRAGMA table_info(pedidos)').all().some(c=>c.name==='paid_at')) db.exec('UPDATE pedidos SET paid_quantity=quantity WHERE paid_at IS NOT NULL');
  }
  db.exec('CREATE TABLE IF NOT EXISTS billing_session_links(target_session TEXT NOT NULL,source_session TEXT NOT NULL,PRIMARY KEY(target_session,source_session))');
  if (
    !db
      .prepare("PRAGMA table_info(pedido_sector_status)")
      .all()
      .some((c) => c.name === "fulfilled_quantity")
  )
    db.exec(
      "ALTER TABLE pedido_sector_status ADD COLUMN fulfilled_quantity INTEGER NOT NULL DEFAULT 0",
    );
  if (
    !db
      .prepare("PRAGMA table_info(orders)")
      .all()
      .some((c) => c.name === "delivered_at")
  )
    db.exec("ALTER TABLE orders ADD COLUMN delivered_at TEXT");
  db.exec(
    "UPDATE orders SET delivered_at=updated_at WHERE status='entregue' AND delivered_at IS NULL",
  );
  if (
    !db
      .prepare("PRAGMA table_info(comandas)")
      .all()
      .some((c) => c.name === "session_key")
  )
    db.exec("ALTER TABLE comandas ADD COLUMN session_key TEXT");
  if (
    !db
      .prepare("PRAGMA table_info(pedidos)")
      .all()
      .some((c) => c.name === "paid_at")
  )
    db.exec("ALTER TABLE pedidos ADD COLUMN paid_at TEXT");
  db.exec(`CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT, session_key TEXT NOT NULL, comanda_id INTEGER NOT NULL, mesa TEXT, waiter_name TEXT,
    people_count INTEGER DEFAULT 0, paid_at TEXT NOT NULL, subtotal_cents INTEGER NOT NULL, couvert_cents INTEGER NOT NULL,
    service_cents INTEGER NOT NULL, total_cents INTEGER NOT NULL, origin_order_id INTEGER);
    CREATE TABLE IF NOT EXISTS sale_items(id INTEGER PRIMARY KEY AUTOINCREMENT,sale_id INTEGER NOT NULL REFERENCES sales(id),
    item_id INTEGER,name TEXT NOT NULL,category_name TEXT,quantity INTEGER NOT NULL,unit_cents INTEGER NOT NULL,sector TEXT,is_couvert INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS comanda_history(id INTEGER PRIMARY KEY AUTOINCREMENT,session_key TEXT,comanda_json TEXT NOT NULL,pedidos_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cancellation_log(id INTEGER PRIMARY KEY AUTOINCREMENT,pedido_id INTEGER UNIQUE,name TEXT,quantity INTEGER,value_cents INTEGER,cancelled_at TEXT);
    CREATE INDEX IF NOT EXISTS sales_session ON sales(session_key);
    CREATE INDEX IF NOT EXISTS sales_date ON sales(paid_at);
    CREATE TRIGGER IF NOT EXISTS capture_cancellation AFTER UPDATE OF status ON pedidos
    WHEN NEW.status='cancelled' AND OLD.status!='cancelled' AND OLD.paid_at IS NULL
    BEGIN INSERT OR IGNORE INTO cancellation_log(pedido_id,name,quantity,value_cents,cancelled_at)
    SELECT NEW.id,i.name,NEW.quantity,CAST(ROUND(NEW.quantity*NEW.unit_price*100) AS INTEGER),datetime('now','localtime') FROM items i WHERE i.id=NEW.item_id; END;`);
  for(const column of ['is_credit','credit_used'])if(!db.prepare('PRAGMA table_info(sales)').all().some(c=>c.name===column))db.exec(`ALTER TABLE sales ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
  db.transaction(() => {
    for (const c of db
      .prepare("SELECT * FROM comandas WHERE session_key IS NULL")
      .all()) {
      c.session_key = randomUUID();
      db.prepare("UPDATE comandas SET session_key=? WHERE id=?").run(
        c.session_key,
        c.id,
      );
      if (c.status === "closed" && c.closed_at)
        recordPayment(db, c, billRows(db, c.id), c.closed_at);
    }
  })();
}
