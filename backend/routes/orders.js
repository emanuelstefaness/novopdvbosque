import { Router } from 'express';
import { broadcastAll } from '../socket.js';

export const ordersRouter = Router();
const getDb = (req) => req.app.get('db');

// Listar pedidos online (interno)
ordersRouter.get('/', (req, res) => {
  const db = getDb(req);
  const { tipo, status } = req.query;
  let list = db.prepare(`
    SELECT o.*, c.id as comanda_id, c.mesa, c.status as comanda_status
    FROM orders o
    LEFT JOIN comandas c ON c.id = o.comanda_id
    ORDER BY o.created_at DESC
  `).all();
  if (tipo && ['delivery', 'retirada'].includes(tipo)) {
    list = list.filter((r) => r.tipo === tipo);
  }
  if (status && ['aguardando_pagamento', 'recebido', 'em_producao', 'pronto', 'saiu_entrega', 'entregue', 'cancelado'].includes(status)) {
    list = list.filter((r) => r.status === status);
  }
  const withItems = list.map((order) => {
    const items = db.prepare(`
      SELECT oi.*, i.name as item_name
      FROM order_items oi
      JOIN items i ON i.id = oi.item_id
      WHERE oi.order_id = ?
      ORDER BY oi.id
    `).all(order.id);
    return { ...order, items };
  });
  res.json(withItems);
});

// Atualizar status do pedido
ordersRouter.patch('/:id/status', (req, res) => {
  const db = getDb(req);
  const id = Number(req.params.id);
  const { status, motivo_cancelamento } = req.body || {};
  const valid = ['aguardando_pagamento', 'recebido', 'em_producao', 'pronto', 'saiu_entrega', 'entregue', 'cancelado'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Status inválido' });
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (status === 'cancelado') {
    const motivo = motivo_cancelamento != null ? String(motivo_cancelamento).trim().slice(0, 800) : null;
    db.prepare(`
      UPDATE orders SET status = ?, motivo_cancelamento = ?, updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(status, motivo || null, id);
  } else {
    db.prepare(`
      UPDATE orders SET status = ?, motivo_cancelamento = NULL, updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(status, id);
  }
  if (status === 'entregue') db.prepare("UPDATE orders SET delivered_at=COALESCE(delivered_at,datetime('now','localtime')) WHERE id=?").run(id);
  broadcastAll('orders', {});
  broadcastAll('comandas', {});
  res.json({ id, status });
});

// Detalhe de um pedido (interno)
ordersRouter.get('/:id', (req, res) => {
  const db = getDb(req);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  const items = db.prepare(`
    SELECT oi.*, i.name as item_name
    FROM order_items oi
    JOIN items i ON i.id = oi.item_id
    WHERE oi.order_id = ?
  `).all(order.id);
  res.json({ ...order, items });
});
