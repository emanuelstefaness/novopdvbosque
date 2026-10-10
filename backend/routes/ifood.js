import { Router } from 'express';
import { importarPedidoIfood, pedidoIfoodDeExemplo, ifoodConfigurado, estadoIfood, criarClienteIfood, modoIfood } from '../ifood.js';

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
      SELECT m.external_key, m.external_name, m.item_id, m.auto_created, i.name AS item_name
      FROM ifood_item_map m LEFT JOIN items i ON i.id = m.item_id
      ORDER BY m.auto_created DESC, m.external_name
    `)
    .all();
  res.json(rows);
});

ifoodRouter.put('/mapa', (req, res) => {
  const db = getDb(req);
  const key = String(req.body?.external_key || '').trim();
  const itemId = Number(req.body?.item_id);
  const item = db.prepare('SELECT id FROM items WHERE id = ?').get(itemId);
  if (!key || !item) return res.status(400).json({ error: 'Informe external_key e um item_id válido.' });
  db.prepare(`
    INSERT INTO ifood_item_map (external_key, item_id, auto_created) VALUES (?, ?, 0)
    ON CONFLICT(external_key) DO UPDATE SET item_id = excluded.item_id, auto_created = 0, updated_at = datetime('now','localtime')
  `).run(key, itemId);
  res.json({ ok: true });
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
