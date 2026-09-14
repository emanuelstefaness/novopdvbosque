import { Router } from 'express';
import {creditFor} from '../billing.js';
import { resolveLancheAddonsFromBody } from '../lancheAddons.js';
import { broadcastAll } from '../socket.js';
import { getPedidoSector, BAR_CATEGORY_SLUGS } from '../itemSector.js';

export const pedidosRouter = Router();
pedidosRouter.use((req,res,next)=>{
 if(['PATCH','DELETE'].includes(req.method)&&/^\/\d+$/.test(req.path)){
  const db=req.app.get('db'),p=db.prepare('SELECT p.paid_quantity,c.session_key FROM pedidos p JOIN comandas c ON c.id=p.comanda_id WHERE p.id=?').get(Number(req.path.slice(1)));
  if(p&&(p.paid_quantity>0||creditFor(db,p.session_key).total>0))return res.status(400).json({error:'Pedido possui recebimento. Conclua a conta antes de alterar ou cancelar.'});
 }
 next();
});
const getDb = (req) => req.app.get('db');

/** Comandas ativas sem nada pendente na grill, mas com acompanhamento pendente na cozinha (só acompanhamentos / “só salada arroz maionese”). */
const SQL_COMANDAS_SOLO_ACOMPANHAMENTOS = `
  SELECT c.id AS comanda_id
  FROM comandas c
  WHERE lower(trim(ifnull(c.status, ''))) IN ('open', 'ordering', 'paying')
    AND NOT EXISTS (
      SELECT 1 FROM pedidos pg
      JOIN pedido_sector_status sg ON sg.pedido_id = pg.id AND sg.sector = 'grill'
      WHERE pg.comanda_id = c.id
        AND sg.status != 'ready'
        AND pg.status NOT IN ('cancelled', 'delivered')
    )
    AND EXISTS (
      SELECT 1 FROM pedidos pk
      JOIN items ik ON ik.id = pk.item_id
      JOIN categories catk ON catk.id = ik.category_id
      JOIN pedido_sector_status sk2 ON sk2.pedido_id = pk.id AND sk2.sector = 'kitchen'
      WHERE pk.comanda_id = c.id
        AND catk.slug = 'acompanhamentos'
        AND COALESCE(ik.is_grill, 0) = 0
        AND COALESCE(ik.is_bar, 0) = 0
        AND sk2.status != 'ready'
        AND pk.status NOT IN ('cancelled', 'delivered')
    )
`;

// Cancelar vários pedidos (cobrança separada) — rota estática antes de /:id
pedidosRouter.post('/cancel-many', (req, res) => {
  const db = getDb(req);
  const { ids } = req.body || {};
  const idList = Array.isArray(ids) ? ids.map(Number).filter((n) => n > 0) : [];
  if (idList.length === 0) return res.status(400).json({ error: 'Informe os ids dos pedidos (ids: [])' });
  const stmt = db.prepare(
    "UPDATE pedidos SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?"
  );
  for (const pid of idList) stmt.run('cancelled', pid);
  broadcastAll('pedidos', {});
  broadcastAll('comandas', {});
  res.json({ ok: true, cancelled: idList.length });
});

