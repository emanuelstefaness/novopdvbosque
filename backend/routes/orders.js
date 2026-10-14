import { Router } from 'express';
import { broadcastAll } from '../socket.js';
import { fecharProducaoDoPedido } from '../orderProduction.js';
import { ifoodConfigurado, criarClienteIfood, cancelarNoIfood, modoIfood } from '../ifood.js';

export const ordersRouter = Router();
const getDb = (req) => req.app.get('db');

// Listar pedidos online (interno)
ordersRouter.get('/', (req, res) => {
  const db = getDb(req);
  const { tipo, status, dia } = req.query;
  // Por padrao so os pedidos de hoje (a partir das 00:00). Os anteriores ficam no Historico de comandas.
  // Excecao: ate 01:00, pedido de ontem que ainda nao foi entregue nem cancelado continua na tela (cliente ainda esperando).
  // `?dia=todos` devolve tudo (uso interno/relatorios).
  const soHoje = dia !== 'todos';
  let list = db.prepare(`
    SELECT o.*, c.id as comanda_id, c.mesa, c.status as comanda_status
    FROM orders o
    LEFT JOIN comandas c ON c.id = o.comanda_id
    ${soHoje ? `WHERE substr(o.created_at, 1, 10) = date('now','localtime')
       OR (time('now','localtime') < '01:00:00'
           AND substr(o.created_at, 1, 10) = date('now','localtime','-1 day')
           AND o.status NOT IN ('entregue','cancelado'))` : ''}
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
  // Pedido cancelado ou entregue sai da fila de produção (Cozinha, Churrasqueira, Bar).
  if (status === 'cancelado' || status === 'entregue') {
    if (fecharProducaoDoPedido(db, id, status) > 0) broadcastAll('pedidos', {});
  }
  // Pedido do iFood: avisa o iFood da mudança (preparo, pronto, despacho, cancelamento). Falha aqui não trava o PDV.
  if (order.origem === 'ifood' && order.external_id && ifoodConfigurado() && modoIfood() === 'integrado') {
    const cliente = criarClienteIfood({ clientId: process.env.IFOOD_CLIENT_ID, clientSecret: process.env.IFOOD_CLIENT_SECRET, baseUrl: process.env.IFOOD_API_BASE || undefined });
    const tarefa = status === 'cancelado'
      ? cancelarNoIfood(cliente, order.external_id, { codigo: req.body?.ifood_cancel_code, motivo: req.body?.motivo_cancelamento })
      : cliente.avisarStatus(order.external_id, status, { entregaPor: order.entrega_por });
    tarefa.catch((e) => console.warn('[iFood] não foi possível avisar o status:', e.message));
  }
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
