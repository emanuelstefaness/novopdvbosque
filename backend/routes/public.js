import { Router } from 'express';
import { broadcastAll } from '../socket.js';
import { getPedidoSector } from '../itemSector.js';
import { resolveLancheAddonsFromBody } from '../lancheAddons.js';
import { getTaxaEntregaDelivery, entregaGratisAtiva } from '../deliveryFee.js';
import { isPedidosOnlineAtivo, statusPedidosOnline, MENSAGEM_ONLINE_FECHADO } from '../onlineSystem.js';
import { createPixPayment, getPaymentStatus, cancelPayment } from '../mercadoPago.js';

export const publicRouter = Router();
const getDb = (req) => req.app.get('db');

function normalizeTelefone(v) {
  return String(v || '').replace(/\D/g, '');
}

function telefoneConfere(stored, query) {
  const a = normalizeTelefone(stored);
  const b = normalizeTelefone(query);
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.length >= 8 && a.endsWith(b.slice(-8))) return true;
  if (b.length >= 4 && a.endsWith(b.slice(-4))) return true;
  return false;
}

function orderComItens(db, order) {
  const items = db.prepare(`
    SELECT oi.*, i.name as item_name
    FROM order_items oi
    JOIN items i ON i.id = oi.item_id
    WHERE oi.order_id = ?
    ORDER BY oi.id
  `).all(order.id);
  return { ...order, items };
}

// Cria os pedidos/fila por setor (cozinha, grill, bar) para os itens de um pedido.
// Usado tanto no despacho imediato (pagamento não-PIX) quanto na confirmação tardia do PIX.
function dispatchItemsToSectors(db, comandaId, items) {
  const insPedido = db.prepare(`
    INSERT INTO pedidos (comanda_id, item_id, quantity, unit_price, observations, prato_feito_espetinho_id, extra_caramelized_onion, extra_hamburger, sector)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insStatus = db.prepare('INSERT OR REPLACE INTO pedido_sector_status (pedido_id, sector, status) VALUES (?, ?, ?)');

  for (const row of items) {
    const item = db.prepare(`
      SELECT i.*, c.slug AS category_slug
      FROM items i
      LEFT JOIN categories c ON c.id = i.category_id
      WHERE i.id = ?
    `).get(row.item_id);
    const sector = item ? getPedidoSector(item) : null;
    const r = insPedido.run(
      comandaId,
      row.item_id,
      row.quantity,
      row.unit_price,
      row.observations,
      row.prato_feito_espetinho_id || null,
      row.extra_caramelized_onion ?? 0,
      row.extra_hamburger ?? 0,
      sector
    );
    const pedidoId = r.lastInsertRowid;
    if (sector) insStatus.run(pedidoId, sector, 'pending');
    if (item && item.is_grill && item.is_kitchen && sector === 'kitchen') insStatus.run(pedidoId, 'grill', 'pending');
    if (item && item.is_grill && item.is_kitchen && sector === 'grill') insStatus.run(pedidoId, 'kitchen', 'pending');
  }
}

// Confirma o pagamento PIX de um pedido: libera para a cozinha/PDV e avisa via socket.
function confirmarPagamentoPix(db, order) {
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  const run = db.transaction(() => {
    db.prepare(`
      UPDATE orders SET status = 'recebido', payment_status = 'aprovado', updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(order.id);
    db.prepare(`
      UPDATE comandas SET status = 'ordering', updated_at = datetime('now','localtime')
      WHERE id = ?
    `).run(order.comanda_id);
    dispatchItemsToSectors(db, order.comanda_id, items.map((it) => ({
      item_id: it.item_id,
      quantity: it.quantity,
      unit_price: it.unit_price,
      observations: it.observations,
      prato_feito_espetinho_id: it.prato_feito_espetinho_id,
      extra_caramelized_onion: it.extra_caramelized_onion,
      extra_hamburger: it.extra_hamburger,
    })));
  });
  run();
  broadcastAll('pedidos', {});
  broadcastAll('comandas', {});
  broadcastAll('novo-pedido-online', {
    orderId: order.id,
    comandaId: order.comanda_id,
    tipo: order.tipo,
    cliente_nome: order.cliente_nome,
    cliente_telefone: order.cliente_telefone,
    valor_total: order.valor_total,
  });
}