pedidosRouter.post('/', (req, res) => {
  try {
    const db = getDb(req);
    const { comanda_id, item_id, quantity: qtyRaw = 1, observations, meat_point, caipirinha_base, caipirinha_picole, dose_accompaniment, prato_feito_espetinho_id, extra_caramelized_onion, extra_hamburger } = req.body || {};
    const cid = Number(comanda_id);
    const iid = Number(item_id);
    if (!Number.isFinite(cid) || cid < 1 || !Number.isFinite(iid) || iid < 1) {
      return res.status(400).json({ error: 'comanda_id e item_id obrigatórios (números válidos)' });
    }
    const quantity = Math.max(1, Math.min(999, parseInt(String(qtyRaw), 10) || 1));
    const item = db.prepare(`
      SELECT i.*, c.slug AS category_slug
      FROM items i
      LEFT JOIN categories c ON c.id = i.category_id
      WHERE i.id = ?
    `).get(iid);
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    const comandaRow = db.prepare('SELECT status, closed_at FROM comandas WHERE id = ?').get(cid);
    if (!comandaRow) {
      return res.status(400).json({ error: 'Comanda não encontrada. Abra a comanda no garçom (mesa) antes de lançar.' });
    }
    const st = String(comandaRow.status || '').toLowerCase();
    if (st === 'closed' || comandaRow.closed_at) {
      return res.status(400).json({ error: 'Esta comanda já foi fechada no caixa. Use uma comanda livre ou reabra informando a mesa.' });
    }
    const sector = getPedidoSector(item);
    const addons = resolveLancheAddonsFromBody(item, { extra_caramelized_onion, extra_hamburger });
    const unit_price = item.price + addons.unit_addon;

    const run = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO pedidos (comanda_id, item_id, quantity, unit_price, observations, meat_point, caipirinha_base, caipirinha_picole, dose_accompaniment, prato_feito_espetinho_id, extra_caramelized_onion, extra_hamburger, sector)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(cid, iid, quantity, unit_price, observations != null && String(observations).trim() ? String(observations).trim() : null, meat_point || null, caipirinha_base || null, caipirinha_picole ? 1 : 0, dose_accompaniment || null, prato_feito_espetinho_id != null ? Number(prato_feito_espetinho_id) || null : null, addons.extra_caramelized_onion, addons.extra_hamburger, sector);
      const pedidoId = info.lastInsertRowid;
      const insStatus = db.prepare('INSERT OR REPLACE INTO pedido_sector_status (pedido_id, sector, status) VALUES (?, ?, ?)');
      if (sector) insStatus.run(pedidoId, sector, 'pending');
      if (item.is_grill && item.is_kitchen && sector === 'kitchen') insStatus.run(pedidoId, 'grill', 'pending');
      if (item.is_grill && item.is_kitchen && sector === 'grill') insStatus.run(pedidoId, 'kitchen', 'pending');
      db.prepare("UPDATE comandas SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run('ordering', cid);
      return pedidoId;
    });
    const pedidoId = run();
    broadcastAll('pedidos', {});
    broadcastAll('comandas', {});
    return res.status(201).json({ id: pedidoId, comanda_id: cid, item_id: iid, quantity, unit_price, sector });
  } catch (err) {
    console.error('Erro ao criar pedido:', err);
    return res.status(500).json({ error: err.message || 'Erro ao adicionar pedido' });
  }
});

pedidosRouter.get('/by-comanda/:comanda_id', (req, res) => {
  const db = getDb(req);
  const list = db.prepare(`
    SELECT p.*, i.name as item_name, i.price
    FROM pedidos p
    JOIN items i ON i.id = p.item_id
    WHERE p.comanda_id = ? AND p.status != 'cancelled'
    ORDER BY p.created_at
  `).all(Number(req.params.comanda_id));
  res.json(list);
});

pedidosRouter.get('/kitchen', (req, res) => {
  const db = getDb(req);
  const list = db.prepare(`
    SELECT p.*, i.name as item_name, i.is_grill, i.is_prato_feito, c.mesa, c.id as comanda_id, c.production_number,
      COALESCE(NULLIF(TRIM(c.tipo_online), ''), o.tipo) AS comanda_tipo_online,
      s.status as sector_status, MAX(0,p.quantity-s.fulfilled_quantity) AS quantity,
      ei.name as prato_feito_espetinho_name, w.name as waiter_name
    FROM pedido_sector_status s
    JOIN pedidos p ON p.id = s.pedido_id
    JOIN items i ON i.id = p.item_id
    JOIN comandas c ON c.id = p.comanda_id
    LEFT JOIN orders o ON o.id = c.origin_order_id
    LEFT JOIN items ei ON ei.id = p.prato_feito_espetinho_id
    LEFT JOIN waiters w ON w.id = c.waiter_id
    WHERE s.sector = 'kitchen' AND s.status != 'ready' AND p.status != 'cancelled' AND p.status != 'delivered'
    ORDER BY p.created_at
  `).all();
  const grillStatus = db.prepare('SELECT pedido_id, status FROM pedido_sector_status WHERE sector = ?').all('grill');
  const grillMap = {};
  grillStatus.forEach(g => { grillMap[g.pedido_id] = g.status; });
  list.forEach(p => {
    p.waiting_grill = !!(p.is_grill && grillMap[p.id] !== 'ready');
  });
  res.json(list);
});

