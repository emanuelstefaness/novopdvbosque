/**
 * Quando um pedido online é cancelado ou entregue, os itens dele deixam de existir na produção.
 * Sem isso, os itens de pedidos cancelados/concluídos continuam aparecendo (e sendo contados) na Cozinha,
 * Churrasqueira e Bar.
 */
export function fecharProducaoDoPedido(db, orderId, desfecho) {
  const o = db.prepare('SELECT comanda_id FROM orders WHERE id = ?').get(Number(orderId));
  if (!o?.comanda_id) return 0;
  const status = desfecho === 'cancelado' ? 'cancelled' : 'delivered';
  const r = db
    .prepare("UPDATE pedidos SET status = ?, updated_at = datetime('now','localtime') WHERE comanda_id = ? AND status NOT IN ('cancelled','delivered')")
    .run(status, o.comanda_id);
  db.prepare(
    "UPDATE pedido_sector_status SET status = 'ready', updated_at = datetime('now','localtime') WHERE pedido_id IN (SELECT id FROM pedidos WHERE comanda_id = ?) AND status != 'ready'",
  ).run(o.comanda_id);
  return r.changes;
}