// Enquanto o pedido está aguardando PIX, consulta o Mercado Pago a cada vez que o
// cliente/PDV busca o pedido (reaproveita o polling já existente da tela de acompanhamento).
async function refreshPixIfNeeded(db, order) {
  if (!order || order.forma_pagamento !== 'pix' || order.status !== 'aguardando_pagamento' || !order.mp_payment_id) {
    return order;
  }
  try {
    const expiraEm = order.pix_expira_em ? new Date(order.pix_expira_em).getTime() : null;
    if (expiraEm && Date.now() > expiraEm) {
      await cancelPayment(order.mp_payment_id);
      db.prepare(`
        UPDATE orders SET status = 'cancelado', payment_status = 'expirado', motivo_cancelamento = ?, updated_at = datetime('now','localtime')
        WHERE id = ?
      `).run('Tempo para pagamento via PIX expirou. Faça um novo pedido.', order.id);
      return db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
    }
    const { status } = await getPaymentStatus(order.mp_payment_id);
    if (status === 'aprovado') {
      confirmarPagamentoPix(db, order);
      return db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
    }
    if (status === 'rejeitado' || status === 'cancelado') {
      db.prepare(`
        UPDATE orders SET status = 'cancelado', payment_status = ?, motivo_cancelamento = ?, updated_at = datetime('now','localtime')
        WHERE id = ?
      `).run(status, 'Pagamento PIX não aprovado.', order.id);
      return db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
    }
    return order;
  } catch (e) {
    console.warn('Falha ao consultar status PIX no Mercado Pago:', e.message);
    return order;
  }
}

// Diagnóstico: confirma que a API pública está no ar
publicRouter.get('/', (req, res) => {
  res.json({ ok: true, message: 'API pública pedidos online' });
});

// Cardápio para pedidos online (categorias + itens visíveis ao cliente; itens `internal_only` ficam só no PDV interno)
publicRouter.get('/menu', (req, res) => {
  const db = getDb(req);
  const items = db.prepare(`
    SELECT i.id, i.category_id, i.name, i.price, i.description, i.is_prato_feito
    FROM items i
    WHERE COALESCE(i.internal_only, 0) = 0
    ORDER BY i.category_id, i.name
  `).all();
  const catIds = [...new Set(items.map((row) => row.category_id).filter((id) => id != null))];
  let categories = [];
  if (catIds.length) {
    const ph = catIds.map(() => '?').join(',');
    categories = db
      .prepare(`SELECT id, name, slug, sort_order FROM categories WHERE id IN (${ph}) ORDER BY sort_order, name`)
      .all(...catIds);
  }
  const taxa_entrega_delivery = getTaxaEntregaDelivery();
  const online = statusPedidosOnline();
  res.json({
    categories: online.online_ativo ? categories : [],
    items: online.online_ativo ? items : [],
    taxa_entrega_delivery,
    entrega_gratis: entregaGratisAtiva(),
    online_ativo: online.online_ativo,
    mensagem_fechado: online.mensagem_fechado,
  });
});

