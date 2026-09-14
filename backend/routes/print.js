import { summaryFor } from '../billing.js';
import { Router } from 'express';

export const printRouter = Router();
const getDb = (req) => req.app.get('db');

printRouter.get('/comanda/:id', (req, res) => {
  const db = getDb(req);
  const id = Number(req.params.id);
  const comanda = db.prepare('SELECT * FROM comandas WHERE id = ?').get(id);
  if (!comanda) return res.status(404).json({ error: 'Comanda não encontrada' });
  const pedidos = db.prepare(`
    SELECT p.*, p.quantity-p.paid_quantity AS quantity, i.name as item_name
    FROM pedidos p
    JOIN items i ON i.id = p.item_id
    WHERE p.comanda_id = ? AND p.status != 'cancelled' AND p.paid_at IS NULL
    ORDER BY p.created_at
  `).all(id);
  const bill=summaryFor(db,id);
  const subtotal=bill.subtotal, peopleCount=comanda.people_count || 0, couvertPerPerson=comanda.couvert_per_person ?? 5;
  const couvertLancadoQty=bill.pedidos.filter(p=>p.item_name.trim().toLowerCase()==='couvert').reduce((s,p)=>s+p.quantity,0);
  const couvertLancadoValor=bill.couvert, couvertPrevisto=bill.couvert, couvertPendente=0;
  const serviceTaxPercent=comanda.service_tax_percent || 0, serviceTaxValor=bill.serviceTax;
  const totalSemTaxaGarcom=bill.subtotal, totalComTaxa=bill.total;
  const printedAt = db.prepare(`SELECT datetime('now','localtime') as t`).get()?.t || '';

  res.json({
    logo: 'BOSQUE DA CARNE',
    comanda: id,
    mesa: comanda.mesa,
    client_cpf: comanda.client_cpf != null && String(comanda.client_cpf).trim() ? String(comanda.client_cpf).trim() : null,
    pedidos,
    subtotal,
    people_count: peopleCount,
    couvert_per_person: couvertPerPerson,
    couvert_previsto: couvertPrevisto,
    couvert_lancado_qty: couvertLancadoQty,
    couvert_lancado_valor: couvertLancadoValor,
    couvert_pendente: couvertPendente,
    service_tax_percent: serviceTaxPercent,
    service_tax: serviceTaxValor,
    mixed_service: pedidos.some(p=>p.billing_service_percent!=null&&Number(p.billing_service_percent)!==Number(serviceTaxPercent)),
    credit: bill.credit,
    paid_total: bill.paidTotal,
    total_sem_taxa_garcom: totalSemTaxaGarcom,
    total: totalComTaxa,
    printed_at: printedAt
  });
});

// Comanda para motoboy (pedido online delivery)
printRouter.get('/order/:id', (req, res) => {
  const db = getDb(req);
  const id = Number(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  const items = db.prepare(`
    SELECT oi.*, i.name as item_name
    FROM order_items oi
    JOIN items i ON i.id = oi.item_id
    WHERE oi.order_id = ?
    ORDER BY oi.id
  `).all(id);

  let subtotalItens = 0;
  for (const row of items) {
    subtotalItens += Number(row.quantity || 0) * Number(row.unit_price || 0);
  }
  subtotalItens = Math.round(subtotalItens * 100) / 100;

  const tipo = String(order.tipo || '').toLowerCase();
  const valorTotal = Math.round(Number(order.valor_total || 0) * 100) / 100;
  let taxaEntrega = 0;
  if (tipo === 'delivery') {
    taxaEntrega = Math.round(Math.max(0, valorTotal - subtotalItens) * 100) / 100;
  }

  res.json({
    logo: 'BOSQUE DA CARNE',
    tipo: order.tipo,
    numero: order.id,
    cliente_nome: order.cliente_nome,
    cliente_telefone: order.cliente_telefone,
    cliente_email: order.cliente_email,
    forma_pagamento: order.forma_pagamento,
    endereco_rua: order.endereco_rua,
    endereco_numero: order.endereco_numero,
    endereco_complemento: order.endereco_complemento,
    endereco_bairro: order.endereco_bairro,
    endereco_referencia: order.endereco_referencia,
    observacoes: order.observacoes,
    items,
    subtotal_itens: subtotalItens,
    taxa_entrega: taxaEntrega,
    entrega_gratis: tipo === 'delivery' && taxaEntrega === 0,
    valor_total: valorTotal,
    created_at: order.created_at
  });
});