pedidosRouter.get('/grill', (req, res) => {
  const db = getDb(req);
  const mainList = db.prepare(`
    SELECT p.*, i.name as item_name, i.is_prato_feito as item_is_prato_feito,
      COALESCE(i.is_side, 0) as is_side,
      c.mesa, c.id as comanda_id, c.production_number,
      COALESCE(NULLIF(TRIM(c.tipo_online), ''), o.tipo) AS comanda_tipo_online,
      s.status as sector_status, MAX(0,p.quantity-s.fulfilled_quantity) AS quantity,
      ei.name as prato_feito_espetinho_name, w.name as waiter_name
    FROM pedido_sector_status s
    JOIN pedidos p ON p.id = s.pedido_id
    JOIN items i ON i.id = p.item_id
    JOIN comandas c ON c.id = p.comanda_id
    LEFT JOIN orders o ON o.id = c.origin_order_id
    LEFT JOIN items ei ON ei.id = p.prato_feito_espetinho_id
    LEFT JOIN waiters w ON w.id = c.waiter_id
    WHERE s.sector = 'grill' AND s.status != 'ready' AND p.status != 'cancelled' AND p.status != 'delivered'
    ORDER BY p.created_at, p.id
  `).all();
  const comandaIds = [...new Set(mainList.map((row) => row.comanda_id).filter((id) => id != null))];
  let companion = [];
  if (comandaIds.length > 0) {
    const placeholders = comandaIds.map(() => '?').join(',');
    companion = db.prepare(`
      SELECT p.*, i.name as item_name, i.is_prato_feito as item_is_prato_feito,
        COALESCE(i.is_side, 0) as is_side,
        c.mesa, c.id as comanda_id, c.production_number,
        COALESCE(NULLIF(TRIM(c.tipo_online), ''), o.tipo) AS comanda_tipo_online,
        sk.status as sector_status, MAX(0,p.quantity-sk.fulfilled_quantity) AS quantity,
        ei.name as prato_feito_espetinho_name, w.name as waiter_name
      FROM pedidos p
      JOIN items i ON i.id = p.item_id
      JOIN categories cat ON cat.id = i.category_id
      JOIN pedido_sector_status sk ON sk.pedido_id = p.id AND sk.sector = 'kitchen'
      JOIN comandas c ON c.id = p.comanda_id
      LEFT JOIN orders o ON o.id = c.origin_order_id
      LEFT JOIN items ei ON ei.id = p.prato_feito_espetinho_id
      LEFT JOIN waiters w ON w.id = c.waiter_id
      WHERE cat.slug = 'acompanhamentos'
        AND COALESCE(i.is_grill, 0) = 0
        AND COALESCE(i.is_bar, 0) = 0
        AND sk.status != 'ready'
        AND p.status != 'cancelled' AND p.status != 'delivered'
        AND p.comanda_id IN (${placeholders})
      ORDER BY p.created_at, p.id
    `).all(...comandaIds);
  }
  const companionSolo = db.prepare(`
    SELECT p.*, i.name as item_name, i.is_prato_feito as item_is_prato_feito,
      COALESCE(i.is_side, 0) as is_side,
      c.mesa, c.id as comanda_id, c.production_number,
      COALESCE(NULLIF(TRIM(c.tipo_online), ''), o.tipo) AS comanda_tipo_online,
      sk.status as sector_status, MAX(0,p.quantity-sk.fulfilled_quantity) AS quantity,
      ei.name as prato_feito_espetinho_name, w.name as waiter_name
    FROM pedidos p
    JOIN items i ON i.id = p.item_id
    JOIN categories cat ON cat.id = i.category_id
    JOIN pedido_sector_status sk ON sk.pedido_id = p.id AND sk.sector = 'kitchen'
    JOIN comandas c ON c.id = p.comanda_id
    LEFT JOIN orders o ON o.id = c.origin_order_id
    LEFT JOIN items ei ON ei.id = p.prato_feito_espetinho_id
    LEFT JOIN waiters w ON w.id = c.waiter_id
    WHERE cat.slug = 'acompanhamentos'
      AND COALESCE(i.is_grill, 0) = 0
      AND COALESCE(i.is_bar, 0) = 0
      AND sk.status != 'ready'
      AND p.status != 'cancelled' AND p.status != 'delivered'
      AND p.comanda_id IN (${SQL_COMANDAS_SOLO_ACOMPANHAMENTOS})
    ORDER BY p.created_at, p.id
  `).all();
  const byId = new Map();
  mainList.forEach((row) => byId.set(row.id, row));
  companion.forEach((row) => {
    if (!byId.has(row.id)) byId.set(row.id, row);
  });
  companionSolo.forEach((row) => {
    if (!byId.has(row.id)) byId.set(row.id, row);
  });
  const list = [...byId.values()].sort((a, b) => {
    const ta = String(a.created_at || '');
    const tb = String(b.created_at || '');
    if (ta !== tb) return ta.localeCompare(tb);
    return (a.id || 0) - (b.id || 0);
  });
  res.json(list);
});

