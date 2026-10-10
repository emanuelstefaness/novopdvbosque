/**
 * Integração com o iFood (Merchant API).
 *
 * - `importarPedidoIfood`: converte um pedido do iFood em pedido + comanda do PDV e envia os itens para
 *   Churrasqueira / Cozinha / Bar. Não depende de credenciais, então pode ser testado e simulado.
 * - `criarClienteIfood`: cliente HTTP da API (token, eventos, pedido, mudança de status).
 * - `iniciarPollingIfood`: consulta os eventos a cada 30 s (método recomendado pelo iFood).
 *
 * Os caminhos e campos da API seguem a documentação pública do iFood; confira-os na homologação do portal.
 */
import { dispatchItemsToSectors } from './routes/public.js';
import { broadcastAll } from './socket.js';

export const IFOOD_API_BASE = 'https://merchant-api.ifood.com.br';
const CATEGORIA_NAO_MAPEADOS = { name: 'iFood (não mapeados)', slug: 'ifood-nao-mapeados' };

const cents = (v) => Math.round((Number(v) || 0) * 100);
const reais = (c) => c / 100;

/** Minúsculas, sem acento e sem espaços repetidos: chave estável para comparar nomes. */
export function normalizarNome(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function chaveDoItem(it) {
  const code = String(it.externalCode || '').trim();
  return code ? `code:${code}` : `name:${normalizarNome(it.name)}`;
}

/** Item do PDV correspondente a um item do iFood; cria um item interno só para não perder o pedido. */
function resolverItem(db, it, unitPrice) {
  const key = chaveDoItem(it);
  const nomeKey = `name:${normalizarNome(it.name)}`;
  const mapa = db.prepare('SELECT item_id FROM ifood_item_map WHERE external_key = ? AND item_id IS NOT NULL');
  let row = mapa.get(key) || mapa.get(nomeKey);
  if (row && db.prepare('SELECT 1 FROM items WHERE id = ?').get(row.item_id)) return { itemId: row.item_id, mapeado: true };

  const porNome = db
    .prepare('SELECT id, name FROM items')
    .all()
    .find((x) => normalizarNome(x.name) === normalizarNome(it.name) && !String(x.name).startsWith('[iFood]'));
  const salvar = db.prepare(`
    INSERT INTO ifood_item_map (external_key, external_name, item_id, auto_created)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(external_key) DO UPDATE SET item_id = excluded.item_id, auto_created = excluded.auto_created,
      external_name = excluded.external_name, updated_at = datetime('now','localtime')
  `);
  if (porNome) {
    salvar.run(key, it.name, porNome.id, 0);
    return { itemId: porNome.id, mapeado: true };
  }

  let cat = db.prepare('SELECT id FROM categories WHERE slug = ?').get(CATEGORIA_NAO_MAPEADOS.slug);
  if (!cat) {
    const r = db
      .prepare('INSERT INTO categories (name, slug, sort_order) VALUES (?, ?, 999)')
      .run(CATEGORIA_NAO_MAPEADOS.name, CATEGORIA_NAO_MAPEADOS.slug);
    cat = { id: r.lastInsertRowid };
  }
  const nome = `[iFood] ${String(it.name || 'Item').slice(0, 80)}`;
  const r = db
    .prepare('INSERT INTO items (category_id, name, price, is_kitchen, internal_only) VALUES (?, ?, ?, 1, 1)')
    .run(cat.id, nome, unitPrice);
  salvar.run(key, it.name, r.lastInsertRowid, 1);
  return { itemId: r.lastInsertRowid, mapeado: false };
}

function textoPagamento(order) {
  const p = order.payments || {};
  const metodos = Array.isArray(p.methods) ? p.methods : [];
  if (metodos.length === 0) return '';
  const linhas = metodos.map((m) => {
    const valor = Number(m.value) || 0;
    const bandeira = m.card?.brand ? ` ${m.card.brand}` : '';
    const nome = `${m.method || m.type || 'pagamento'}${bandeira}`;
    if (m.prepaid) return `PAGO NO IFOOD (${nome})`;
    const troco = m.cash?.changeFor ? ` — troco para R$ ${Number(m.cash.changeFor).toFixed(2).replace('.', ',')}` : '';
    return `COBRAR NA ENTREGA: ${nome} R$ ${valor.toFixed(2).replace('.', ',')}${troco}`;
  });
  return linhas.join(' | ');
}

/** Cupons/descontos do pedido e quem arca com o custo (iFood ou Loja). */
function textoCupons(order) {
  const beneficios = Array.isArray(order.benefits) ? order.benefits : [];
  return beneficios
    .map((b) => {
      const valor = Number(b.value) || 0;
      if (!valor) return '';
      const quem = (Array.isArray(b.sponsorshipValues) ? b.sponsorshipValues : [])
        .map((sv) => `${String(sv.name || '').toUpperCase() === 'MERCHANT' ? 'Loja' : 'iFood'} R$ ${Number(sv.value || 0).toFixed(2).replace('.', ',')}`)
        .join(' + ');
      return `CUPOM -R$ ${valor.toFixed(2).replace('.', ',')}${quem ? ` (paga: ${quem})` : ''}`;
    })
    .filter(Boolean)
    .join(' | ');
}

function textoDocumento(order) {
  const doc = order.customer?.documentNumber || order.customer?.taxPayerIdentificationNumber || order.taxPayerIdentificationNumber;
  return doc ? `CPF/CNPJ na nota: ${doc}` : '';
}

function observacoesDoItem(it) {
  const partes = [];
  const opcoes = Array.isArray(it.options) ? it.options : [];
  for (const o of opcoes) {
    const q = Number(o.quantity) > 1 ? `${o.quantity}x ` : '';
    partes.push(`${q}${o.name}`);
  }
  const base = partes.length ? `com: ${partes.join(', ')}` : '';
  const obs = String(it.observations || '').trim();
  return [base, obs].filter(Boolean).join(' · ') || null;
}

/**
 * Importa um pedido do iFood. Idempotente: o mesmo id externo nunca cria dois pedidos.
 * @returns {{duplicado:boolean, orderId:number, comandaId:number, itensNaoMapeados:string[]}}
 */
export function importarPedidoIfood(db, order, { avisar = true } = {}) {
  const externalId = String(order?.id || '').trim();
  if (!externalId) throw new Error('Pedido do iFood sem id');
  const itens = Array.isArray(order.items) ? order.items : [];
  if (itens.length === 0) throw new Error('Pedido do iFood sem itens');

  const existente = db.prepare("SELECT id, comanda_id FROM orders WHERE origem = 'ifood' AND external_id = ?").get(externalId);
  if (existente) return { duplicado: true, orderId: existente.id, comandaId: existente.comanda_id, itensNaoMapeados: [] };

  const retirada = String(order.orderType || '').toUpperCase() === 'TAKEOUT' || order.delivery?.mode === 'TAKEOUT';
  const tipo = retirada ? 'retirada' : 'delivery';
  const ref = String(order.displayId || externalId.slice(0, 6)).trim();
  const cliente = order.customer || {};
  const nome = String(cliente.name || 'Cliente iFood').trim();
  const telefone = String(cliente.phone?.number || cliente.phone || '').replace(/\D/g, '') || '0';
  const end = order.delivery?.deliveryAddress || {};
  const total = Number(order.total?.orderAmount);
  const naoMapeados = [];

  const linhas = itens.map((it) => {
    const qtd = Math.max(1, Math.floor(Number(it.quantity) || 1));
    const totalLinha = Number(it.totalPrice ?? it.price ?? (Number(it.unitPrice) || 0) * qtd + (Number(it.optionsPrice) || 0));
    return { it, qtd, unit: reais(Math.round(cents(totalLinha) / qtd)) };
  });
  const somaItens = linhas.reduce((s, l) => s + cents(l.unit) * l.qtd, 0);
  const valorTotal = Number.isFinite(total) && total > 0 ? total : reais(somaItens);

  const obsPedido = [
    `iFood #${ref}`,
    textoPagamento(order),
    textoCupons(order),
    order.delivery?.pickupCode ? `CÓDIGO DE COLETA: ${order.delivery.pickupCode}` : '',
    order.delivery?.observations ? `ENTREGA: ${order.delivery.observations}` : '',
    textoDocumento(order),
    order.extraInfo,
  ].filter(Boolean).join(' · ');

  const run = db.transaction(() => {
    const itensPdv = linhas.map(({ it, qtd, unit }) => {
      const r = resolverItem(db, it, unit);
      if (!r.mapeado) naoMapeados.push(it.name);
      return { item_id: r.itemId, quantity: qtd, unit_price: unit, observations: observacoesDoItem(it) };
    });

    const info = db.prepare(`
      INSERT INTO orders (tipo, status, cliente_nome, cliente_telefone, observacoes,
        endereco_rua, endereco_numero, endereco_complemento, endereco_bairro, endereco_referencia,
        valor_total, forma_pagamento, payment_status, comanda_id, origem, external_id, external_ref, entrega_prevista)
      VALUES (?, 'recebido', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ifood', ?, NULL, 'ifood', ?, ?, ?)
    `).run(
      tipo, nome, telefone, obsPedido,
      retirada ? null : end.streetName || end.formattedAddress || null,
      retirada ? null : end.streetNumber || null,
      retirada ? null : end.complement || null,
      retirada ? null : end.neighborhood || null,
      retirada ? null : end.reference || null,
      valorTotal,
      Number(order.payments?.pending) > 0 ? 'pendente' : 'aprovado',
      externalId, ref,
      order.delivery?.deliveryDateTime || order.preparationStartDateTime || null,
    );
    const orderId = Number(info.lastInsertRowid);
    db.prepare('UPDATE orders SET telefone_normalizado = ?, entrega_por = ? WHERE id = ?')
      .run(telefone.replace(/^55(?=\d{10,11}$)/, ''), order.delivery?.deliveredBy || null, orderId);

    const comandaId = db.prepare('SELECT COALESCE(MAX(id), 200) + 1 AS next FROM comandas WHERE id >= 200').get().next;
    db.prepare(`
      INSERT INTO comandas (id, mesa, status, origin_order_id, tipo_online, cliente_nome, cliente_telefone,
        endereco_rua, endereco_numero, endereco_complemento, endereco_bairro, endereco_referencia, observation, origem, origem_ref)
      VALUES (?, ?, 'ordering', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ifood', ?)
    `).run(
      comandaId, `iFood #${ref}`, orderId, tipo, nome, telefone,
      retirada ? null : end.streetName || end.formattedAddress || null,
      retirada ? null : end.streetNumber || null,
      retirada ? null : end.complement || null,
      retirada ? null : end.neighborhood || null,
      retirada ? null : end.reference || null,
      obsPedido, ref,
    );
    db.prepare('UPDATE orders SET comanda_id = ? WHERE id = ?').run(comandaId, orderId);

    const insItem = db.prepare(
      'INSERT INTO order_items (order_id, item_id, quantity, unit_price, observations) VALUES (?, ?, ?, ?, ?)',
    );
    for (const p of itensPdv) insItem.run(orderId, p.item_id, p.quantity, p.unit_price, p.observations);
    dispatchItemsToSectors(db, comandaId, itensPdv.map((p) => ({ ...p, prato_feito_espetinho_id: null })));
    return { orderId, comandaId };
  });
  const { orderId, comandaId } = run();

  if (avisar) {
    broadcastAll('pedidos', {});
    broadcastAll('comandas', {});
    broadcastAll('novo-pedido-online', {
      orderId, comandaId, tipo, origem: 'ifood', origem_ref: ref,
      cliente_nome: nome, cliente_telefone: telefone, valor_total: valorTotal,
    });
  }
  return { duplicado: false, orderId, comandaId, itensNaoMapeados: naoMapeados };
}

/** Cancelamento vindo do iFood (cliente ou loja cancelou lá): reflete no PDV. */
export function cancelarPedidoIfood(db, externalId, motivo = 'Cancelado no iFood') {
  const o = db.prepare("SELECT id, status FROM orders WHERE origem = 'ifood' AND external_id = ?").get(String(externalId));
  if (!o || o.status === 'cancelado' || o.status === 'entregue') return false;
  db.prepare(`UPDATE orders SET status = 'cancelado', motivo_cancelamento = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(motivo, o.id);
  broadcastAll('orders', {});
  broadcastAll('comandas', {});
  return true;
}

// ───────────────────────── Cliente da API ─────────────────────────

/**
 * Modo de operação:
 * - 'portal' (padrão): o aceite e as etapas ficam no portal/aplicativo do iFood. O PDV só RECEBE: o pedido aparece
 *   na produção quando é aceito lá (evento CFM) e acompanha os status que mudarem no iFood.
 * - 'integrado': o PDV confirma o pedido ao recebê-lo e envia preparo/pronto/despacho/cancelamento ao iFood
 *   (necessário para homologar a integração).
 */
export function modoIfood(env = process.env) {
  return String(env.IFOOD_MODO || '').toLowerCase() === 'integrado' ? 'integrado' : 'portal';
}

export function ifoodConfigurado(env = process.env) {
  return Boolean(env.IFOOD_CLIENT_ID && env.IFOOD_CLIENT_SECRET);
}

/** Ação do iFood para cada status do PDV (confirmar, iniciar preparo, pronto, despachar). */
const ACAO_POR_STATUS = {
  recebido: 'confirm',
  em_producao: 'startPreparation',
  pronto: 'readyToPickup',
  saiu_entrega: 'dispatch',
};

/** Pedidos para os quais já enviamos readyToPickup (compartilhado entre instâncias do cliente). */
const prontos = new Set();

export function criarClienteIfood({ clientId, clientSecret, baseUrl = IFOOD_API_BASE, fetchImpl = fetch } = {}) {
  let token = null;
  let expira = 0;

  async function autenticar() {
    if (token && Date.now() < expira) return token;
    const r = await fetchImpl(`${baseUrl}/authentication/v1.0/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grantType: 'client_credentials', clientId, clientSecret }).toString(),
    });
    if (!r.ok) throw new Error(`iFood autenticação ${r.status}`);
    const d = await r.json();
    token = d.accessToken;
    expira = Date.now() + (Number(d.expiresIn) || 3600) * 1000;
    return token;
  }

  async function chamar(caminho, opcoes = {}, tentouRenovar = false) {
    const t = await autenticar();
    const r = await fetchImpl(`${baseUrl}${caminho}`, {
      ...opcoes,
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(opcoes.headers || {}) },
    });
    if (r.status === 401 && !tentouRenovar) {
      token = null; // token expirado/revogado: renova uma vez
      return chamar(caminho, opcoes, true);
    }
    if (r.status === 204) return null;
    if (!r.ok) {
      const erro = new Error(`iFood ${caminho} ${r.status}`);
      erro.status = r.status;
      throw erro;
    }
    const texto = await r.text();
    return texto ? JSON.parse(texto) : null;
  }

  return {
    autenticar,
    eventos: async () => (await chamar('/events/v1.0/events:polling')) || [],
    confirmarEventos: async (ids) => {
      for (let i = 0; i < ids.length; i += 2000) {
        await chamar('/events/v1.0/events/acknowledgment', {
          method: 'POST',
          body: JSON.stringify(ids.slice(i, i + 2000).map((id) => ({ id }))),
        });
      }
    },
    motivosCancelamento: (id) => chamar(`/order/v1.0/orders/${encodeURIComponent(id)}/cancellationReasons`),
    cancelar: (id, codigo, motivo) =>
      chamar(`/order/v1.0/orders/${encodeURIComponent(id)}/requestCancellation`, {
        method: 'POST',
        body: JSON.stringify({ reason: String(motivo || 'Cancelado pelo restaurante').slice(0, 200), cancellationCode: String(codigo) }),
      }),
    pedido: (id) => chamar(`/order/v1.0/orders/${encodeURIComponent(id)}`),
    acao: (id, acao) => chamar(`/order/v1.0/orders/${encodeURIComponent(id)}/${acao}`, { method: 'POST' }),
    avisarStatus: async (externalId, statusPdv, { entregaPor } = {}) => {
      const acao = ACAO_POR_STATUS[statusPdv];
      if (!acao) return false;
      // Entrega feita pela logística do iFood: quem despacha é o iFood; o PDV só acompanha os eventos.
      if (acao === 'dispatch' && String(entregaPor || '').toUpperCase() === 'IFOOD') return false;
      // Entrega própria: o iFood exige "pronto" antes de "saiu para entrega".
      if (acao === 'dispatch' && !prontos.has(externalId)) {
        await chamar(`/order/v1.0/orders/${encodeURIComponent(externalId)}/readyToPickup`, { method: 'POST' }).catch(() => {});
      }
      if (acao === 'readyToPickup') prontos.add(externalId);
      await chamar(`/order/v1.0/orders/${encodeURIComponent(externalId)}/${acao}`, { method: 'POST' });
      return true;
    },
  };
}