// Criar pedido online → cria order, comanda (id 201+), pedidos; emite alerta
publicRouter.post('/orders', async (req, res) => {
  try {
  if (!isPedidosOnlineAtivo()) {
    return res.status(503).json({ error: MENSAGEM_ONLINE_FECHADO });
  }
  const db = getDb(req);
  if (!db) return res.status(500).json({ error: 'Banco de dados não disponível' });
  const {
    tipo,
    cliente_nome,
    cliente_telefone,
    cliente_email,
    observacoes,
    endereco_rua,
    endereco_numero,
    endereco_complemento,
    endereco_bairro,
    endereco_referencia,
    forma_pagamento,
    items: cartItems
  } = req.body || {};

  if (!tipo || !['delivery', 'retirada'].includes(tipo)) {
    return res.status(400).json({ error: 'tipo deve ser delivery ou retirada' });
  }
  const nome = String(cliente_nome || '').trim();
  const telefone = String(cliente_telefone || '').trim();
  if (!nome || !telefone) {
    return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
  }
  const formasValidas = ['pix', 'dinheiro', 'cartao_debito', 'cartao_credito', 'vale'];
  const formaRaw = String(forma_pagamento ?? 'pix').trim().toLowerCase();
  if (!formasValidas.includes(formaRaw)) {
    return res.status(400).json({ error: 'Forma de pagamento inválida.' });
  }
  const formaPg = formaRaw;
  if (tipo === 'delivery') {
    const rua = String(endereco_rua || '').trim();
    const numero = String(endereco_numero || '').trim();
    const bairro = String(endereco_bairro || '').trim();
    if (!rua || !numero || !bairro) {
      return res.status(400).json({ error: 'Para delivery informe rua, número e bairro' });
    }
  }
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return res.status(400).json({ error: 'Adicione ao menos um item ao pedido' });
  }

  let valorTotal = 0;
  const validItems = [];
  const espetinhosCategory = db.prepare('SELECT id FROM categories WHERE slug = ?').get('espetinhos');
  const espetinhosCategoryId = espetinhosCategory?.id || null;
  for (const row of cartItems) {
    const itemId = Number(row.item_id);
    const qty = Math.max(1, Math.floor(Number(row.quantity) || 1));
    const item = db
      .prepare('SELECT id, price, name, is_prato_feito, COALESCE(internal_only, 0) AS internal_only FROM items WHERE id = ?')
      .get(itemId);
    if (!item) continue;
    if (Number(item.internal_only) === 1) {
      return res.status(400).json({ error: 'Um ou mais itens não estão disponíveis para pedido online.' });
    }
    let pratoFeitoEspetinhoId = null;
    if (Number(item.is_prato_feito) === 1) {
      const selectedEsp = Number(row.prato_feito_espetinho_id);
      if (!Number.isFinite(selectedEsp) || selectedEsp < 1) {
        return res.status(400).json({ error: `Selecione o espetinho para o item "${item.name}".` });
      }
      const esp = db.prepare(`
        SELECT i.id
        FROM items i
        WHERE i.id = ?
          AND (? IS NOT NULL AND i.category_id = ?)
          AND COALESCE(i.internal_only, 0) = 0
      `).get(selectedEsp, espetinhosCategoryId, espetinhosCategoryId);
      if (!esp) {
        return res.status(400).json({ error: `Espetinho inválido para o item "${item.name}".` });
      }
      pratoFeitoEspetinhoId = selectedEsp;
    }
    const addons = resolveLancheAddonsFromBody(item, row);
    const listUnit = Number(item.price || 0) + addons.unit_addon;
    const rawClient = row.unit_price ?? row.price;
    let unitPrice = listUnit;
    if (rawClient !== undefined && rawClient !== null && rawClient !== '') {
      const clientUnit = Number(rawClient);
      if (Number.isFinite(clientUnit) && clientUnit > 0 && clientUnit <= listUnit + 0.02) {
        unitPrice = Math.round(clientUnit * 100) / 100;
      }
    }
    let observationsOut = row.observations ? String(row.observations).trim() : null;
    const obsAdd = [];
    if (addons.extra_caramelized_onion) obsAdd.push('cebola caramelizada (+R$5,00)');
    if (addons.extra_hamburger) obsAdd.push('hambúrguer extra (+R$12,00)');
    if (obsAdd.length) {
      const s = obsAdd.join(' · ');
      observationsOut = observationsOut ? `${observationsOut} · ${s}` : s;
    }
    validItems.push({
      item_id: itemId,
      quantity: qty,
      unit_price: unitPrice,
      observations: observationsOut,
      prato_feito_espetinho_id: pratoFeitoEspetinhoId,
      extra_caramelized_onion: addons.extra_caramelized_onion,
      extra_hamburger: addons.extra_hamburger
    });
    valorTotal += qty * unitPrice;
  }
  if (validItems.length === 0) {
    return res.status(400).json({ error: 'Nenhum item válido no pedido' });
  }
  if (tipo === 'delivery') {
    valorTotal += getTaxaEntregaDelivery();
  }

  const isPix = formaPg === 'pix';
  const orderStatusInicial = isPix ? 'aguardando_pagamento' : 'recebido';
  const comandaStatusInicial = isPix ? 'aguardando_pagamento' : 'ordering';

  const run = db.transaction(() => {
    const nextId = db.prepare('SELECT COALESCE(MAX(id), 200) + 1 AS next FROM comandas WHERE id >= 200').get();
    const comandaId = nextId.next;

    // orders.comanda_id referencia comandas(id): inserir pedido sem comanda_id, criar comanda, depois vincular (FK com foreign_keys=ON)
    const orderInfo = db.prepare(`
      INSERT INTO orders (tipo, status, cliente_nome, cliente_telefone, cliente_email, observacoes,
        endereco_rua, endereco_numero, endereco_complemento, endereco_bairro, endereco_referencia, valor_total, forma_pagamento, comanda_id)
      VALUES (?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      tipo,
      orderStatusInicial,
      nome,
      telefone,
      cliente_email ? String(cliente_email).trim() : null,
      observacoes ? String(observacoes).trim() : null,
      tipo === 'delivery' ? String(endereco_rua || '').trim() : null,
      tipo === 'delivery' ? String(endereco_numero || '').trim() : null,
      tipo === 'delivery' ? (endereco_complemento ? String(endereco_complemento).trim() : null) : null,
      tipo === 'delivery' ? String(endereco_bairro || '').trim() : null,
      tipo === 'delivery' ? (endereco_referencia ? String(endereco_referencia).trim() : null) : null,
      valorTotal,
      formaPg
    );
    const orderId = orderInfo.lastInsertRowid;

    db.prepare(`
      INSERT INTO comandas (id, mesa, status, origin_order_id, tipo_online, cliente_nome, cliente_telefone, cliente_email,
        endereco_rua, endereco_numero, endereco_complemento, endereco_bairro, endereco_referencia)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?)
    `).run(
      comandaId,
      `Online #${orderId}`,
      comandaStatusInicial,
      orderId,
      tipo,
      nome,
      telefone,
      cliente_email ? String(cliente_email).trim() : null,
      tipo === 'delivery' ? String(endereco_rua || '').trim() : null,
      tipo === 'delivery' ? String(endereco_numero || '').trim() : null,
      tipo === 'delivery' ? (endereco_complemento ? String(endereco_complemento).trim() : null) : null,
      tipo === 'delivery' ? String(endereco_bairro || '').trim() : null,
      tipo === 'delivery' ? (endereco_referencia ? String(endereco_referencia).trim() : null) : null
    );

    db.prepare('UPDATE orders SET comanda_id = ? WHERE id = ?').run(comandaId, orderId);

    const insOrderItem = db.prepare(`
      INSERT INTO order_items (order_id, item_id, quantity, unit_price, observations, prato_feito_espetinho_id, extra_caramelized_onion, extra_hamburger)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of validItems) {
      insOrderItem.run(
        orderId,
        row.item_id,
        row.quantity,
        row.unit_price,
        row.observations,
        row.prato_feito_espetinho_id || null,
        row.extra_caramelized_onion ?? 0,
        row.extra_hamburger ?? 0
      );
    }

    if (!isPix) {
      dispatchItemsToSectors(db, comandaId, validItems);
    }

    return { orderId, comandaId };
  });

  const { orderId, comandaId } = run();

  let pixIndisponivel = false;
  if (isPix) {
    try {
      const pix = await createPixPayment({
        orderId,
        valorTotal,
        nome,
        email: cliente_email ? String(cliente_email).trim() : null,
      });
      db.prepare(`
        UPDATE orders SET mp_payment_id = ?, pix_qr_code = ?, pix_qr_code_base64 = ?, pix_expira_em = ?, payment_status = 'pendente', updated_at = datetime('now','localtime')
        WHERE id = ?
      `).run(pix.paymentId, pix.qrCode, pix.qrCodeBase64, pix.expiraEm, orderId);
    } catch (err) {
      console.error('Erro ao criar cobrança PIX no Mercado Pago:', err.message);
      pixIndisponivel = true;
      const fallback = db.transaction(() => {
        db.prepare("UPDATE orders SET status = 'recebido', updated_at = datetime('now','localtime') WHERE id = ?").run(orderId);
        db.prepare("UPDATE comandas SET status = 'ordering', updated_at = datetime('now','localtime') WHERE id = ?").run(comandaId);
        dispatchItemsToSectors(db, comandaId, validItems);
      });
      fallback();
    }
  }

  if (!isPix || pixIndisponivel) {
    broadcastAll('pedidos', {});
    broadcastAll('comandas', {});
    broadcastAll('novo-pedido-online', {
      orderId,
      comandaId,
      tipo,
      cliente_nome: nome,
      cliente_telefone: telefone,
      valor_total: valorTotal
    });
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  let message = tipo === 'retirada' ? 'Seu pedido estará disponível para retirada no balcão.' : 'Pedido recebido.';
  if (isPix && !pixIndisponivel) message = 'Pague com PIX para confirmar seu pedido.';
  else if (isPix && pixIndisponivel) message = 'Não foi possível gerar o PIX automático agora — combine o pagamento com o atendente.';
  res.status(201).json({
    ...orderComItens(db, order),
    comanda_id: comandaId,
    pix_indisponivel: pixIndisponivel || undefined,
    message
  });
  } catch (err) {
    console.error('Erro ao criar pedido online:', err);
    res.status(500).json({ error: err.message || 'Erro ao processar pedido. Tente novamente.' });
  }
});

// Último pedido do cliente (acompanhamento só com telefone)
publicRouter.get('/orders/ultimo', async (req, res) => {
  const db = getDb(req);
  const telReq = normalizeTelefone(req.query.telefone);
  if (!telReq || telReq.length < 8) {
    return res.status(400).json({ error: 'Informe seu telefone com DDD' });
  }
  const recentes = db.prepare(`
    SELECT * FROM orders ORDER BY id DESC LIMIT 300
  `).all();
  let order = recentes.find((o) => telefoneConfere(o.cliente_telefone, telReq));
  if (!order) {
    return res.status(404).json({ error: 'Nenhum pedido encontrado para este telefone' });
  }
  order = await refreshPixIfNeeded(db, order);
  res.json(orderComItens(db, order));
});

// Status do pedido (cliente consulta acompanhamento)
publicRouter.get('/orders/:id', async (req, res) => {
  const db = getDb(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: 'Pedido inválido' });
  }
  let order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

  const telReq = normalizeTelefone(req.query.telefone);
  const telOrder = normalizeTelefone(order.cliente_telefone);
  if (telReq && telOrder && !telefoneConfere(telOrder, telReq)) {
    return res.status(403).json({ error: 'Telefone não confere com este pedido' });
  }

  order = await refreshPixIfNeeded(db, order);
  res.json(orderComItens(db, order));
});