pedidosRouter.get('/bar', (req, res) => {
  const db = getDb(req);
  const barIn = BAR_CATEGORY_SLUGS.map(() => '?').join(', ');
  const list = db.prepare(`
    SELECT p.*, i.name as item_name, c.mesa, c.id as comanda_id, c.production_number,
      COALESCE(NULLIF(TRIM(c.tipo_online), ''), o.tipo) AS comanda_tipo_online,
      COALESCE(s.status, 'pending') as sector_status,
      w.name as waiter_name
    FROM pedidos p
    JOIN items i ON i.id = p.item_id
    JOIN categories cat ON cat.id = i.category_id AND cat.slug IN (${barIn})
    JOIN comandas c ON c.id = p.comanda_id
    LEFT JOIN orders o ON o.id = c.origin_order_id
    LEFT JOIN pedido_sector_status s ON s.pedido_id = p.id AND s.sector = 'bar'
    LEFT JOIN waiters w ON w.id = c.waiter_id
    WHERE p.sector = 'bar' AND p.status != 'cancelled' AND p.status != 'delivered' AND (s.status IS NULL OR s.status != 'ready')
    ORDER BY p.created_at, p.id
  `).all(...BAR_CATEGORY_SLUGS);
  list.forEach(p => { p.sector_status = p.sector_status || 'pending'; });
  res.json(list);
});

pedidosRouter.get('/production/kitchen', (req, res) => {
  const db = getDb(req);
  /* Conta tudo que a cozinha precisa fazer (quem tem status kitchen), não só p.sector = 'kitchen' */
  const items = db.prepare(`
    SELECT i.name, SUM(p.quantity) as total
    FROM pedido_sector_status s
    JOIN pedidos p ON p.id = s.pedido_id
    JOIN items i ON i.id = p.item_id
    WHERE s.sector = 'kitchen' AND s.status != 'ready' AND (i.is_prato_feito = 0 OR i.is_prato_feito IS NULL) AND p.status != 'cancelled' AND p.status != 'delivered'
    GROUP BY p.item_id
    ORDER BY total DESC
  `).all();
  const pratoFeitoRow = db.prepare(`
    SELECT COALESCE(SUM(p.quantity), 0) as total
    FROM pedido_sector_status s
    JOIN pedidos p ON p.id = s.pedido_id
    JOIN items it ON it.id = p.item_id
    WHERE s.sector = 'kitchen' AND s.status != 'ready' AND it.is_prato_feito = 1 AND p.status != 'cancelled' AND p.status != 'delivered'
  `).get();
  const pratoFeito = (pratoFeitoRow?.total > 0) ? [{ espetinho_name: 'Prato Feito', total: pratoFeitoRow.total }] : [];
  res.json({ items, pratoFeito });
});