export const estadoIfood = { ultimoPolling: null, ultimoErro: null, importados: 0 };

const STATUS_POR_EVENTO = { RTP: 'pronto', DSP: 'saiu_entrega', CON: 'entregue' };
const ORDEM_STATUS = ['recebido', 'em_producao', 'pronto', 'saiu_entrega', 'entregue'];

/** Outro sistema (ou o portal do iFood) mudou o status: o PDV acompanha, sem voltar etapas nem tocar em cancelados. */
export function sincronizarStatusIfood(db, externalId, novo) {
  const o = db.prepare("SELECT id, status FROM orders WHERE origem = 'ifood' AND external_id = ?").get(String(externalId));
  if (!o || o.status === 'cancelado' || o.status === 'entregue') return false;
  if (ORDEM_STATUS.indexOf(novo) <= ORDEM_STATUS.indexOf(o.status)) return false;
  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(novo, o.id);
  if (novo === 'entregue') db.prepare("UPDATE orders SET delivered_at = COALESCE(delivered_at, datetime('now','localtime')) WHERE id = ?").run(o.id);
  broadcastAll('orders', {});
  broadcastAll('comandas', {});
  return true;
}

/** Uma rodada: baixa os eventos, importa pedidos novos, aplica cancelamentos e confirma tudo. */
export async function processarEventosIfood(db, cliente, { modo = modoIfood() } = {}) {
  const eventos = await cliente.eventos();
  const reconhecer = [];
  for (const ev of eventos) {
    try {
      const orderId = ev.orderId;
      if (ev.code === 'CFM' && orderId) {
        // Aceito (no portal ou por outro sistema): entra na produção. Idempotente.
        const r = importarPedidoIfood(db, await cliente.pedido(orderId));
        if (!r.duplicado) estadoIfood.importados += 1;
      } else if (ev.code === 'PLC' && orderId && modo === 'integrado') {
        const pedido = await cliente.pedido(orderId);
        const r = importarPedidoIfood(db, pedido);
        if (!r.duplicado) estadoIfood.importados += 1;
        // O iFood exige confirmar em até 8 minutos. Se falhar, o evento não é confirmado e volta no próximo ciclo.
        try {
          await cliente.acao(orderId, 'confirm');
        } catch (e) {
          if (![400, 409, 422].includes(e.status)) throw e; // já confirmado por outro caminho
        }
      } else if (STATUS_POR_EVENTO[ev.code] && orderId) {
        sincronizarStatusIfood(db, orderId, STATUS_POR_EVENTO[ev.code]);
      } else if ((ev.code === 'CAN' || ev.code === 'CANCELLED') && orderId) {
        cancelarPedidoIfood(db, orderId);
      }
      reconhecer.push(ev.id);
    } catch (e) {
      // Não confirma o evento: o iFood o entrega de novo na próxima consulta.
      estadoIfood.ultimoErro = `${new Date().toLocaleString('pt-BR')}: ${e.message}`;
      console.warn('[iFood] falha ao processar evento', ev?.id, e.message);
    }
  }
  await cliente.confirmarEventos(reconhecer);
  estadoIfood.ultimoPolling = new Date().toISOString();
  return { eventos: eventos.length, confirmados: reconhecer.length };
}

