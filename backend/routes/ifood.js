import { Router } from 'express';
import { importarPedidoIfood, pedidoIfoodDeExemplo, ifoodConfigurado, estadoIfood, criarClienteIfood, modoIfood, normalizarNome } from '../ifood.js';
import { getPedidoSector } from '../itemSector.js';

export const ifoodRouter = Router();
const getDb = (req) => req.app.get('db');

ifoodRouter.use((req, res, next) => {
  if (!req.user?.isCaixa) return res.status(403).json({ error: 'Esta operação requer acesso do caixa.' });
  next();
});

// Situação da integração: credenciais, último polling e itens que ainda precisam ser mapeados.
ifoodRouter.get('/status', (req, res) => {
  const db = getDb(req);
  const hoje = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE origem = 'ifood' AND date(created_at) = date('now','localtime')").get().n;
  const naoMapeados = db.prepare('SELECT COUNT(*) AS n FROM ifood_item_map WHERE auto_created = 1').get().n;
  res.json({
    configurado: ifoodConfigurado(),
    modo: modoIfood(),
    ultimo_polling: estadoIfood.ultimoPolling,
    ultimo_erro: estadoIfood.ultimoErro,
    importados_nesta_sessao: estadoIfood.importados,
    pedidos_hoje: hoje,
    itens_nao_mapeados: naoMapeados,
  });
});

// Importa um pedido no formato do iFood (colar do portal / testes). Idempotente pelo id do pedido.
ifoodRouter.post('/pedidos', (req, res) => {
  try {
    const r = importarPedidoIfood(getDb(req), req.body);
    res.status(r.duplicado ? 200 : 201).json(r);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Gera um pedido fictício do iFood para ver o fluxo (produção, comanda, relatórios) sem credenciais.
ifoodRouter.post('/simular', (req, res) => {
  try {
    const exemplo = pedidoIfoodDeExemplo(getDb(req));
    if (!exemplo.items.length) return res.status(400).json({ error: 'Cadastre itens no cardápio antes de simular.' });
    res.status(201).json(importarPedidoIfood(getDb(req), exemplo));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// De-para dos itens do iFood com o cardápio do PDV.
ifoodRouter.get('/mapa', (req, res) => {
  const rows = getDb(req)
    .prepare(`
      SELECT m.external_key, m.external_name, m.item_id, m.auto_created, m.updated_at, i.name AS item_name,
             i.is_grill, i.is_kitchen, i.is_bar, i.is_side, c.slug AS category_slug
      FROM ifood_item_map m
      LEFT JOIN items i ON i.id = m.item_id
      LEFT JOIN categories c ON c.id = i.category_id
      ORDER BY m.auto_created DESC, m.external_name
    `)
    .all()
    .map(({ is_grill, is_kitchen, is_bar, is_side, category_slug, ...m }) => ({
      ...m,
      // Item interno "[iFood] ..." (ainda não ligado) cai na Cozinha.
      setor: getPedidoSector({ is_grill, is_kitchen, is_bar, is_side, category_slug }),
    }));
  res.json(rows);
});

// Itens do PDV que podem ser escolhidos no de-para (cardápio de verdade, com o setor de produção de cada um).
ifoodRouter.get('/itens-pdv', (req, res) => {
  const rows = getDb(req)
    .prepare(`
      SELECT i.id, i.name, i.price, c.name AS category_name, c.slug AS category_slug,
             i.is_grill, i.is_kitchen, i.is_bar, i.is_side
      FROM items i JOIN categories c ON c.id = i.category_id
      WHERE COALESCE(i.internal_only, 0) = 0 AND i.name NOT LIKE '[iFood]%'
        AND (i.is_grill = 1 OR i.is_kitchen = 1 OR i.is_bar = 1 OR i.is_side = 1)
      ORDER BY c.sort_order, c.name, i.name
    `)
    .all()
    .map(({ is_grill, is_kitchen, is_bar, is_side, category_slug, ...i }) => ({
      ...i,
      setor: getPedidoSector({ is_grill, is_kitchen, is_bar, is_side, category_slug }),
    }));
  res.json(rows);
});

ifoodRouter.put('/mapa', (req, res) => {
  const db = getDb(req);
  const nome = String(req.body?.external_name || '').trim();
  const key = String(req.body?.external_key || '').trim() || (nome ? `name:${normalizarNome(nome)}` : '');
  const itemId = Number(req.body?.item_id);
  const item = db.prepare('SELECT id FROM items WHERE id = ?').get(itemId);
  if (!key || !item) return res.status(400).json({ error: 'Informe o item do iFood e um item do PDV válido.' });
  db.prepare(`
    INSERT INTO ifood_item_map (external_key, external_name, item_id, auto_created) VALUES (?, ?, ?, 0)
    ON CONFLICT(external_key) DO UPDATE SET item_id = excluded.item_id, auto_created = 0,
      external_name = COALESCE(ifood_item_map.external_name, excluded.external_name), updated_at = datetime('now','localtime')
  `).run(key, nome || null, itemId);
  res.json({ ok: true, external_key: key });
});

// Motivos de cancelamento aceitos pelo iFood para um pedido (a tela de cancelar deve exibi-los).
ifoodRouter.get('/pedidos/:id/motivos-cancelamento', async (req, res) => {
  const o = getDb(req).prepare("SELECT external_id FROM orders WHERE id = ? AND origem = 'ifood'").get(Number(req.params.id));
  if (!o) return res.status(404).json({ error: 'Pedido do iFood não encontrado' });
  if (!ifoodConfigurado()) return res.status(503).json({ error: 'Integração com o iFood não configurada' });
  try {
    const cliente = criarClienteIfood({ clientId: process.env.IFOOD_CLIENT_ID, clientSecret: process.env.IFOOD_CLIENT_SECRET, baseUrl: process.env.IFOOD_API_BASE || undefined });
    res.json(await cliente.motivosCancelamento(o.external_id));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});