pedidosRouter.get('/production/grill', (req, res) => {
  const db = getDb(req);
  /* Carnes diretas na churrasqueira — exclui o prato PF em si (o nome do cardápio); os cortes do PF entram via fromPratoFeito */
  const directGrill = db.prepare(`
    SELECT i.name, p.meat_point, SUM(MAX(0,p.quantity-s.fulfilled_quantity)) as total
    FROM pedidos p
    JOIN items i ON i.id = p.item_id
    JOIN pedido_sector_status s ON s.pedido_id = p.id AND s.sector = 'grill'
    WHERE p.sector = 'grill' AND p.status != 'cancelled' AND p.status != 'delivered' AND s.status != 'ready'
      AND (i.is_prato_feito = 0 OR i.is_prato_feito IS NULL)
    GROUP BY p.item_id, p.meat_point
  `).all();
  const fromPratoFeito = db.prepare(`
    SELECT ei.name, p.meat_point, SUM(MAX(0,p.quantity-s.fulfilled_quantity)) as total
    FROM pedidos p
    JOIN items it ON it.id = p.item_id
    JOIN items ei ON ei.id = p.prato_feito_espetinho_id
    JOIN pedido_sector_status s ON s.pedido_id = p.id AND s.sector = 'grill'
    WHERE it.is_prato_feito = 1 AND p.status != 'cancelled' AND p.status != 'delivered' AND p.prato_feito_espetinho_id IS NOT NULL AND s.status != 'ready'
    GROUP BY p.prato_feito_espetinho_id, p.meat_point
  `).all();
  const key = (name, meat) => `${name}|${meat || ''}`;
  const map = {};
  directGrill.forEach((r) => {
    const k = key(r.name, r.meat_point);
    map[k] = { name: r.name, meat_point: r.meat_point || null, total: (map[k]?.total || 0) + r.total };
  });
  fromPratoFeito.forEach((r) => {
    const k = key(r.name, r.meat_point);
    map[k] = { name: r.name, meat_point: r.meat_point || null, total: (map[k]?.total || 0) + r.total };
  });
  const pfPratosRow = db.prepare(`
    SELECT COALESCE(SUM(MAX(0,p.quantity-s.fulfilled_quantity)), 0) as total
    FROM pedidos p
    JOIN items it ON it.id = p.item_id
    JOIN pedido_sector_status s ON s.pedido_id = p.id AND s.sector = 'grill'
    WHERE it.is_prato_feito = 1 AND p.status != 'cancelled' AND p.status != 'delivered' AND s.status != 'ready'
  `).get();
  const pfEspRow = db.prepare(`
    SELECT COALESCE(SUM(MAX(0,p.quantity-s.fulfilled_quantity)), 0) as total
    FROM pedidos p
    JOIN items it ON it.id = p.item_id
    JOIN pedido_sector_status s ON s.pedido_id = p.id AND s.sector = 'grill'
    WHERE it.is_prato_feito = 1 AND p.prato_feito_espetinho_id IS NOT NULL
      AND p.status != 'cancelled' AND p.status != 'delivered' AND s.status != 'ready'
  `).get();
  const pratos = pfPratosRow?.total ?? 0;
  const espetinhos = pfEspRow?.total ?? 0;
  const pratoFeito = pratos > 0 ? { pratos, espetinhos } : null;

  const companionSides = db.prepare(`
    SELECT i.name, SUM(MAX(0,p.quantity-sk.fulfilled_quantity)) as total
    FROM pedidos p
    JOIN items i ON i.id = p.item_id
    JOIN categories cat ON cat.id = i.category_id
    JOIN pedido_sector_status sk ON sk.pedido_id = p.id AND sk.sector = 'kitchen'
    WHERE cat.slug = 'acompanhamentos'
      AND COALESCE(i.is_grill, 0) = 0
      AND COALESCE(i.is_bar, 0) = 0
      AND sk.status != 'ready'
      AND p.status != 'cancelled' AND p.status != 'delivered'
      AND (
        p.comanda_id IN (
          SELECT DISTINCT p2.comanda_id
          FROM pedido_sector_status s2
          JOIN pedidos p2 ON p2.id = s2.pedido_id
          WHERE s2.sector = 'grill' AND s2.status != 'ready'
            AND p2.status != 'cancelled' AND p2.status != 'delivered'
        )
        OR p.comanda_id IN (${SQL_COMANDAS_SOLO_ACOMPANHAMENTOS})
      )
    GROUP BY p.item_id
  `).all();
  const mapSides = { ...map };
  companionSides.forEach((r) => {
    const k = key(r.name, null);
    mapSides[k] = { name: r.name, meat_point: null, total: (mapSides[k]?.total || 0) + r.total };
  });
  const byItemWithSides = Object.values(mapSides).sort((a, b) => b.total - a.total);

  res.json({ byItem: byItemWithSides, pratoFeito });
});