export function iniciarPollingIfood(db, cliente, { intervaloMs = 30_000 } = {}) {
  let rodando = false;
  const tick = async () => {
    if (rodando) return;
    rodando = true;
    try {
      await processarEventosIfood(db, cliente);
    } catch (e) {
      estadoIfood.ultimoErro = `${new Date().toLocaleString('pt-BR')}: ${e.message}`;
      console.warn('[iFood] polling:', e.message);
    } finally {
      rodando = false;
    }
  };
  tick();
  const timer = setInterval(tick, intervaloMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

/** Pedido fictício no formato do iFood, usando itens reais do cardápio (para ver na produção sem credenciais). */
export function pedidoIfoodDeExemplo(db) {
  const itens = db
    .prepare(`
      SELECT i.id, i.name, i.price FROM items i
      WHERE COALESCE(i.internal_only, 0) = 0 AND i.price > 0 AND (i.is_grill = 1 OR i.is_kitchen = 1 OR i.is_bar = 1)
      ORDER BY i.id LIMIT 3
    `)
    .all();
  const seq = Date.now().toString(36);
  const linhas = itens.map((i, n) => ({
    id: `item-${n}`,
    name: i.name,
    quantity: n === 0 ? 2 : 1,
    unitPrice: i.price,
    price: i.price * (n === 0 ? 2 : 1),
    totalPrice: i.price * (n === 0 ? 2 : 1),
    observations: n === 0 ? 'sem cebola' : '',
  }));
  const subtotal = linhas.reduce((s, l) => s + l.totalPrice, 0);
  return {
    id: `sim-${seq}`,
    displayId: String(Math.floor(1000 + Math.random() * 9000)),
    orderType: 'DELIVERY',
    customer: { name: 'Cliente iFood (teste)', phone: { number: '41999990000' } },
    delivery: {
      deliveryAddress: { streetName: 'Rua das Flores', streetNumber: '123', neighborhood: 'Centro', complement: 'Ap 4', reference: 'Portão azul' },
    },
    items: linhas,
    total: { subTotal: subtotal, deliveryFee: 6, orderAmount: subtotal + 6 },
    payments: { prepaid: 0, pending: subtotal + 6, methods: [{ method: 'CASH', type: 'OFFLINE', value: subtotal + 6, prepaid: false, cash: { changeFor: 100 } }] },
  };
}

/** Cancela no iFood um pedido cancelado no PDV. Sem código informado, usa o primeiro motivo aceito pelo iFood. */
export async function cancelarNoIfood(cliente, externalId, { codigo, motivo } = {}) {
  let cod = codigo;
  if (!cod) {
    const motivos = await cliente.motivosCancelamento(externalId);
    cod = motivos?.[0]?.cancelCodeId ?? motivos?.[0]?.code;
    if (!cod) throw new Error('iFood não devolveu motivos de cancelamento');
  }
  await cliente.cancelar(externalId, cod, motivo);
  return cod;
}