/**
 * Marca pronto na Churrasqueira usando sempre o item atual no banco (evita conflito
 * entre cardápio alterado, pedidos.sector antigo e PATCH só na grill com kitchen pendente).
 */
pedidosRouter.patch('/churrasqueira-ready/:pedidoId', (req, res) => {
  const db = getDb(req);
  const io = req.app.get('io');
  const pid = Number(req.params.pedidoId);
  if (!Number.isFinite(pid) || pid < 1) return res.status(400).json({ error: 'pedido inválido' });
  const row = db.prepare(`
    SELECT p.id, p.quantity, p.status AS pedido_status, p.sector AS pedido_sector,
           COALESCE(i.is_grill, 0) AS is_grill,
           COALESCE(i.is_side, 0) AS is_side,
           lower(trim(ifnull(c.slug, ''))) AS category_slug
    FROM pedidos p
    JOIN items i ON i.id = p.item_id
    LEFT JOIN categories c ON c.id = i.category_id
    WHERE p.id = ?
  `).get(pid);
  if (!row) return res.status(404).json({ error: 'Pedido não encontrado' });
  const st = String(row.pedido_status || '').toLowerCase();
  if (st === 'cancelled' || st === 'delivered') {
    return res.status(400).json({ error: 'Pedido inválido para produção' });
  }
  const slug = row.category_slug || '';
  const ig = Number(row.is_grill) === 1;
  const isSide = Number(row.is_side) === 1;
  const ins = {run(pid,sector){
    const existing=db.prepare('SELECT * FROM pedido_sector_status WHERE pedido_id=? AND sector=?').get(pid,sector);
    if(existing?.status==='ready')return;
    const done=req.body?.one===true?Math.min(row.quantity,(existing?.fulfilled_quantity||0)+1):row.quantity;
    db.prepare("INSERT OR REPLACE INTO pedido_sector_status(pedido_id,sector,status,fulfilled_quantity,updated_at) VALUES(?,?,?,?,datetime('now','localtime'))").run(pid,sector,done>=row.quantity?'ready':(existing?.status||'pending'),done);
  }};
  const run = db.transaction(() => {
    if (slug === 'acompanhamentos') {
      if (!ig) {
        ins.run(pid, 'kitchen');
        return;
      }
      ins.run(pid, 'grill');
      ins.run(pid, 'kitchen');
      return;
    }
    if (isSide) {
      ins.run(pid, 'kitchen');
      return;
    }
    if (String(row.pedido_sector || '') === 'kitchen' && !ig) {
      ins.run(pid, 'kitchen');
      return;
    }
    ins.run(pid, 'grill');
  });
  run();
  broadcastAll('pedidos', {});
  io?.to('kitchen').emit('pedidos', {});
  io?.to('grill').emit('pedidos', {});
  io?.to('bar').emit('pedidos', {});
  res.json({ ok: true });
});

// Baixa de produção independente da quantidade vendida e do pagamento.
pedidosRouter.post('/:id/fulfill-one', (req, res) => {
  const db = getDb(req), id = Number(req.params.id);
  const row = db.prepare("SELECT p.quantity,p.status,s.fulfilled_quantity,s.status AS sector_status FROM pedidos p JOIN pedido_sector_status s ON s.pedido_id=p.id AND s.sector='kitchen' WHERE p.id=?").get(id);
  if (!row || ['cancelled','delivered'].includes(row.status) || row.sector_status === 'ready') return res.status(400).json({error:'Pedido indisponível para baixa'});
  const done = Math.min(row.quantity, row.fulfilled_quantity + 1);
  db.prepare("UPDATE pedido_sector_status SET fulfilled_quantity=?,status=?,updated_at=datetime('now','localtime') WHERE pedido_id=? AND sector='kitchen'").run(done,done>=row.quantity?'ready':row.sector_status,id);
  broadcastAll('pedidos', {});
  res.json({ok:true,remaining:row.quantity-done});
});

pedidosRouter.patch('/:id/sector-status', (req, res) => {
  const db = getDb(req);
  const io = req.app.get('io');
  const { sector, status } = req.body || {};
  if (!sector || !status) return res.status(400).json({ error: 'sector e status obrigatórios' });
  db.prepare("INSERT OR REPLACE INTO pedido_sector_status (pedido_id, sector, status, updated_at) VALUES (?, ?, ?, datetime('now','localtime'))").run(Number(req.params.id), sector, status);
  broadcastAll('pedidos', {});
  io.to('kitchen').emit('pedidos', {});
  io.to('grill').emit('pedidos', {});
  io.to('bar').emit('pedidos', {});
  res.json({ ok: true });
});

pedidosRouter.patch('/:id', (req, res) => {
  const db = getDb(req);
  const existing=db.prepare('SELECT p.*,c.status AS comanda_status FROM pedidos p JOIN comandas c ON c.id=p.comanda_id WHERE p.id=?').get(Number(req.params.id));
  if(!existing || existing.paid_at || existing.paid_quantity>0 || existing.comanda_status==='closed') return res.status(400).json({error:'Item pago ou comanda fechada não pode ser alterado'});
  if(req.body.quantity!==undefined && (!Number.isInteger(Number(req.body.quantity)) || Number(req.body.quantity)<1)) return res.status(400).json({error:'Quantidade inválida'});
  if(req.body.unit_price!==undefined && (!Number.isFinite(Number(req.body.unit_price)) || Number(req.body.unit_price)<0)) return res.status(400).json({error:'Preço inválido'});
  const { quantity, unit_price, observations, status } = req.body || {};
  const updates = [];
  const values = [];
  if (quantity !== undefined) { updates.push('quantity = ?'); values.push(quantity); }
  if (unit_price !== undefined) { updates.push('unit_price = ?'); values.push(unit_price); }
  if (observations !== undefined) { updates.push('observations = ?'); values.push(observations); }
  if (status !== undefined) { updates.push('status = ?'); values.push(status); }
  if (!updates.length) return res.status(400).json({ error: 'Nenhum campo para atualizar' });
  updates.push("updated_at = datetime('now','localtime')");
  values.push(Number(req.params.id));
  db.prepare(`UPDATE pedidos SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  broadcastAll('pedidos', {});
  broadcastAll('comandas', {});
  res.json({ ok: true });
});

pedidosRouter.delete('/:id', (req, res) => {
  const db = getDb(req);
  db.prepare(
    "UPDATE pedidos SET status = ?, updated_at = datetime('now','localtime') WHERE id = ? AND paid_at IS NULL AND paid_quantity=0"
  ).run('cancelled', Number(req.params.id));
  broadcastAll('pedidos', {});
  broadcastAll('comandas', {});
  res.json({ ok: true });
});


